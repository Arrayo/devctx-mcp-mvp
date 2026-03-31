import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { smartStatus } from '../src/tools/smart-status.js';
import { smartSummary } from '../src/tools/smart-summary.js';
import { projectRoot, setProjectRoot } from '../src/utils/runtime-config.js';

let hasNodeSqlite = false;
try {
  await import('node:sqlite');
  hasNodeSqlite = true;
} catch {
  hasNodeSqlite = false;
}

(hasNodeSqlite ? describe : describe.skip)('smart_status', () => {
  let tempDbPath;
  let originalEnv;

  before(async function() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-test-'));
    tempDbPath = path.join(tempDir, 'state.sqlite');
    originalEnv = process.env.DEVCTX_STATE_DB_PATH;
    process.env.DEVCTX_STATE_DB_PATH = tempDbPath;
    
    await smartSummary({ action: 'reset' });
  });

  after(async function() {
    await smartSummary({ action: 'reset' });
    
    if (originalEnv !== undefined) {
      process.env.DEVCTX_STATE_DB_PATH = originalEnv;
    } else {
      delete process.env.DEVCTX_STATE_DB_PATH;
    }
    
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.rmSync(path.dirname(tempDbPath), { recursive: true, force: true });
    }
  });

  it('should display active session context', async function() {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Test smart_status functionality',
        status: 'in_progress',
        nextStep: 'Verify status display',
        decisions: ['Created smart_status tool', 'Added format options'],
        touchedFiles: ['src/tools/smart-status.js', 'src/server.js'],
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.equal(result.success, true);
    assert.ok(result.summary);
    assert.ok(result.summary.includes('Test smart_status functionality'));
    assert.ok(result.summary.includes('in_progress'));
    assert.ok(result.summary.includes('Verify status display'));
    assert.ok(result.context);
    assert.equal(result.context.goal, 'Test smart_status functionality');
    assert.equal(result.context.stats.decisions, 2);
    assert.equal(result.context.stats.files, 2);
  });

  it('should support compact format', async function() {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Compact format test',
        status: 'in_progress',
        nextStep: 'Test compact output',
        touchedFiles: ['file1.js', 'file2.js', 'file3.js'],
      },
    });

    const result = await smartStatus({ format: 'compact' });
    
    assert.ok(result.sessionId);
    assert.equal(result.status, 'in_progress');
    assert.equal(result.nextStep, 'Test compact output');
    assert.ok(result.stats);
    assert.equal(result.stats.files, 3);
    assert.ok(result.recentFiles);
    assert.equal(result.recentFiles.length, 3);
  });

  it('should limit recent items with maxItems', async function() {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'MaxItems test',
        status: 'in_progress',
        decisions: Array.from({ length: 20 }, (_, i) => `Decision ${i + 1}`),
        touchedFiles: Array.from({ length: 20 }, (_, i) => `file${i + 1}.js`),
      },
    });

    const result = await smartStatus({ format: 'detailed', maxItems: 5 });
    
    assert.ok(result.context.recent.decisions.length <= 5);
    assert.ok(result.context.recent.files.length <= 5);
  });

  it('should show pinned context and unresolved questions', async function() {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Context test',
        status: 'in_progress',
        pinnedContext: ['Important context 1', 'Important context 2'],
        unresolvedQuestions: ['Question 1?', 'Question 2?'],
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.ok(result.summary.includes('Pinned Context'));
    assert.ok(result.summary.includes('Important context 1'));
    assert.ok(result.summary.includes('Unresolved Questions'));
    assert.ok(result.summary.includes('Question 1?'));
    assert.equal(result.context.pinned.length, 2);
    assert.equal(result.context.questions.length, 2);
  });

  it('should handle blocked status', async function() {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Blocked test',
        status: 'blocked',
        whyBlocked: 'Waiting for API key',
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.equal(result.status, 'blocked');
    assert.ok(result.summary.includes('Blocked: Waiting for API key'));
    assert.equal(result.context.whyBlocked, 'Waiting for API key');
  });

  it('should show current focus when set', async function() {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Focus test',
        status: 'in_progress',
        currentFocus: 'Implementing smart_status tool',
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.ok(result.summary.includes('Focus: Implementing smart_status tool'));
    assert.equal(result.context.currentFocus, 'Implementing smart_status tool');
  });

  it('surfaces mutationSafety and degraded mode when repo safety blocks side effects', async function() {
    const previousProjectRoot = projectRoot;
    const previousStateDbPath = process.env.DEVCTX_STATE_DB_PATH;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-status-blocked-'));

    try {
      setProjectRoot(repoRoot);
      delete process.env.DEVCTX_STATE_DB_PATH;
      execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });

      await smartSummary({
        action: 'update',
        sessionId: 'status-blocked',
        update: {
          goal: 'Blocked repo safety status',
          status: 'in_progress',
          nextStep: 'Fix git hygiene',
        },
      });

      fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.devctx/\n', 'utf8');
      execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: repoRoot, stdio: 'ignore' });

      const result = await smartStatus({ format: 'compact' });

      assert.equal(result.sessionId, 'status-blocked');
      assert.equal(result.sideEffectsSuppressed, true);
      assert.equal(result.mutationSafety.blocked, true);
      assert.deepStrictEqual(result.mutationSafety.blockedBy, ['tracked', 'staged']);
      assert.equal(result.degradedMode.active, true);
      assert.equal(result.repoSafety.isTracked, true);
      assert.equal(result.repoSafety.isStaged, true);
    } finally {
      try {
        execFileSync('git', ['rm', '--cached', '-f', '.devctx/state.sqlite'], { cwd: repoRoot, stdio: 'ignore' });
      } catch {}
      try {
        await smartSummary({ action: 'reset', sessionId: 'status-blocked' });
      } catch {}
      if (previousStateDbPath !== undefined) {
        process.env.DEVCTX_STATE_DB_PATH = previousStateDbPath;
      } else {
        delete process.env.DEVCTX_STATE_DB_PATH;
      }
      setProjectRoot(previousProjectRoot);
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('returns storage diagnostics when state.sqlite is corrupted', async function() {
    const previousProjectRoot = projectRoot;
    const previousStateDbPath = process.env.DEVCTX_STATE_DB_PATH;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-status-corrupt-'));
    const corruptPath = path.join(repoRoot, '.devctx', 'state.sqlite');

    try {
      setProjectRoot(repoRoot);
      process.env.DEVCTX_STATE_DB_PATH = corruptPath;
      fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
      fs.writeFileSync(corruptPath, 'not-a-sqlite-database', 'utf8');

      const result = await smartStatus({ format: 'compact' });

      assert.equal(result.success, false);
      assert.equal(result.storageHealth.issue, 'corrupted');
      assert.match(result.message, /corrupted|integrity|unreadable/i);
      assert.ok(result.storageHealth.recommendedActions.length >= 1);
    } finally {
      if (previousStateDbPath !== undefined) {
        process.env.DEVCTX_STATE_DB_PATH = previousStateDbPath;
      } else {
        delete process.env.DEVCTX_STATE_DB_PATH;
      }
      setProjectRoot(previousProjectRoot);
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
