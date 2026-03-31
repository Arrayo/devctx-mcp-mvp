import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHeadlessWrapper } from '../src/orchestration/headless-wrapper.js';
import { smartSummary } from '../src/tools/smart-summary.js';
import { projectRoot, setProjectRoot } from '../src/utils/runtime-config.js';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const SKIP_SQLITE_TESTS = nodeMajor < 22;

const originalProjectRoot = projectRoot;
let wrapperTestRoot = null;

before(() => {
  if (SKIP_SQLITE_TESTS) return;
  wrapperTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-headless-wrapper-'));
  setProjectRoot(wrapperTestRoot);
  execFileSync('git', ['init'], { cwd: wrapperTestRoot, stdio: 'ignore' });
});

after(() => {
  if (SKIP_SQLITE_TESTS) return;
  setProjectRoot(originalProjectRoot);
  if (wrapperTestRoot) {
    fs.rmSync(wrapperTestRoot, { recursive: true, force: true });
  }
});

test('headless wrapper builds an enriched prompt in dry-run mode', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const result = await runHeadlessWrapper({
    client: 'codex',
    prompt: 'Finish the wrapper orchestration layer and keep the persisted context aligned',
    command: 'codex',
    args: ['exec'],
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.args[0], 'exec');
  assert.match(result.wrappedPrompt, /persisted devctx project context/i);
  assert.match(result.wrappedPrompt, /next tools:/i);
  assert.ok(result.sessionId);

  await smartSummary({ action: 'reset', sessionId: result.sessionId });
});

test('headless wrapper checkpoints the run after a successful child command', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const result = await runHeadlessWrapper({
    client: 'qwen',
    prompt: 'Summarize the next concrete step after running the wrapper command',
    command: 'fake-agent',
    args: ['run'],
    runCommand: async () => ({
      exitCode: 0,
      signal: null,
      stdout: 'Next step: review the generated wrapper docs and validate the session summary.',
      stderr: '',
    }),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.end.phase, 'end');
  assert.equal(result.end.checkpoint.skipped, false);
  assert.equal(result.end.checkpoint.checkpoint.event, 'session_end');

  const summary = await smartSummary({
    action: 'get',
    sessionId: result.sessionId,
  });

  assert.match(summary.summary.nextStep, /review the generated wrapper docs/i);
  await smartSummary({ action: 'reset', sessionId: result.sessionId });
});

test('headless wrapper isolates a new session when continuity is only a weak partial match', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'existing-wrapper-session',
    update: {
      goal: 'Implement SQLite migration workflow',
      status: 'in_progress',
      currentFocus: 'migration workflow',
      nextStep: 'Finish the migration checklist',
    },
  });

  const result = await runHeadlessWrapper({
    client: 'codex',
    prompt: 'Smoke test the unrelated headless wrapper behaviour',
    command: 'fake-agent',
    args: ['run'],
    runCommand: async () => ({
      exitCode: 0,
      signal: null,
      stdout: 'Completed without an explicit next step.',
      stderr: '',
    }),
  });

  assert.equal(result.isolatedSession, true);
  assert.notEqual(result.sessionId, 'existing-wrapper-session');

  const existing = await smartSummary({
    action: 'get',
    sessionId: 'existing-wrapper-session',
  });
  assert.match(existing.summary.currentFocus, /migration workflow/i);

  await smartSummary({ action: 'reset', sessionId: 'existing-wrapper-session' });
  await smartSummary({ action: 'reset', sessionId: result.sessionId });
});

test('headless wrapper includes repo-safety remediation in the wrapped prompt when SQLite writes are blocked', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'wrapper-blocked-session',
    update: {
      goal: 'Blocked wrapper run',
      status: 'in_progress',
      nextStep: 'Fix git hygiene before continuing',
    },
  });

  fs.writeFileSync(path.join(wrapperTestRoot, '.gitignore'), '.devctx/\n', 'utf8');
  execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: wrapperTestRoot, stdio: 'ignore' });

  try {
    const result = await runHeadlessWrapper({
      client: 'codex',
      prompt: 'Continue the blocked wrapper flow safely',
      command: 'codex',
      args: ['exec'],
      sessionId: 'wrapper-blocked-session',
      dryRun: true,
    });

    assert.match(result.wrappedPrompt, /repo safety:/i);
    assert.match(result.wrappedPrompt, /fix:/i);
    assert.match(result.wrappedPrompt, /next tools:/i);
  } finally {
    execFileSync('git', ['rm', '--cached', '-f', '.devctx/state.sqlite'], { cwd: wrapperTestRoot, stdio: 'ignore' });
    await smartSummary({ action: 'reset', sessionId: 'wrapper-blocked-session' });
  }
});
