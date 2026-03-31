import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { persistMetrics } from '../src/metrics.js';
import { TASK_RUNNER_QUALITY_ANALYTICS_KIND } from '../src/analytics/product-quality.js';
import { smartMetrics } from '../src/tools/smart-metrics.js';
import { smartTurn } from '../src/tools/smart-turn.js';
import { withStateDb } from '../src/storage/sqlite.js';
import { projectRoot, setProjectRoot } from '../src/utils/runtime-config.js';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const SKIP_SQLITE_TESTS = nodeMajor < 22;

test('smart_metrics - aggregates totals for an explicit session filter', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-tool-'));
  const metricsFile = path.join(tmpRoot, '.devctx', 'metrics.jsonl');
  const previousMetricsFile = process.env.DEVCTX_METRICS_FILE;

  try {
    process.env.DEVCTX_METRICS_FILE = metricsFile;
    await persistMetrics({
      tool: 'smart_read',
      target: 'file-a.js',
      sessionId: 'metrics-session',
      rawTokens: 100,
      compressedTokens: 40,
      savedTokens: 60,
      timestamp: '2026-03-28T10:00:00.000Z',
    });
    await persistMetrics({
      tool: 'smart_search',
      target: 'query-b',
      sessionId: 'metrics-session',
      rawTokens: 80,
      compressedTokens: 50,
      savedTokens: 30,
      timestamp: '2026-03-28T11:00:00.000Z',
    });

    const result = await smartMetrics({ window: 'all', latest: 5, sessionId: 'metrics-session' });
    assert.strictEqual(result.filePath, metricsFile);
    assert.strictEqual(result.filters.sessionId, 'metrics-session');
    assert.strictEqual(result.summary.count, 2);
    assert.ok(result.summary.tools.some((entry) => entry.tool === 'smart_read'));
    assert.ok(result.summary.tools.some((entry) => entry.tool === 'smart_search'));
    assert.ok(result.latestEntries.every((entry) => entry.sessionId === 'metrics-session'));
  } finally {
    if (previousMetricsFile === undefined) {
      delete process.env.DEVCTX_METRICS_FILE;
    } else {
      process.env.DEVCTX_METRICS_FILE = previousMetricsFile;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - supports tool filtering and recent entry ordering', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-filter-'));
  const metricsFile = path.join(tmpRoot, '.devctx', 'metrics.jsonl');

  try {
    const metricsDir = path.join(tmpRoot, '.devctx');
    fs.mkdirSync(metricsDir, { recursive: true });
    fs.writeFileSync(
      metricsFile,
      [
        { tool: 'smart_read', target: 'a', rawTokens: 50, compressedTokens: 20, savedTokens: 30, timestamp: '2026-03-28T09:00:00.000Z' },
        { tool: 'smart_read', target: 'b', rawTokens: 30, compressedTokens: 10, savedTokens: 20, timestamp: '2026-03-28T12:00:00.000Z' },
        { tool: 'smart_search', target: 'c', rawTokens: 40, compressedTokens: 25, savedTokens: 15, timestamp: '2026-03-28T11:00:00.000Z' },
      ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
      'utf8',
    );

    const result = await smartMetrics({ file: metricsFile, tool: 'smart_read', window: 'all', latest: 2 });
    assert.strictEqual(result.summary.count, 2);
    assert.strictEqual(result.summary.savedTokens, 50);
    assert.strictEqual(result.latestEntries.length, 2);
    assert.strictEqual(result.latestEntries[0].target, 'b');
    assert.strictEqual(result.latestEntries[1].target, 'a');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - uses SQLite storage by default when no metrics file override is set', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-sqlite-'));
  const previousProjectRoot = projectRoot;
  const previousMetricsFile = process.env.DEVCTX_METRICS_FILE;

  try {
    setProjectRoot(tmpRoot);
    delete process.env.DEVCTX_METRICS_FILE;

    await persistMetrics({
      tool: 'smart_read',
      target: 'sqlite-a.js',
      sessionId: 'sqlite-session',
      rawTokens: 120,
      compressedTokens: 30,
      savedTokens: 90,
      timestamp: '2026-03-28T13:00:00.000Z',
    });
    await persistMetrics({
      tool: 'smart_summary',
      action: 'get',
      target: 'sqlite-b',
      sessionId: 'sqlite-session',
      rawTokens: 70,
      compressedTokens: 35,
      savedTokens: 35,
      timestamp: '2026-03-28T14:00:00.000Z',
    });

    const result = await smartMetrics({ window: 'all', latest: 5, sessionId: 'sqlite-session' });
    assert.strictEqual(result.source, 'sqlite');
    assert.strictEqual(result.filters.sessionId, 'sqlite-session');
    assert.strictEqual(result.summary.count, 2);
    assert.strictEqual(result.summary.savedTokens, 125);
    assert.ok(result.storagePath.endsWith(path.join('.devctx', 'state.sqlite')));
    assert.ok(result.latestEntries.every((entry) => entry.sessionId === 'sqlite-session'));
  } finally {
    setProjectRoot(previousProjectRoot);
    if (previousMetricsFile === undefined) {
      delete process.env.DEVCTX_METRICS_FILE;
    } else {
      process.env.DEVCTX_METRICS_FILE = previousMetricsFile;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - includes smart_turn product-quality signals emitted from real start/end turns', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-smart-turn-'));
  const previousProjectRoot = projectRoot;
  const previousMetricsFile = process.env.DEVCTX_METRICS_FILE;

  try {
    setProjectRoot(tmpRoot);
    delete process.env.DEVCTX_METRICS_FILE;
    execFileSync('git', ['init'], { cwd: tmpRoot, stdio: 'ignore' });

    const start = await smartTurn({
      phase: 'start',
      prompt: 'Fix the login error in the auth handler and checkpoint the first milestone safely',
      ensureSession: true,
    });

    await smartTurn({
      phase: 'end',
      sessionId: start.sessionId,
      event: 'milestone',
      update: {
        completed: ['Fixed the login error'],
        nextStep: 'Run the regression tests',
      },
    });

    const result = await smartMetrics({ window: 'all', latest: 10, sessionId: start.sessionId });
    assert.ok(result.summary.tools.some((entry) => entry.tool === 'smart_turn'));
    assert.equal(result.productQuality.turnsMeasured, 2);
    assert.equal(result.productQuality.continuityRecovery.startsMeasured, 1);
    assert.equal(result.productQuality.checkpointing.persistedEnds, 1);
  } finally {
    setProjectRoot(previousProjectRoot);
    if (previousMetricsFile === undefined) {
      delete process.env.DEVCTX_METRICS_FILE;
    } else {
      process.env.DEVCTX_METRICS_FILE = previousMetricsFile;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - includes task_runner workflow-quality signals', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-task-runner-'));
  const metricsFile = path.join(tmpRoot, '.devctx', 'metrics.jsonl');

  try {
    fs.mkdirSync(path.dirname(metricsFile), { recursive: true });
    const entries = [
      {
        tool: 'task_runner',
        action: 'review',
        sessionId: 'runner-session',
        rawTokens: 0,
        compressedTokens: 40,
        savedTokens: 0,
        metadata: {
          analyticsKind: TASK_RUNNER_QUALITY_ANALYTICS_KIND,
          isWorkflowCommand: true,
          specializedWorkflow: true,
          usedWrapper: true,
          blocked: false,
          doctorIssued: false,
          workflowPolicyMode: 'review_guided',
          workflowPreflightTool: 'smart_context',
          workflowPreflightTopFiles: 2,
        },
        timestamp: '2026-03-30T10:00:00.000Z',
      },
      {
        tool: 'task_runner',
        action: 'debug',
        sessionId: 'runner-session',
        rawTokens: 0,
        compressedTokens: 30,
        savedTokens: 0,
        metadata: {
          analyticsKind: TASK_RUNNER_QUALITY_ANALYTICS_KIND,
          isWorkflowCommand: true,
          specializedWorkflow: true,
          usedWrapper: false,
          blocked: true,
          doctorIssued: true,
          workflowPolicyMode: 'debug_guided',
          workflowPreflightTool: 'smart_search',
          workflowPreflightTopFiles: 1,
        },
        timestamp: '2026-03-30T11:00:00.000Z',
      },
      {
        tool: 'task_runner',
        action: 'checkpoint',
        sessionId: 'runner-session',
        rawTokens: 0,
        compressedTokens: 20,
        savedTokens: 0,
        metadata: {
          analyticsKind: TASK_RUNNER_QUALITY_ANALYTICS_KIND,
          blocked: false,
          doctorIssued: false,
          checkpointPersisted: true,
        },
        timestamp: '2026-03-30T12:00:00.000Z',
      },
    ];
    fs.writeFileSync(metricsFile, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');

    const result = await smartMetrics({ file: metricsFile, window: 'all', latest: 10, sessionId: 'runner-session' });
    assert.equal(result.productQuality.taskRunner.commandsMeasured, 3);
    assert.equal(result.productQuality.taskRunner.workflowCommands, 2);
    assert.equal(result.productQuality.taskRunner.workflowPolicy.coveragePct, 100);
    assert.equal(result.productQuality.taskRunner.workflowPolicy.preflightCoveragePct, 100);
    assert.equal(result.productQuality.taskRunner.blockedState.doctorCoveragePct, 100);
    assert.equal(result.productQuality.taskRunner.checkpointing.persistedCommands, 1);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - suppresses SQLite side effects and global metric writes when state sqlite is tracked or staged', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-blocked-'));
  const previousProjectRoot = projectRoot;
  const previousMetricsFile = process.env.DEVCTX_METRICS_FILE;
  const stateDbPath = path.join(tmpRoot, '.devctx', 'state.sqlite');

  try {
    setProjectRoot(tmpRoot);
    delete process.env.DEVCTX_METRICS_FILE;
    execFileSync('git', ['init'], { cwd: tmpRoot, stdio: 'ignore' });

    await persistMetrics({
      tool: 'smart_read',
      target: 'sqlite-a.js',
      sessionId: 'blocked-session',
      rawTokens: 120,
      compressedTokens: 30,
      savedTokens: 90,
      timestamp: '2026-03-28T13:00:00.000Z',
    });

    const beforeCount = await withStateDb(
      (db) => db.prepare('SELECT COUNT(*) AS count FROM metrics_events').get().count,
      { filePath: stateDbPath, readOnly: true },
    );

    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), '.devctx/\n', 'utf8');
    execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: tmpRoot, stdio: 'ignore' });

    await persistMetrics({
      tool: 'smart_search',
      target: 'should-skip',
      sessionId: 'blocked-session',
      rawTokens: 50,
      compressedTokens: 20,
      savedTokens: 30,
      timestamp: '2026-03-28T14:00:00.000Z',
    });

    const afterCount = await withStateDb(
      (db) => db.prepare('SELECT COUNT(*) AS count FROM metrics_events').get().count,
      { filePath: stateDbPath, readOnly: true },
    );

    const result = await smartMetrics({ window: 'all', latest: 5, sessionId: 'blocked-session' });
    assert.strictEqual(afterCount, beforeCount);
    assert.strictEqual(result.sideEffectsSuppressed, true);
    assert.strictEqual(result.repoSafety.isTracked, true);
    assert.strictEqual(result.repoSafety.isStaged, true);
    assert.strictEqual(result.mutationSafety.blocked, true);
    assert.deepStrictEqual(result.mutationSafety.blockedBy, ['tracked', 'staged']);
    assert.strictEqual(result.degradedMode.active, true);
    assert.strictEqual(result.degradedMode.mode, 'snapshot_metrics_read');
    assert.strictEqual(result.summary.count, 1);
    assert.strictEqual(result.latestEntries.length, 1);
    assert.strictEqual(result.latestEntries[0].tool, 'smart_read');
  } finally {
    setProjectRoot(previousProjectRoot);
    if (previousMetricsFile === undefined) {
      delete process.env.DEVCTX_METRICS_FILE;
    } else {
      process.env.DEVCTX_METRICS_FILE = previousMetricsFile;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - reports context overhead from hook and wrapper metrics metadata', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-overhead-'));
  const previousProjectRoot = projectRoot;
  const previousMetricsFile = process.env.DEVCTX_METRICS_FILE;

  try {
    setProjectRoot(tmpRoot);
    delete process.env.DEVCTX_METRICS_FILE;

    await persistMetrics({
      tool: 'smart_read',
      target: 'file-a.js',
      sessionId: 'overhead-session',
      rawTokens: 100,
      compressedTokens: 40,
      savedTokens: 60,
      timestamp: '2026-03-28T13:00:00.000Z',
    });
    await persistMetrics({
      tool: 'claude_hook',
      action: 'UserPromptSubmit',
      sessionId: 'overhead-session',
      rawTokens: 0,
      compressedTokens: 0,
      savedTokens: 0,
      metadata: {
        isContextOverhead: true,
        overheadTokens: 18,
      },
      timestamp: '2026-03-28T13:05:00.000Z',
    });
    await persistMetrics({
      tool: 'agent_wrapper',
      action: 'codex:start',
      sessionId: 'overhead-session',
      rawTokens: 0,
      compressedTokens: 0,
      savedTokens: 0,
      metadata: {
        isContextOverhead: true,
        overheadTokens: 12,
      },
      timestamp: '2026-03-28T13:10:00.000Z',
    });

    const result = await smartMetrics({ window: 'all', latest: 5, sessionId: 'overhead-session' });
    assert.strictEqual(result.summary.count, 3);
    assert.strictEqual(result.summary.overheadTokens, 30);
    assert.strictEqual(result.summary.netSavedTokens, 30);
    assert.strictEqual(result.summary.netSavingsPct, 30);
    assert.ok(result.summary.overheadTools.some((entry) => entry.tool === 'claude_hook' && entry.overheadTokens === 18));
    assert.ok(result.summary.overheadTools.some((entry) => entry.tool === 'agent_wrapper' && entry.overheadTokens === 12));
    assert.ok(result.summary.tools.some((entry) => entry.tool === 'smart_read' && entry.netSavedTokens === 60));
    assert.ok(result.summary.tools.some((entry) => entry.tool === 'agent_wrapper' && entry.netSavedTokens === 0));
    assert.ok(result.latestEntries.some((entry) => entry.tool === 'claude_hook' && entry.overheadTokens === 18));
  } finally {
    setProjectRoot(previousProjectRoot);
    if (previousMetricsFile === undefined) {
      delete process.env.DEVCTX_METRICS_FILE;
    } else {
      process.env.DEVCTX_METRICS_FILE = previousMetricsFile;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - reports product-quality signals from smart_turn quality metadata', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-quality-'));
  const metricsFile = path.join(tmpRoot, '.devctx', 'metrics.jsonl');

  try {
    fs.mkdirSync(path.dirname(metricsFile), { recursive: true });
    fs.writeFileSync(
      metricsFile,
      [
        {
          tool: 'smart_turn',
          action: 'start',
          sessionId: 'quality-session',
          rawTokens: 0,
          compressedTokens: 0,
          savedTokens: 0,
          metadata: {
            analyticsKind: 'smart_turn_quality',
            phase: 'start',
            continuityState: 'aligned',
            shouldReuseContext: true,
            isolatedSession: false,
            mutationBlocked: false,
            recommendedActionsCount: 0,
            refreshedContext: true,
            refreshedTopFiles: 2,
            indexRefreshed: true,
          },
          timestamp: '2026-03-28T09:00:00.000Z',
        },
        {
          tool: 'smart_turn',
          action: 'start',
          sessionId: 'quality-session',
          rawTokens: 0,
          compressedTokens: 0,
          savedTokens: 0,
          metadata: {
            analyticsKind: 'smart_turn_quality',
            phase: 'start',
            continuityState: 'context_mismatch',
            shouldReuseContext: false,
            isolatedSession: true,
            mutationBlocked: true,
            recommendedActionsCount: 2,
            refreshedContext: false,
            refreshedTopFiles: 0,
            indexRefreshed: false,
          },
          timestamp: '2026-03-28T10:00:00.000Z',
        },
        {
          tool: 'smart_turn',
          action: 'end',
          sessionId: 'quality-session',
          rawTokens: 0,
          compressedTokens: 0,
          savedTokens: 0,
          metadata: {
            analyticsKind: 'smart_turn_quality',
            phase: 'end',
            event: 'milestone',
            checkpointSkipped: false,
            checkpointPersisted: true,
            mutationBlocked: false,
            recommendedActionsCount: 0,
          },
          timestamp: '2026-03-28T11:00:00.000Z',
        },
        {
          tool: 'smart_turn',
          action: 'end',
          sessionId: 'quality-session',
          rawTokens: 0,
          compressedTokens: 0,
          savedTokens: 0,
          metadata: {
            analyticsKind: 'smart_turn_quality',
            phase: 'end',
            event: 'file_change',
            checkpointSkipped: true,
            checkpointPersisted: false,
            mutationBlocked: true,
            recommendedActionsCount: 1,
          },
          timestamp: '2026-03-28T12:00:00.000Z',
        },
      ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
      'utf8',
    );

    const result = await smartMetrics({ file: metricsFile, tool: 'smart_turn', window: 'all', latest: 10 });

    assert.strictEqual(result.summary.count, 4);
    assert.strictEqual(result.productQuality.turnsMeasured, 4);
    assert.strictEqual(result.productQuality.continuityRecovery.startsMeasured, 2);
    assert.strictEqual(result.productQuality.continuityRecovery.alignedStarts, 1);
    assert.strictEqual(result.productQuality.continuityRecovery.reusableStarts, 1);
    assert.strictEqual(result.productQuality.blockedState.turnsBlocked, 2);
    assert.strictEqual(result.productQuality.blockedState.blockedWithRecommendedActions, 2);
    assert.strictEqual(result.productQuality.contextRefresh.refreshedStarts, 1);
    assert.strictEqual(result.productQuality.contextRefresh.refreshedWithTopFiles, 1);
    assert.strictEqual(result.productQuality.checkpointing.persistedEnds, 1);
    assert.strictEqual(result.productQuality.checkpointing.skippedEnds, 1);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('smart_metrics - returns storage diagnostics when sqlite state is corrupted', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-metrics-corrupt-'));
  const previousProjectRoot = projectRoot;
  const previousMetricsFile = process.env.DEVCTX_METRICS_FILE;
  const corruptPath = path.join(tmpRoot, '.devctx', 'state.sqlite');

  try {
    setProjectRoot(tmpRoot);
    delete process.env.DEVCTX_METRICS_FILE;
    fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
    fs.writeFileSync(corruptPath, 'not-a-sqlite-database', 'utf8');

    const result = await smartMetrics({ window: 'all', latest: 5 });

    assert.strictEqual(result.summary.count, 0);
    assert.strictEqual(result.storageHealth.issue, 'corrupted');
    assert.ok(result.error);
    assert.ok(result.storageHealth.recommendedActions.length >= 1);
  } finally {
    setProjectRoot(previousProjectRoot);
    if (previousMetricsFile === undefined) {
      delete process.env.DEVCTX_METRICS_FILE;
    } else {
      process.env.DEVCTX_METRICS_FILE = previousMetricsFile;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
