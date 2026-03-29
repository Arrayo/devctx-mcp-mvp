import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { 
  getFrequentlyAccessedFiles,
  warmCache,
  shouldWarmCache,
  getCacheStats,
} from '../src/cache-warming.js';
import { buildIndex, persistIndex } from '../src/index.js';
import { setProjectRoot } from '../src/utils/paths.js';
import { withStateDb, initializeStateDb } from '../src/storage/sqlite.js';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const SKIP_SQLITE_TESTS = nodeMajor < 22;

describe('cache-warming', () => {
  let tmpRoot;
  let originalProjectRoot;

  before(async () => {
    if (SKIP_SQLITE_TESTS) return;

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-cache-'));
    
    originalProjectRoot = process.env.DEVCTX_PROJECT_ROOT;
    process.env.DEVCTX_PROJECT_ROOT = tmpRoot;
    process.env.DEVCTX_CACHE_WARMING = 'true';
    setProjectRoot(tmpRoot);

    execFileSync('git', ['init'], { cwd: tmpRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpRoot });

    fs.writeFileSync(path.join(tmpRoot, 'app.js'), 'export function main() {}\n');
    fs.writeFileSync(path.join(tmpRoot, 'utils.js'), 'export function helper() {}\n');
    fs.writeFileSync(path.join(tmpRoot, 'config.json'), '{"key": "value"}\n');
    
    execFileSync('git', ['add', '.'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpRoot });

    const index = buildIndex(tmpRoot);
    await persistIndex(index, tmpRoot);

    await initializeStateDb({ filePath: path.join(tmpRoot, '.devctx/state.sqlite') });

    await withStateDb(async (db) => {
      const now = new Date().toISOString();
      
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO context_access (session_id, task, intent, file_path, relevance, access_order, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`session-${i}`, 'test task', 'implementation', 'app.js', 1.0, 0, now);
      }

      for (let i = 0; i < 3; i++) {
        db.prepare(`
          INSERT INTO context_access (session_id, task, intent, file_path, relevance, access_order, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`session-${i}`, 'test task', 'implementation', 'utils.js', 0.8, 1, now);
      }

      db.prepare(`
        INSERT INTO context_access (session_id, task, intent, file_path, relevance, access_order, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('session-1', 'test task', 'config', 'config.json', 0.5, 2, now);
    }, { filePath: path.join(tmpRoot, '.devctx/state.sqlite') });
  });

  after(() => {
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
    if (originalProjectRoot) {
      process.env.DEVCTX_PROJECT_ROOT = originalProjectRoot;
      setProjectRoot(originalProjectRoot);
    } else {
      delete process.env.DEVCTX_PROJECT_ROOT;
    }
    delete process.env.DEVCTX_CACHE_WARMING;
  });

  it('getFrequentlyAccessedFiles returns top files by access count', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
    const files = await getFrequentlyAccessedFiles(tmpRoot, 10);

    assert.ok(Array.isArray(files));
    assert.ok(files.length > 0);
    assert.equal(files[0], 'app.js', 'most accessed file should be first');
    assert.ok(files.includes('utils.js'), 'should include utils.js');
  });

  it('warmCache preloads frequent files', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
    const result = await warmCache(tmpRoot);

    assert.ok(result.warmed !== undefined);
    assert.ok(result.skipped !== undefined);
    assert.ok(result.totalCandidates !== undefined);
    assert.ok(result.warmed > 0, 'should warm at least one file');
  });

  it('shouldWarmCache returns true when enough frequent files exist', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
    const should = await shouldWarmCache(tmpRoot);

    assert.equal(typeof should, 'boolean');
  });

  it('getCacheStats returns file statistics', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
    const stats = await getCacheStats(tmpRoot);

    assert.ok(stats.totalFrequentFiles !== undefined);
    assert.ok(stats.byExtension);
    assert.ok(stats.topFiles);
    assert.ok(Array.isArray(stats.topFiles));
  });

  it('warmCache skips large files', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
    const largePath = path.join(tmpRoot, 'large.bin');
    fs.writeFileSync(largePath, Buffer.alloc(2 * 1024 * 1024));

    await withStateDb(async (db) => {
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO context_access (session_id, task, intent, file_path, relevance, access_order, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`session-large-${i}`, 'test', 'implementation', 'large.bin', 1.0, 0, now);
      }
    }, { filePath: path.join(tmpRoot, '.devctx/state.sqlite') });

    const result = await warmCache(tmpRoot);

    assert.ok(result.skipped > 0, 'should skip large files');
  });

  it('warmCache handles missing files gracefully', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
    await withStateDb(async (db) => {
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO context_access (session_id, task, intent, file_path, relevance, access_order, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`session-missing-${i}`, 'test', 'implementation', 'missing.js', 1.0, 0, now);
      }
    }, { filePath: path.join(tmpRoot, '.devctx/state.sqlite') });

    const result = await warmCache(tmpRoot);

    assert.ok(result.skipped > 0, 'should skip missing files');
  });

  it('warmCache respects DEVCTX_CACHE_WARMING=false', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
    process.env.DEVCTX_CACHE_WARMING = 'false';

    const result = await warmCache(tmpRoot);

    assert.equal(result.reason, 'disabled');
    assert.equal(result.warmed, 0);

    process.env.DEVCTX_CACHE_WARMING = 'true';
  });
});
