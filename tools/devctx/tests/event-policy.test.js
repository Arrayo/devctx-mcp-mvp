import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWhitespace,
  truncate,
  uniqueCompact,
  extractContextTopFiles,
  extractPreflightTopFiles,
  extractPreflightHints,
  buildPreflightSummary,
  buildPreflightTask,
  buildContinuityGuidance,
  buildWorkflowPromptWithPolicy,
  buildWorkflowPolicyPayload,
  extractNextStep,
  buildTaskRunnerAutomaticity,
  SAFE_CONTINUITY_STATES,
} from '../src/orchestration/policy/event-policy.js';

test('normalizeWhitespace collapses multiple spaces and trims', () => {
  assert.equal(normalizeWhitespace('  hello   world  '), 'hello world');
  assert.equal(normalizeWhitespace('line1\n  line2\t\tline3'), 'line1 line2 line3');
  assert.equal(normalizeWhitespace(null), '');
  assert.equal(normalizeWhitespace(undefined), '');
});

test('truncate preserves short strings', () => {
  assert.equal(truncate('short', 100), 'short');
  assert.equal(truncate('exactly 10', 10), 'exactly 10');
});

test('truncate adds ellipsis when exceeding maxLength', () => {
  const long = 'This is a very long string that should be truncated';
  const result = truncate(long, 20);
  assert.equal(result.length, 20);
  assert.match(result, /\.\.\.$/);
});

test('truncate handles edge cases', () => {
  assert.equal(truncate('test', 3), '');
  assert.equal(truncate('test', 2), '');
  assert.equal(truncate('test', 4), 'test');
});

test('uniqueCompact removes duplicates and empty values', () => {
  const result = uniqueCompact(['a', 'b', 'a', '', '  ', 'b', 'c']);
  assert.deepEqual(result, ['a', 'b', 'c']);
});

test('uniqueCompact normalizes whitespace', () => {
  const result = uniqueCompact(['  hello  ', 'hello', 'world  ']);
  assert.deepEqual(result, ['hello', 'world']);
});

test('extractContextTopFiles handles string array', () => {
  const topFiles = ['file1.js', 'file2.js', 'file3.js', 'file4.js'];
  const result = extractContextTopFiles(topFiles);
  assert.deepEqual(result, ['file1.js', 'file2.js', 'file3.js']);
});

test('extractContextTopFiles handles object array with file property', () => {
  const topFiles = [
    { file: 'src/auth.js', score: 0.9 },
    { file: 'src/utils.js', score: 0.8 },
  ];
  const result = extractContextTopFiles(topFiles);
  assert.deepEqual(result, ['src/auth.js', 'src/utils.js']);
});

test('extractContextTopFiles handles mixed formats', () => {
  const topFiles = [
    'direct.js',
    { file: 'with-file.js' },
    { path: 'with-path.js' },
    { other: 'ignored' },
  ];
  const result = extractContextTopFiles(topFiles);
  assert.deepEqual(result, ['direct.js', 'with-file.js', 'with-path.js']);
});

test('extractPreflightTopFiles extracts from smart_context result', () => {
  const preflightResult = {
    tool: 'smart_context',
    result: {
      context: [
        { file: 'src/main.js', content: '...' },
        { file: 'src/helper.js', content: '...' },
      ],
    },
  };
  const result = extractPreflightTopFiles(preflightResult);
  assert.deepEqual(result, ['src/main.js', 'src/helper.js']);
});

test('extractPreflightTopFiles extracts from smart_search result', () => {
  const preflightResult = {
    tool: 'smart_search',
    result: {
      topFiles: ['auth.js', 'middleware.js', 'routes.js'],
    },
  };
  const result = extractPreflightTopFiles(preflightResult);
  assert.deepEqual(result, ['auth.js', 'middleware.js', 'routes.js']);
});

test('extractPreflightHints extracts from smart_context', () => {
  const preflightResult = {
    tool: 'smart_context',
    result: {
      hints: ['Authentication flow detected', 'JWT token handling present'],
    },
  };
  const result = extractPreflightHints(preflightResult);
  assert.deepEqual(result, ['Authentication flow detected', 'JWT token handling present']);
});

