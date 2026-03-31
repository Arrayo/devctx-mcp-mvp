import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_CONTRACT_RULE_LINES,
  buildMutationSafetyActionLines,
  buildOperationalContextLines,
  buildRecommendedPathLines,
} from '../src/client-contract.js';

test('client contract builds consistent recommended-path and remediation lines', () => {
  const result = buildOperationalContextLines({
    sessionId: 'sess-1',
    found: true,
    summary: {
      goal: 'Unify client contract handling',
      currentFocus: 'Shared adapter layer',
      nextStep: 'Refactor wrapper and hooks to the shared contract',
    },
    continuity: {
      state: 'aligned',
    },
    mutationSafety: {
      blocked: true,
      blockedBy: ['tracked', 'staged'],
      stateDbPath: '.devctx/state.sqlite',
      recommendedActions: [
        'Untrack .devctx/state.sqlite and keep .devctx/ ignored before committing.',
      ],
    },
    storageHealth: {
      issue: 'corrupted',
    },
    recommendedPath: {
      nextTools: ['repo_safety', 'smart_doctor', 'smart_turn'],
      steps: [
        { instruction: 'Follow recommendedActions, then run smart_doctor before retrying smart_turn.' },
      ],
    },
    refreshedContext: {
      topFiles: [{ file: 'tools/devctx/src/hooks/claude-hooks.js' }],
      hints: ['Use the shared adapter layer for all client-specific renderers.'],
    },
  }, {
    maxLines: 12,
    maxChars: 800,
  });

  assert.match(result, /repo safety:/i);
  assert.match(result, /next tools:/i);
  assert.match(result, /fix:/i);
  assert.match(result, /storage health: corrupted/i);
  assert.match(result, /doctor: run smart_doctor/i);
});

test('client contract exports operational rule lines for generated client rules', () => {
  assert.ok(CLIENT_CONTRACT_RULE_LINES.some((line) => line.includes('mutationSafety.blocked')));
  assert.ok(CLIENT_CONTRACT_RULE_LINES.some((line) => line.includes('smart_doctor')));
  assert.ok(buildMutationSafetyActionLines({
    recommendedActions: ['Fix the repo hygiene issue before retrying.'],
  })[0].startsWith('fix:'));
  assert.ok(buildRecommendedPathLines({
    nextTools: ['smart_context', 'smart_read'],
    steps: [{ instruction: 'Read the refreshed files first.' }],
  }).some((line) => line.includes('next tools:')));
});
