import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCursorHookKey,
  buildCarryoverUpdate,
  computeStopEnforcement,
  createCursorAdapter,
  extractTouchedFilesFromToolUse,
  isCheckpointToolUse,
  isMeaningfulPrompt,
} from '../src/orchestration/adapters/cursor-adapter.js';

test('isMeaningfulPrompt filters trivial prompts', () => {
  assert.equal(isMeaningfulPrompt('short prompt'), false);
  assert.equal(
    isMeaningfulPrompt('Design native Cursor hooks so every meaningful turn rehydrates context'),
    true,
  );
});

test('buildCursorHookKey supports main and subagent scopes', () => {
  assert.equal(buildCursorHookKey({ conversationId: 'abc' }), 'cursor:main:abc');
  assert.equal(buildCursorHookKey({ conversationId: 'abc', agentId: 'worker-1' }), 'cursor:subagent:abc:worker-1');
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

test('extractTouchedFilesFromToolUse tracks Cursor write tools', () => {
  assert.deepEqual(
    extractTouchedFilesFromToolUse({
      toolName: 'StrReplace',
      toolInput: { path: 'src/a.js' },
      toolResponse: {},
    }),
    ['src/a.js'],
  );
  assert.deepEqual(
    extractTouchedFilesFromToolUse({
      toolName: 'EditNotebook',
      toolInput: { target_notebook: 'notebook.ipynb' },
      toolResponse: {},
    }),
    ['notebook.ipynb'],
  );
  assert.deepEqual(
    extractTouchedFilesFromToolUse({
      toolName: 'Read',
      toolInput: { path: 'src/a.js' },
      toolResponse: {},
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
      promptPreview: 'Implement Cursor adapter auto checkpointing',
      touchedFiles: ['src/adapter.js'],
    },
    'Next step: run the Cursor adapter tests and review the output.',
  );
  assert.match(update.currentFocus, /Cursor adapter/i);
  assert.deepEqual(update.touchedFiles, ['src/adapter.js']);
  assert.match(update.nextStep, /run the Cursor adapter tests/i);
});

test('cursor adapter UserMessageSubmit uses shared managed start and stores tracked state', async () => {
  const states = new Map();
  const persistedMetrics = [];
  let resolveStartCalled = false;

  const adapter = createCursorAdapter({
    resolveStart: async ({ prompt }) => {
      resolveStartCalled = true;
      assert.match(prompt, /meaningful turn rehydrates context/i);
      return {
        startResult: {
          sessionId: 'project-session-1',
          continuity: { state: 'aligned' },
          summary: {
            currentFocus: 'Cursor adapter',
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
    hook_event_name: 'UserMessageSubmit',
    conversation_id: 'cursor-conversation-1',
    user_message: 'Design native Cursor hooks so every meaningful turn rehydrates context and checkpoints progress automatically',
  });

  assert.equal(resolveStartCalled, true);
  assert.ok(response === null || typeof response === 'object');
  assert.ok(states.has('cursor:main:cursor-conversation-1'));
  assert.equal(states.get('cursor:main:cursor-conversation-1').projectSessionId, 'project-session-1');
  assert.equal(persistedMetrics.length, 1);
  assert.equal(persistedMetrics[0].metadata.managedByClientAdapter, true);
  assert.equal(persistedMetrics[0].metadata.client, 'cursor');
});

test('cursor adapter ConversationEnd auto-appends carryover and clears state', async () => {
  const states = new Map([
    ['cursor:main:cursor-end', {
      client: 'cursor',
      cursorConversationId: 'cursor-end',
      projectSessionId: 'project-end',
      turnId: 'turn-1',
      promptPreview: 'Implement the Cursor adapter end flow',
      continuityState: 'aligned',
      requireCheckpoint: true,
      promptMeaningful: true,
      checkpointed: false,
      touchedFiles: ['src/adapter.js'],
      meaningfulWriteCount: 1,
    }],
  ]);
  const summaryCalls = [];

  const adapter = createCursorAdapter({
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
    hook_event_name: 'ConversationEnd',
    conversation_id: 'cursor-end',
    end_hook_active: true,
    last_assistant_message: 'Next step: run the Cursor adapter tests and review the generated hook output.',
  });

  assert.equal(result, null);
  assert.equal(summaryCalls.length, 1);
  assert.equal(summaryCalls[0].action, 'auto_append');
  assert.equal(summaryCalls[0].sessionId, 'project-end');
  assert.match(summaryCalls[0].update.nextStep, /run the Cursor adapter tests/i);
  assert.equal(states.has('cursor:main:cursor-end'), false);
});

test('cursor adapter blocks ConversationEnd when checkpoint is missing', async () => {
  const states = new Map([
    ['cursor:main:cursor-blocked', {
      client: 'cursor',
      cursorConversationId: 'cursor-blocked',
      projectSessionId: 'project-blocked',
      turnId: 'turn-1',
      promptPreview: 'Implement feature without checkpoint',
      continuityState: 'aligned',
      requireCheckpoint: true,
      promptMeaningful: true,
      checkpointed: false,
      touchedFiles: ['src/feature.js'],
      meaningfulWriteCount: 1,
    }],
  ]);

  const adapter = createCursorAdapter({
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
    hook_event_name: 'ConversationEnd',
    conversation_id: 'cursor-blocked',
    end_hook_active: false,
    last_assistant_message: 'Feature implemented. Next step: add tests.',
  });

  assert.equal(result.decision, 'block');
  assert.match(result.reason, /Persist this turn/i);
  assert.match(result.reason, /smart_turn phase=end/i);
  assert.ok(states.has('cursor:main:cursor-blocked'));
});