test('extractPreflightHints builds match count hint from smart_search', () => {
  const preflightResult = {
    tool: 'smart_search',
    result: {
      totalMatches: 15,
    },
  };
  const result = extractPreflightHints(preflightResult);
  assert.deepEqual(result, ['15 search match(es) surfaced for the workflow target']);
});

test('buildPreflightSummary returns null when no preflight', () => {
  const result = buildPreflightSummary(null);
  assert.equal(result, null);
});

test('buildPreflightSummary builds complete summary', () => {
  const preflightResult = {
    tool: 'smart_context',
    result: {
      context: [{ file: 'main.js' }],
      hints: ['Hint 1', 'Hint 2'],
    },
  };
  const result = buildPreflightSummary(preflightResult);
  assert.equal(result.tool, 'smart_context');
  assert.deepEqual(result.topFiles, ['main.js']);
  assert.deepEqual(result.hints, ['Hint 1', 'Hint 2']);
  assert.equal(result.totalMatches, 0);
});

test('buildPreflightTask returns prompt when provided', () => {
  const result = buildPreflightTask({
    workflowProfile: { commandName: 'task', label: 'Task' },
    prompt: 'Implement feature X',
    startResult: {},
  });
  assert.equal(result, 'Implement feature X');
});

test('buildPreflightTask returns nextStep for continue command', () => {
  const result = buildPreflightTask({
    workflowProfile: { commandName: 'continue', label: 'Continue' },
    prompt: '',
    startResult: {
      summary: {
        nextStep: 'Add validation logic',
        currentFocus: 'Auth module',
      },
    },
  });
  assert.equal(result, 'Add validation logic');
});

test('buildPreflightTask combines focus and nextStep for task command', () => {
  const result = buildPreflightTask({
    workflowProfile: { commandName: 'task', label: 'Task' },
    prompt: '',
    startResult: {
      summary: {
        currentFocus: 'Implementing auth',
        nextStep: 'Add tests',
      },
    },
  });
  assert.equal(result, 'Implementing auth. Add tests');
});

test('buildPreflightTask falls back to refreshed files', () => {
  const result = buildPreflightTask({
    workflowProfile: { commandName: 'continue', label: 'Continue' },
    prompt: '',
    startResult: {
      refreshedContext: {
        topFiles: ['auth.js', 'utils.js'],
      },
    },
  });
  assert.match(result, /Inspect auth\.js, utils\.js/);
});

test('buildPreflightTask validates workflowProfile structure', () => {
  const result = buildPreflightTask({
    workflowProfile: { label: 'Fallback' },
    prompt: '',
    startResult: {},
  });
  assert.equal(result, 'Fallback');
});

test('buildContinuityGuidance includes continuity state', () => {
  const result = buildContinuityGuidance({
    startResult: {
      continuity: { state: 'aligned' },
    },
  });
  assert.ok(result.some((line) => line.includes('Continuity: aligned')));
});

test('buildContinuityGuidance includes persisted focus and next step', () => {
  const result = buildContinuityGuidance({
    startResult: {
      continuity: { state: 'resume' },
      summary: {
        currentFocus: 'Implementing feature',
        nextStep: 'Add validation',
      },
    },
  });
  assert.ok(result.some((line) => line.includes('Persisted focus: Implementing feature')));
  assert.ok(result.some((line) => line.includes('Persisted next step: Add validation')));
});

test('buildContinuityGuidance includes refreshed top files', () => {
  const result = buildContinuityGuidance({
    startResult: {
      continuity: { state: 'aligned' },
      refreshedContext: {
        topFiles: ['auth.js', 'middleware.js'],
      },
    },
  });
  assert.ok(result.some((line) => line.includes('Refreshed top files: auth.js, middleware.js')));
});

test('buildContinuityGuidance includes recommended tools', () => {
  const result = buildContinuityGuidance({
    startResult: {
      continuity: { state: 'aligned' },
      recommendedPath: {
        nextTools: ['smart_read', 'smart_edit', 'smart_turn'],
      },
    },
  });
  assert.ok(result.some((line) => line.includes('smart_turn suggested: smart_read -> smart_edit -> smart_turn')));
});

