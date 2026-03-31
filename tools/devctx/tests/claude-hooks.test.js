import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { handleClaudeHookEvent } from '../src/hooks/claude-hooks.js';
import {
  deleteHookTurnState,
  getHookTurnState,
  setHookTurnState,
} from '../src/storage/sqlite.js';
import { smartSummary } from '../src/tools/smart-summary.js';
import { projectRoot, setProjectRoot } from '../src/utils/runtime-config.js';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const SKIP_SQLITE_TESTS = nodeMajor < 22;

const originalProjectRoot = projectRoot;
let hookTestRoot = null;

before(() => {
  if (SKIP_SQLITE_TESTS) return;
  hookTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-claude-hooks-'));
  setProjectRoot(hookTestRoot);
  execFileSync('git', ['init'], { cwd: hookTestRoot, stdio: 'ignore' });
});

after(() => {
  if (SKIP_SQLITE_TESTS) return;
  setProjectRoot(originalProjectRoot);
  if (hookTestRoot) {
    fs.rmSync(hookTestRoot, { recursive: true, force: true });
  }
});

test('claude UserPromptSubmit hook rehydrates context and tracks the turn in SQLite', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const response = await handleClaudeHookEvent({
    hook_event_name: 'UserPromptSubmit',
    session_id: 'claude-hook-user-prompt',
    prompt: 'Design native Claude hooks so every meaningful turn rehydrates context and checkpoints progress automatically',
  });

  assert.ok(response?.hookSpecificOutput?.additionalContext);
  assert.match(response.hookSpecificOutput.additionalContext, /devctx/i);

  const state = await getHookTurnState({
    hookKey: 'claude:main:claude-hook-user-prompt',
  });

  assert.ok(state);
  assert.equal(state.requireCheckpoint, true);
  assert.ok(typeof state.projectSessionId === 'string' && state.projectSessionId.length > 0);

  await smartSummary({ action: 'reset', sessionId: state.projectSessionId });
  await deleteHookTurnState({ hookKey: 'claude:main:claude-hook-user-prompt' });
});

test('claude UserPromptSubmit hook does not persist hook state when repo safety blocks SQLite writes', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'claude-hook-blocked-session',
    update: {
      goal: 'Blocked hook state persistence',
      status: 'in_progress',
      currentFocus: 'Repo safety',
    },
  });

  fs.writeFileSync(path.join(hookTestRoot, '.gitignore'), '.devctx/\n', 'utf8');
  execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: hookTestRoot, stdio: 'ignore' });
  try {
    const response = await handleClaudeHookEvent({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'claude-hook-blocked',
      prompt: 'Continue the blocked hook turn and preserve context safely',
    });

    assert.match(response?.hookSpecificOutput?.additionalContext ?? '', /context writes are blocked/i);

    const state = await getHookTurnState({
      hookKey: 'claude:main:claude-hook-blocked',
      readOnly: true,
    });
    assert.equal(state, null);
  } finally {
    execFileSync('git', ['rm', '--cached', '-f', '.devctx/state.sqlite'], { cwd: hookTestRoot, stdio: 'ignore' });
    await smartSummary({ action: 'reset', sessionId: 'claude-hook-blocked-session' });
  }
});

test('claude PostToolUse hook marks devctx end-of-turn checkpoints', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await setHookTurnState({
    hookKey: 'claude:main:claude-hook-post-tool',
    state: {
      client: 'claude',
      claudeSessionId: 'claude-hook-post-tool',
      projectSessionId: 'project-hook-post-tool',
      turnId: 'turn-1',
      promptPreview: 'Persist the current turn',
      continuityState: 'aligned',
      requireCheckpoint: true,
      promptMeaningful: true,
      checkpointed: false,
      touchedFiles: [],
      meaningfulWriteCount: 0,
    },
  });

  await handleClaudeHookEvent({
    hook_event_name: 'PostToolUse',
    session_id: 'claude-hook-post-tool',
    tool_name: 'mcp__devctx__smart_turn',
    tool_input: {
      phase: 'end',
      event: 'milestone',
    },
    tool_response: {},
  });

  const state = await getHookTurnState({
    hookKey: 'claude:main:claude-hook-post-tool',
  });

  assert.equal(state.checkpointed, true);
  assert.equal(state.checkpointEvent, 'milestone');

  await deleteHookTurnState({ hookKey: 'claude:main:claude-hook-post-tool' });
});

