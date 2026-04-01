import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatProductQualityReport, hasProductQualitySignals } from '../src/analytics/product-quality.js';

test('product quality - detects task-runner and client-adapter signals without smart_turn turns', () => {
  const stats = {
    turnsMeasured: 0,
    taskRunner: {
      commandsMeasured: 3,
    },
    clientAdapters: {
      clientsMeasured: 2,
    },
  };

  assert.equal(hasProductQualitySignals(stats), true);
});

test('product quality - returns false when no quality signals were measured', () => {
  const stats = {
    turnsMeasured: 0,
    taskRunner: {
      commandsMeasured: 0,
    },
    clientAdapters: {
      clientsMeasured: 0,
    },
  };

  assert.equal(hasProductQualitySignals(stats), false);
});

test('product quality - formats comparative client adapter section', () => {
  const stats = {
    turnsMeasured: 0,
    taskRunner: {
      commandsMeasured: 0,
    },
    clientAdapters: {
      clientsMeasured: 2,
      totalContextOverheadTokens: 64,
      byClient: [
        {
          client: 'claude',
          entriesMeasured: 4,
          adapterEvents: 4,
          baseOrchestratedEvents: 4,
          autoStartedEvents: 4,
          autoPreflightedEvents: 3,
          autoCheckpointedEvents: 2,
          blockedEvents: 0,
          contextOverheadTokens: 28,
          averageContextOverheadTokens: 14,
          adapterCoveragePct: 100,
          baseOrchestratorCoveragePct: 100,
          autoStartCoveragePct: 100,
          autoPreflightCoveragePct: 75,
          autoCheckpointCoveragePct: 50,
        },
        {
          client: 'cursor',
          entriesMeasured: 4,
          adapterEvents: 4,
          baseOrchestratedEvents: 4,
          autoStartedEvents: 2,
          autoPreflightedEvents: 2,
          autoCheckpointedEvents: 3,
          blockedEvents: 1,
          contextOverheadTokens: 36,
          averageContextOverheadTokens: 18,
          adapterCoveragePct: 100,
          baseOrchestratorCoveragePct: 100,
          autoStartCoveragePct: 50,
          autoPreflightCoveragePct: 50,
          autoCheckpointCoveragePct: 75,
        },
      ],
    },
  };

  const report = formatProductQualityReport(stats);

  assert.match(report, /Client Adapter Signals:/);
  assert.match(report, /Clients measured:\s+2/);
  assert.match(report, /Overhead total:\s+64 tokens/);
  assert.match(report, /Lowest avg overhead:\s+claude \(14 tokens\)/);
  assert.match(report, /Best auto-start rate:\s+claude \(100%\)/);
  assert.match(report, /claude:/);
  assert.match(report, /Adapter coverage:\s+4\/4 \(100%\)/);
  assert.match(report, /Auto-checkpointed:\s+3\/4 \(75%\)/);
  assert.match(report, /Blocked events:\s+1/);
});
