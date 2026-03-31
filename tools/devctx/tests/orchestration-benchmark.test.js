import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateScenarioExpectations,
  evaluateReleaseBaseline,
  summarizeOrchestrationBenchmark,
} from '../evals/orchestration-benchmark.js';

test('evaluateScenarioExpectations passes when start/end outputs match the scenario contract', () => {
  const scenario = {
    expect: {
      continuityState: 'aligned',
      shouldReuseContext: true,
      mutationBlocked: true,
      blockedByIncludes: ['tracked', 'staged'],
      refreshedContext: true,
      refreshedTopFilesMin: 2,
      recommendedPathMode: 'blocked_guided',
      checkpointSkipped: false,
      checkpointPersisted: true,
      endRecommendedPathMode: 'checkpointed',
    },
  };

  const result = evaluateScenarioExpectations({
    scenario,
    startResult: {
      continuity: {
        state: 'aligned',
        shouldReuseContext: true,
      },
      mutationSafety: {
        blocked: true,
        blockedBy: ['tracked', 'staged'],
      },
      refreshedContext: {
        topFiles: ['src/auth.js', 'src/wrapper.js'],
      },
      recommendedPath: {
        mode: 'blocked_guided',
      },
    },
    endResult: {
      checkpoint: {
        skipped: false,
        blocked: false,
      },
      mutationSafety: {
        blocked: true,
        blockedBy: ['tracked'],
      },
      recommendedPath: {
        mode: 'checkpointed',
      },
    },
  });

  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test('evaluateScenarioExpectations reports mismatches clearly', () => {
  const scenario = {
    expect: {
      continuityState: 'aligned',
      mutationBlocked: true,
      blockedByIncludes: ['tracked'],
      checkpointSkipped: false,
      checkpointPersisted: true,
      endRecommendedPathMode: 'checkpointed',
    },
  };

  const result = evaluateScenarioExpectations({
    scenario,
    startResult: {
      continuity: {
        state: 'cold_start',
        shouldReuseContext: false,
      },
      mutationSafety: {
        blocked: false,
        blockedBy: [],
      },
      recommendedPath: {
        mode: 'guided_refresh',
      },
    },
    endResult: {
      checkpoint: {
        skipped: true,
        blocked: false,
      },
      recommendedPath: {
        mode: 'continue_until_milestone',
      },
    },
  });

  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes('continuityState=aligned')));
  assert.ok(result.failures.some((failure) => failure.includes('mutationBlocked=true')));
  assert.ok(result.failures.some((failure) => failure.includes('blockedBy to include tracked')));
  assert.ok(result.failures.some((failure) => failure.includes('checkpointSkipped=false')));
  assert.ok(result.failures.some((failure) => failure.includes('checkpointPersisted=true')));
  assert.ok(result.failures.some((failure) => failure.includes('end recommendedPath.mode=checkpointed')));
});

test('summarizeOrchestrationBenchmark enforces scenario and product-quality thresholds', () => {
  const result = summarizeOrchestrationBenchmark({
    scenarioResults: [
      { id: 'a', pass: true },
      { id: 'b', pass: false },
    ],
    thresholds: {
      minScenarioPassRatePct: 100,
      minNetSavedTokens: 200,
      minContinuityAlignmentRatePct: 30,
      minBlockedRemediationCoveragePct: 100,
      minRefreshTopFileSignalRatePct: 100,
      minCheckpointPersistenceRatePct: 60,
    },
    metrics: {
      summary: {
        netSavedTokens: 180,
      },
      productQuality: {
        continuityRecovery: {
          alignmentRatePct: 25,
        },
        blockedState: {
          remediationCoveragePct: 100,
        },
        contextRefresh: {
          topFileSignalRatePct: 100,
        },
        checkpointing: {
          persistenceRatePct: 50,
        },
      },
    },
  });

  assert.deepEqual(result.scenarios, {
    total: 2,
    passed: 1,
    failed: 1,
    passRatePct: 50,
  });
  assert.equal(result.pass, false);
  assert.ok(result.thresholdChecks.some((check) => check.key === 'scenarioPassRatePct' && check.pass === false));
  assert.ok(result.thresholdChecks.some((check) => check.key === 'netSavedTokens' && check.pass === false));
  assert.ok(result.thresholdChecks.some((check) => check.key === 'continuityAlignmentRatePct' && check.pass === false));
  assert.ok(result.thresholdChecks.some((check) => check.key === 'blockedRemediationCoveragePct' && check.pass === true));
  assert.ok(result.thresholdChecks.some((check) => check.key === 'refreshTopFileSignalRatePct' && check.pass === true));
  assert.ok(result.thresholdChecks.some((check) => check.key === 'checkpointPersistenceRatePct' && check.pass === false));
});

test('evaluateReleaseBaseline enforces required scenarios and numeric minimums', () => {
  const result = evaluateReleaseBaseline({
    scenarioResults: [
      { id: 'aligned-resume', pass: true },
      { id: 'persisted-checkpoint', pass: true },
    ],
    summary: {
      thresholdChecks: [
        { key: 'scenarioPassRatePct', actual: 100, expected: 100, pass: true },
        { key: 'netSavedTokens', actual: 180, expected: 150, pass: true },
        { key: 'continuityAlignmentRatePct', actual: 25, expected: 20, pass: true },
      ],
    },
    metrics: {
      summary: {
        netSavingsPct: 85,
      },
    },
    baseline: {
      version: 1,
      expectedScenarioCount: 2,
      requiredScenarios: ['aligned-resume', 'persisted-checkpoint'],
      minimums: {
        scenarioPassRatePct: 100,
        netSavedTokens: 150,
        continuityAlignmentRatePct: 20,
        netSavingsPct: 80,
      },
    },
  });

  assert.equal(result.enabled, true);
  assert.equal(result.pass, true);
  assert.ok(result.checks.every((check) => check.pass));
});

test('evaluateReleaseBaseline fails when a required scenario or floor is missing', () => {
  const result = evaluateReleaseBaseline({
    scenarioResults: [
      { id: 'aligned-resume', pass: true },
    ],
    summary: {
      thresholdChecks: [
        { key: 'scenarioPassRatePct', actual: 50, expected: 100, pass: false },
        { key: 'netSavedTokens', actual: 90, expected: 150, pass: false },
      ],
    },
    metrics: {
      summary: {
        netSavingsPct: 40,
      },
    },
    baseline: {
      version: 1,
      expectedScenarioCount: 2,
      requiredScenarios: ['aligned-resume', 'persisted-checkpoint'],
      minimums: {
        scenarioPassRatePct: 100,
        netSavedTokens: 150,
        netSavingsPct: 80,
      },
    },
  });

  assert.equal(result.pass, false);
  assert.ok(result.checks.some((check) => check.key === 'expectedScenarioCount' && check.pass === false));
  assert.ok(result.checks.some((check) => check.key === 'scenario:persisted-checkpoint' && check.pass === false));
  assert.ok(result.checks.some((check) => check.key === 'netSavedTokens' && check.pass === false));
  assert.ok(result.checks.some((check) => check.key === 'netSavingsPct' && check.pass === false));
});
