import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaudeHookKey,
  buildCarryoverUpdate,
  computeStopEnforcement,
  createClaudeAdapter,
  extractTouchedFilesFromToolUse,
  isCheckpointToolUse,
  isMeaningfulPrompt,
} from '../src/orchestration/adapters/claude-adapter.js';

test('isMeaningfulPrompt filters trivial prompts', () => {
  assert.equal(isMeaningfulPrompt('short prompt'), false);
  assert.equal(
    isMeaningfulPrompt('Design native Claude hooks so every meaningful turn rehydrates context'),
    true,
  );
});

test('buildClaudeHookKey supports main and subagent scopes', () => {
  assert.equal(buildClaudeHookKey({ sessionId: 'abc' }), 'claude:main:abc');
  assert.equal(buildClaudeHookKey({ sessionId: 'abc', agentId: 'worker-1' }), 'claude:subagent:abc:worker-1');
});

test('isCheckpointToolUse recognizes smart_turn and smart_summary checkpoint events', () => {
  assert.deepEqual(
    isCheckpointToolUse({
      toolName: 'mcp__devctx__smart_turn',
      toolInput: { phase: 'end', event: 'milestone' },
    }),
    { matched: true, event: 'milestone' },
  );
  assert.deepEqual(
    isCheckpointToolUse({
      toolName: 'mcp__devctx__smart_summary',
      toolInput: { action: 'auto_append' },
    }),
    { matched: true, event: 'auto_append' },
  );
});

test('extractTouchedFilesFromToolUse only tracks write tool file paths', () => {
  assert.deepEqual(
    extractTouchedFilesFromToolUse({
      toolName: 'Write',
      toolInput: { file_path: 'src/a.js' },
      toolResponse: { filePath: 'src/b.js' },
    }),
    ['src/a.js', 'src/b.js'],
  );
  assert.deepEqual(
    extractTouchedFilesFromToolUse({
      toolName: 'Read',
      toolInput: { file_path: 'src/a.js' },
      toolResponse: { filePath: 'src/b.js' },
    }),
    [],
  );
});

test('computeStopEnforcement scores meaningful carryover correctly', () => {
  const result = computeStopEnforcement(
    {
      touchedFiles: ['src/a.js'],
      meaningfulWriteCount: 1,
      continuityState: 'possible_shift',
    },
    'Next step: validate the changes and run the tests before stopping.',
  );
  assert.equal(result.shouldBlock, true);
  assert.ok(result.score >= 3);
  assert.match(result.nextStep, /validate the changes/i);
});

test('buildCarryoverUpdate surfaces prompt preview, touched files, and next step', () => {
  const update = buildCarryoverUpdate(
    {
      promptPreview: 'Implement Claude adapter auto checkpointing',
      touchedFiles: ['src/adapter.js'],
    },
    'Next step: run the Claude adapter tests and review the output.',
  );
  assert.match(update.currentFocus, /Claude adapter/i);
  assert.deepEqual(update.touchedFiles, ['src/adapter.js']);
  assert.match(update.nextStep, /run the Claude adapter tests/i);
});

test('claude adapter UserPromptSubmit uses shared managed start and stores tracked state', async () => {
  const states = new Map();
  const persistedMetrics = [];
  let resolveStartCalled = false;

  const adapter = createClaudeAdapter({
    resolveStart: async ({ prompt }) => {
      resolveStartCalled = true;
      assert.match(prompt, /meaningful turn rehydrates context/i);
      return {
        startResult: {
          sessionId: 'project-session-1',
          continuity: { state: 'aligned' },
          summary: {
            currentFocus: 'Claude adapter',
            nextStep: 'Checkpoint after the next milestone',
          },
          recommendedPath: {
            nextTools: ['smart_context', 'smart_read', 'smart_turn'],
          },
        },
      };
    },
    persistMetric: async (entry) => {
      persistedMetrics.push(entry);
    },
    writeAgentRun: async () => {},
    writeTaskHandoff: async () => {},
    writeHookState: async ({ hookKey, state }) => {
      states.set(hookKey, state);
      return state;
    },
    removeHookState: async ({ hookKey }) => {
      states.delete(hookKey);
      return null;
    },
  });

  const response = await adapter.handleEvent({
    hook_event_name: 'UserPromptSubmit',
    session_id: 'claude-session-1',
    prompt: 'Design native Claude hooks so every meaningful turn rehydrates context and checkpoints progress automatically',
  });

  assert.equal(resolveStartCalled, true);
  assert.ok(response === null || typeof response === 'object');
  assert.ok(states.has('claude:main:claude-session-1'));
  assert.equal(states.get('claude:main:claude-session-1').projectSessionId, 'project-session-1');
  assert.equal(persistedMetrics.length, 1);
  assert.equal(persistedMetrics[0].metadata.managedByClientAdapter, true);
});

test('claude adapter Stop auto-appends carryover and clears state on second stop', async () => {
  const states = new Map([
    ['claude:main:claude-stop', {
      client: 'claude',
      claudeSessionId: 'claude-stop',
      projectSessionId: 'project-stop',
      turnId: 'turn-1',
      promptPreview: 'Implement the Claude adapter stop flow',
      continuityState: 'aligned',
      requireCheckpoint: true,
      promptMeaningful: true,
      checkpointed: false,
      touchedFiles: ['src/adapter.js'],
      meaningfulWriteCount: 1,
    }],
  ]);
  const summaryCalls = [];

  const adapter = createClaudeAdapter({
    summaryTool: async (request) => {
      summaryCalls.push(request);
      return {};
    },
    readHookState: async (hookKey) => states.get(hookKey) ?? null,
    writeHookState: async ({ hookKey, state }) => {
      states.set(hookKey, state);
      return state;
    },
    removeHookState: async ({ hookKey }) => {
      states.delete(hookKey);
      return null;
    },
    persistMetric: async () => {},
    writeAgentRun: async () => {},
    writeTaskHandoff: async () => {},
  });

  const result = await adapter.handleEvent({
    hook_event_name: 'Stop',
    session_id: 'claude-stop',
    stop_hook_active: true,
    last_assistant_message: 'Next step: run the Claude adapter tests and review the generated hook output.',
  });

  assert.equal(result, null);
  assert.equal(summaryCalls.length, 1);
  assert.equal(summaryCalls[0].action, 'auto_append');
  assert.equal(summaryCalls[0].sessionId, 'project-stop');
  assert.match(summaryCalls[0].update.nextStep, /run the Claude adapter tests/i);
  assert.equal(states.has('claude:main:claude-stop'), false);
});