test('claude Stop hook blocks once and then auto-appends carryover on the second stop', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'claude-hook-stop-session',
    update: {
      goal: 'Hook stop enforcement',
      status: 'in_progress',
      currentFocus: 'Testing stop hooks',
    },
  });

  await setHookTurnState({
    hookKey: 'claude:main:claude-hook-stop',
    state: {
      client: 'claude',
      claudeSessionId: 'claude-hook-stop',
      projectSessionId: 'claude-hook-stop-session',
      turnId: 'turn-stop',
      promptPreview: 'Implement Claude stop enforcement for uncheckpointed turns',
      continuityState: 'aligned',
      requireCheckpoint: true,
      promptMeaningful: true,
      checkpointed: false,
      touchedFiles: ['tools/devctx/src/hooks/claude-hooks.js'],
      meaningfulWriteCount: 1,
    },
  });

  const firstStop = await handleClaudeHookEvent({
    hook_event_name: 'Stop',
    session_id: 'claude-hook-stop',
    stop_hook_active: false,
    last_assistant_message: 'Implemented the hook runner changes.',
  });

  assert.equal(firstStop?.decision, 'block');
  assert.match(firstStop?.reason ?? '', /smart_turn phase=end/i);

  const secondStop = await handleClaudeHookEvent({
    hook_event_name: 'Stop',
    session_id: 'claude-hook-stop',
    stop_hook_active: true,
    last_assistant_message: 'Next step: run the full test suite and review the generated Claude hook config.',
  });

  assert.equal(secondStop, null);

  const state = await getHookTurnState({
    hookKey: 'claude:main:claude-hook-stop',
  });
  assert.equal(state, null);

  const summary = await smartSummary({
    action: 'get',
    sessionId: 'claude-hook-stop-session',
  });

  assert.match(summary.summary.nextStep, /run the full test suite/i);
  assert.ok(summary.summary.hotFiles.some((filePath) => filePath.includes('claude-hooks.js')));

  await smartSummary({ action: 'reset', sessionId: 'claude-hook-stop-session' });
});

test('claude Stop hook ignores low-signal turns without writes or concrete carryover', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await setHookTurnState({
    hookKey: 'claude:main:claude-hook-stop-trivial',
    state: {
      client: 'claude',
      claudeSessionId: 'claude-hook-stop-trivial',
      projectSessionId: 'claude-hook-stop-trivial-session',
      turnId: 'turn-stop-trivial',
      promptPreview: 'Review the existing context briefly',
      continuityState: 'aligned',
      requireCheckpoint: true,
      promptMeaningful: true,
      checkpointed: false,
      touchedFiles: [],
      meaningfulWriteCount: 0,
    },
  });

  const result = await handleClaudeHookEvent({
    hook_event_name: 'Stop',
    session_id: 'claude-hook-stop-trivial',
    stop_hook_active: false,
    last_assistant_message: 'I inspected the current setup and there is nothing to persist yet.',
  });

  assert.equal(result, null);

  const state = await getHookTurnState({
    hookKey: 'claude:main:claude-hook-stop-trivial',
  });
  assert.equal(state, null);
});

test('claude Stop hook does not demand a checkpoint when repo safety blocks SQLite mutations', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'claude-hook-stop-blocked-session',
    update: {
      goal: 'Blocked stop hook',
      status: 'in_progress',
    },
  });

  await setHookTurnState({
    hookKey: 'claude:main:claude-hook-stop-blocked',
    state: {
      client: 'claude',
      claudeSessionId: 'claude-hook-stop-blocked',
      projectSessionId: 'claude-hook-stop-blocked-session',
      turnId: 'turn-stop-blocked',
      promptPreview: 'Blocked hook stop handling',
      continuityState: 'aligned',
      requireCheckpoint: true,
      promptMeaningful: true,
      checkpointed: false,
      touchedFiles: ['tools/devctx/src/hooks/claude-hooks.js'],
      meaningfulWriteCount: 1,
    },
  });

  fs.writeFileSync(path.join(hookTestRoot, '.gitignore'), '.devctx/\n', 'utf8');
  execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: hookTestRoot, stdio: 'ignore' });

  try {
    const result = await handleClaudeHookEvent({
      hook_event_name: 'Stop',
      session_id: 'claude-hook-stop-blocked',
      stop_hook_active: false,
      last_assistant_message: 'There is blocked state that would normally require a checkpoint.',
    });

    assert.equal(result, null);
  } finally {
    execFileSync('git', ['rm', '--cached', '-f', '.devctx/state.sqlite'], { cwd: hookTestRoot, stdio: 'ignore' });
    await deleteHookTurnState({ hookKey: 'claude:main:claude-hook-stop-blocked' });
    await smartSummary({ action: 'reset', sessionId: 'claude-hook-stop-blocked-session' });
  }
});