test('buildContinuityGuidance adds isolation warning', () => {
  const result = buildContinuityGuidance({
    startResult: {
      isolatedSession: true,
      continuity: { state: 'cold_start' },
    },
  });
  assert.ok(result.some((line) => line.includes('smart_turn already isolated this work')));
});

test('buildWorkflowPromptWithPolicy combines all elements', () => {
  const result = buildWorkflowPromptWithPolicy({
    prompt: 'Implement auth',
    workflowProfile: {
      policyMode: 'guided',
      workflowIntent: 'implementation',
      nextTools: ['smart_read', 'smart_edit'],
      checkpointStrategy: 'after each file',
    },
    preflightSummary: {
      tool: 'smart_context',
      topFiles: ['auth.js'],
      hints: ['JWT detected'],
    },
    startResult: {
      continuity: { state: 'aligned' },
      summary: { nextStep: 'Add middleware' },
    },
  });

  assert.match(result, /Implement auth/);
  assert.match(result, /Mode: guided/);
  assert.match(result, /Intent: implementation/);
  assert.match(result, /smart_read -> smart_edit/);
  assert.match(result, /Checkpoint rule: after each file/);
  assert.match(result, /Continuity: aligned/);
  assert.match(result, /Preflight: smart_context/);
  assert.match(result, /Focus files: auth\.js/);
  assert.match(result, /Signals: JWT detected/);
});

test('buildWorkflowPolicyPayload creates complete payload', () => {
  const result = buildWorkflowPolicyPayload({
    commandName: 'implement',
    workflowProfile: {
      label: 'Implementation',
      policyMode: 'guided',
      workflowIntent: 'implementation',
      specialized: true,
      nextTools: ['smart_read', 'smart_edit'],
      checkpointStrategy: 'milestone',
    },
    preflightSummary: {
      tool: 'smart_context',
      topFiles: ['main.js'],
    },
  });

  assert.equal(result.commandName, 'implement');
  assert.equal(result.label, 'Implementation');
  assert.equal(result.policyMode, 'guided');
  assert.equal(result.intent, 'implementation');
  assert.equal(result.specialized, true);
  assert.deepEqual(result.nextTools, ['smart_read', 'smart_edit']);
  assert.equal(result.checkpointStrategy, 'milestone');
  assert.deepEqual(result.preflight, { tool: 'smart_context', topFiles: ['main.js'] });
});

test('extractNextStep finds explicit next step marker', () => {
  const output = 'Task completed successfully. Next step: validate the output and run tests.';
  const result = extractNextStep(output);
  assert.equal(result, 'validate the output and run tests');
});

test('extractNextStep handles Spanish marker', () => {
  const output = 'Tarea completada. Siguiente paso: revisar el código y hacer commit.';
  const result = extractNextStep(output);
  assert.equal(result, 'revisar el código y hacer commit');
});

test('extractNextStep returns empty when no marker found', () => {
  const output = 'Task completed without explicit next step.';
  const result = extractNextStep(output);
  assert.equal(result, '');
});

test('extractNextStep truncates long next steps', () => {
  const longStep = 'a'.repeat(200);
  const output = `Next step: ${longStep}`;
  const result = extractNextStep(output);
  assert.ok(result.length <= 153);
  assert.match(result, /\.\.\.$/);
});

test('extractNextStep ignores too-short matches', () => {
  const output = 'Next step: short';
  const result = extractNextStep(output);
  assert.equal(result, '');
});

test('buildTaskRunnerAutomaticity builds complete signal object', () => {
  const result = buildTaskRunnerAutomaticity({
    isWorkflowCommand: true,
    startResult: { sessionId: 'test-session' },
    endResult: { checkpoint: { skipped: false } },
    workflowPolicy: { preflight: { tool: 'smart_context' } },
    usedWrapper: true,
    overheadTokens: 45,
    managedByBaseOrchestrator: true,
  });

  assert.equal(result.managedByBaseOrchestrator, true);
  assert.equal(result.autoStartTriggered, true);
  assert.equal(result.autoPreflightTriggered, true);
  assert.equal(result.autoCheckpointTriggered, true);
  assert.equal(result.autoWrappedPrompt, true);
  assert.equal(result.contextOverheadTokens, 45);
});

