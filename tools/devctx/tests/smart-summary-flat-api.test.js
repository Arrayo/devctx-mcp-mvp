import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { smartSummary } from '../src/tools/smart-summary.js';

let hasNodeSqlite = false;
try {
  await import('node:sqlite');
  hasNodeSqlite = true;
} catch {
  hasNodeSqlite = false;
}

(hasNodeSqlite ? describe : describe.skip)('smart_summary flat API', () => {
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

  it('should accept flat format (new API)', async function() {
    const result = await smartSummary({
      action: 'update',
      goal: 'Test flat API',
      status: 'in_progress',
      nextStep: 'Verify it works',
      decisions: ['Use flat format', 'Maintain compatibility'],
    });

    assert.ok(result.sessionId);
    assert.equal(result.summary.goal, 'Test flat API');
    assert.equal(result.summary.status, 'in_progress');
    assert.equal(result.summary.nextStep, 'Verify it works');
  });

  it('should still accept nested format (old API)', async function() {
    const result = await smartSummary({
      action: 'update',
      update: {
        goal: 'Test nested API',
        status: 'in_progress',
        nextStep: 'Verify backward compatibility',
        decisions: ['Keep old format working'],
      },
    });

    assert.ok(result.sessionId);
    assert.equal(result.summary.goal, 'Test nested API');
    assert.equal(result.summary.status, 'in_progress');
  });

  it('should prioritize nested format when both provided', async function() {
    const result = await smartSummary({
      action: 'update',
      goal: 'Flat goal',
      update: {
        goal: 'Nested goal',
        status: 'in_progress',
      },
    });

    assert.equal(result.summary.goal, 'Nested goal');
  });
});
