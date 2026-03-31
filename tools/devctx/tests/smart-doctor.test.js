import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { smartDoctor } from '../src/tools/smart-doctor.js';
import { initializeStateDb, withStateDb } from '../src/storage/sqlite.js';
import { projectRoot, setProjectRoot } from '../src/utils/runtime-config.js';

let hasNodeSqlite = false;
try {
  await import('node:sqlite');
  hasNodeSqlite = true;
} catch {
  hasNodeSqlite = false;
}

(hasNodeSqlite ? describe : describe.skip)('smart_doctor', () => {
  it('returns healthy checks for initialized local state', async () => {
    const previousProjectRoot = projectRoot;
    const previousStateDbPath = process.env.DEVCTX_STATE_DB_PATH;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-doctor-healthy-'));
    const stateDbPath = path.join(repoRoot, '.devctx', 'state.sqlite');

    try {
      setProjectRoot(repoRoot);
      process.env.DEVCTX_STATE_DB_PATH = stateDbPath;
      await initializeStateDb({ filePath: stateDbPath });

      const result = await smartDoctor();

      assert.equal(result.overall, 'ok');
      assert.equal(result.storageHealth.issue, 'ok');
      assert.equal(result.checks.find((check) => check.id === 'storageHealth')?.status, 'ok');
      assert.equal(result.checks.find((check) => check.id === 'legacyState')?.status, 'ok');
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

  it('surfaces repo safety blocks as doctor errors', async () => {
    const previousProjectRoot = projectRoot;
    const previousStateDbPath = process.env.DEVCTX_STATE_DB_PATH;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-doctor-blocked-'));
    const stateDbPath = path.join(repoRoot, '.devctx', 'state.sqlite');

    try {
      setProjectRoot(repoRoot);
      process.env.DEVCTX_STATE_DB_PATH = stateDbPath;
      execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.devctx/\n', 'utf8');
      await initializeStateDb({ filePath: stateDbPath });
      execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: repoRoot, stdio: 'ignore' });

      const result = await smartDoctor();

      assert.equal(result.overall, 'error');
      assert.equal(result.mutationSafety.blocked, true);
      assert.deepStrictEqual(result.mutationSafety.blockedBy, ['tracked', 'staged']);
      assert.equal(result.checks.find((check) => check.id === 'repoSafety')?.status, 'error');
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

  it('reports corrupted SQLite state with recovery guidance', async () => {
    const previousProjectRoot = projectRoot;
    const previousStateDbPath = process.env.DEVCTX_STATE_DB_PATH;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-doctor-corrupt-'));
    const stateDbPath = path.join(repoRoot, '.devctx', 'state.sqlite');

    try {
      setProjectRoot(repoRoot);
      process.env.DEVCTX_STATE_DB_PATH = stateDbPath;
      fs.mkdirSync(path.dirname(stateDbPath), { recursive: true });
      fs.writeFileSync(stateDbPath, 'not-a-sqlite-database', 'utf8');

      const result = await smartDoctor();

      assert.equal(result.overall, 'error');
      assert.equal(result.storageHealth.issue, 'corrupted');
      assert.equal(result.checks.find((check) => check.id === 'storageHealth')?.status, 'error');
      assert.ok(result.recommendedActions.some((action) => /back up|Delete the corrupted/i.test(action)));
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

  it('recommends compaction and legacy cleanup when local state has drifted', async () => {
    const previousProjectRoot = projectRoot;
    const previousStateDbPath = process.env.DEVCTX_STATE_DB_PATH;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-doctor-maintenance-'));
    const stateDbPath = path.join(repoRoot, '.devctx', 'state.sqlite');
    const legacySessionsDir = path.join(repoRoot, '.devctx', 'sessions');

    try {
      setProjectRoot(repoRoot);
      process.env.DEVCTX_STATE_DB_PATH = stateDbPath;
      await initializeStateDb({ filePath: stateDbPath });
      await withStateDb((db) => {
        db.prepare(`
          INSERT INTO sessions(
            session_id, goal, status, current_focus, why_blocked, next_step,
            pinned_context_json, unresolved_questions_json, blockers_json, snapshot_json,
            completed_count, decisions_count, touched_files_count, created_at, updated_at
          ) VALUES(?, ?, ?, '', '', '', '[]', '[]', '[]', '{}', 0, 0, 0, ?, ?)
        `).run('doctor-maintenance', 'Doctor maintenance', 'in_progress', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');

        for (let index = 0; index < 250; index += 1) {
          db.prepare(`
            INSERT INTO session_events(session_id, event_type, payload_json, token_cost, created_at)
            VALUES(?, 'append', '{}', 0, ?)
          `).run('doctor-maintenance', `2026-03-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`);
        }

        db.prepare(`
          INSERT INTO meta(key, value)
          VALUES('state_compacted_at', '2026-01-01T00:00:00.000Z')
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run();
        db.prepare(`
          INSERT INTO meta(key, value)
          VALUES('state_compaction_retention_days', '30')
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run();
      }, { filePath: stateDbPath });

      fs.mkdirSync(legacySessionsDir, { recursive: true });
      fs.writeFileSync(path.join(legacySessionsDir, 'old-session.json'), JSON.stringify({ sessionId: 'old-session' }), 'utf8');

      const result = await smartDoctor();

      assert.equal(result.overall, 'warning');
      assert.equal(result.checks.find((check) => check.id === 'compaction')?.status, 'warning');
      assert.equal(result.checks.find((check) => check.id === 'legacyState')?.status, 'warning');
      assert.ok(result.recommendedActions.some((action) => /compact/i.test(action)));
      assert.ok(result.recommendedActions.some((action) => /cleanup_legacy/i.test(action)));
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

  it('smart-context-doctor emits JSON output for automation', () => {
    const previousProjectRoot = projectRoot;
    const previousStateDbPath = process.env.DEVCTX_STATE_DB_PATH;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-doctor-cli-'));
    const stateDbPath = path.join(repoRoot, '.devctx', 'state.sqlite');

    try {
      setProjectRoot(repoRoot);
      process.env.DEVCTX_STATE_DB_PATH = stateDbPath;
      fs.mkdirSync(path.dirname(stateDbPath), { recursive: true });
      fs.writeFileSync(stateDbPath, 'not-a-sqlite-database', 'utf8');

      let stdout = '';
      let stderr = '';

      try {
        stdout = execFileSync(process.execPath, ['scripts/doctor-state.js', '--json', '--project-root', repoRoot], {
          cwd: path.resolve('.'),
          encoding: 'utf8',
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        stderr = typeof error.stderr === 'string' ? error.stderr : error.stderr?.toString?.() ?? '';
      }

      const payload = stdout || stderr;
      const jsonMatch = payload.match(/^\{[\s\S]*\}$/m);
      const jsonText = jsonMatch ? jsonMatch[0] : payload;
      const result = JSON.parse(jsonText);

      assert.equal(result.overall, 'error');
      assert.equal(result.storageHealth.issue, 'corrupted');
      assert.ok(Array.isArray(result.checks));
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