test('buildTaskRunnerAutomaticity handles missing workflow', () => {
  const result = buildTaskRunnerAutomaticity({
    isWorkflowCommand: false,
    startResult: null,
    endResult: null,
    workflowPolicy: null,
    usedWrapper: false,
    overheadTokens: 0,
    managedByBaseOrchestrator: false,
  });

  assert.equal(result.managedByBaseOrchestrator, false);
  assert.equal(result.autoStartTriggered, false);
  assert.equal(result.autoPreflightTriggered, false);
  assert.equal(result.autoCheckpointTriggered, false);
  assert.equal(result.autoWrappedPrompt, false);
  assert.equal(result.contextOverheadTokens, 0);
});

test('buildTaskRunnerAutomaticity handles skipped checkpoint', () => {
  const result = buildTaskRunnerAutomaticity({
    isWorkflowCommand: true,
    startResult: { sessionId: 'test' },
    endResult: { checkpoint: { skipped: true } },
    workflowPolicy: {},
    usedWrapper: false,
    overheadTokens: 0,
    managedByBaseOrchestrator: true,
  });

  assert.equal(result.autoCheckpointTriggered, false);
});

test('buildTaskRunnerAutomaticity handles blocked checkpoint', () => {
  const result = buildTaskRunnerAutomaticity({
    isWorkflowCommand: true,
    startResult: { sessionId: 'test' },
    endResult: { checkpoint: { blocked: true } },
    workflowPolicy: {},
    usedWrapper: false,
    overheadTokens: 0,
    managedByBaseOrchestrator: true,
  });

  assert.equal(result.autoCheckpointTriggered, false);
});

test('buildTaskRunnerAutomaticity sanitizes invalid overheadTokens', () => {
  const result1 = buildTaskRunnerAutomaticity({
    isWorkflowCommand: false,
    overheadTokens: NaN,
    managedByBaseOrchestrator: false,
  });
  assert.equal(result1.contextOverheadTokens, 0);

  const result2 = buildTaskRunnerAutomaticity({
    isWorkflowCommand: false,
    overheadTokens: -10,
    managedByBaseOrchestrator: false,
  });
  assert.equal(result2.contextOverheadTokens, 0);
});

test('SAFE_CONTINUITY_STATES contains expected states', () => {
  assert.ok(SAFE_CONTINUITY_STATES.has('aligned'));
  assert.ok(SAFE_CONTINUITY_STATES.has('resume'));
  assert.equal(SAFE_CONTINUITY_STATES.has('possible_shift'), false);
  assert.equal(SAFE_CONTINUITY_STATES.has('context_mismatch'), false);
});

test('buildContinuityGuidance handles isolated session', () => {
  const result = buildContinuityGuidance({
    startResult: {
      isolatedSession: true,
      continuity: { state: 'cold_start' },
    },
  });
  assert.ok(result.some((line) => line.includes('smart_turn already isolated this work')));
});

test('buildContinuityGuidance handles aligned continuity', () => {
  const result = buildContinuityGuidance({
    startResult: {
      isolatedSession: false,
      continuity: { state: 'aligned' },
    },
  });
  assert.ok(result.some((line) => line.includes('reuse the active session context')));
});

test('buildContinuityGuidance handles possible_shift', () => {
  const result = buildContinuityGuidance({
    startResult: {
      isolatedSession: false,
      continuity: { state: 'possible_shift' },
    },
  });
  assert.ok(result.some((line) => line.includes('treat this as a shifted slice')));
});

test('buildWorkflowPolicyPayload creates immutable nextTools array', () => {
  const originalTools = ['smart_read', 'smart_edit'];
  const workflowProfile = {
    label: 'Test',
    policyMode: 'guided',
    workflowIntent: 'implementation',
    specialized: false,
    nextTools: originalTools,
    checkpointStrategy: null,
  };

  const result = buildWorkflowPolicyPayload({
    commandName: 'test',
    workflowProfile,
    preflightSummary: null,
  });

  result.nextTools.push('smart_turn');
  assert.deepEqual(originalTools, ['smart_read', 'smart_edit']);
});
