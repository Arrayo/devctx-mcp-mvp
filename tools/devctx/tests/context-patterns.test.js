import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { recordContextAccess, predictContextFiles, cleanupStalePatterns } from '../src/context-patterns.js';

const TEST_DB_PATH = path.join(process.cwd(), '.devctx', 'test-state.sqlite');

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const SKIP_SQLITE_TESTS = nodeMajor < 22;

describe('context-patterns', { skip: SKIP_SQLITE_TESTS ? 'SQLite tests require Node 22+' : false }, () => {
  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  after(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('recordContextAccess', () => {
    it('should record a new pattern', async () => {
      await recordContextAccess({
        task: 'implement user authentication',
        intent: 'implementation',
        files: [
          { path: 'src/auth/login.js', relevance: 1.0 },
          { path: 'src/auth/middleware.js', relevance: 0.9 }
        ]
      });

      const result = await predictContextFiles({
        task: 'implement user authentication',
        intent: 'implementation'
      });

      assert.ok(result.predicted.length > 0);
      assert.ok(result.confidence > 0.5);
    });

    it('should update existing pattern', async () => {
      await recordContextAccess({
        task: 'fix authentication bug',
        intent: 'debug',
        files: [{ path: 'src/auth/login.js', relevance: 1.0 }]
      });

      await recordContextAccess({
        task: 'fix authentication bug',
        intent: 'debug',
        files: [{ path: 'src/auth/login.js', relevance: 1.0 }]
      });

      const result = await predictContextFiles({
        task: 'fix authentication bug',
        intent: 'debug'
      });

      assert.ok(result.predicted[0].accessCount > 1);
    });

    it('should handle empty files array', async () => {
      await recordContextAccess({
        task: 'test task',
        intent: 'explore',
        files: []
      });

      const result = await predictContextFiles({
        task: 'test task',
        intent: 'explore'
      });

      assert.equal(result.predicted.length, 0);
    });
  });

  describe('predictContextFiles', () => {
    it('should predict files for similar tasks', async () => {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      
      await recordContextAccess({
        task: 'implement user authentication system',
        intent: 'implementation',
        files: [
          { path: 'src/auth/login.js', relevance: 1.0 },
          { path: 'src/auth/middleware.js', relevance: 0.9 },
          { path: 'src/auth/session.js', relevance: 0.8 }
        ]
      });

      await recordContextAccess({
        task: 'implement user authentication system',
        intent: 'implementation',
        files: [
          { path: 'src/auth/login.js', relevance: 1.0 },
          { path: 'src/auth/middleware.js', relevance: 0.9 }
        ]
      });

      await recordContextAccess({
        task: 'implement user authentication system',
        intent: 'implementation',
        files: [
          { path: 'src/auth/login.js', relevance: 1.0 }
        ]
      });

      const result = await predictContextFiles({
        task: 'implement user authentication system',
        intent: 'implementation'
      });

      assert.ok(result.confidence > 0.6);
      assert.ok(result.predicted.length > 0);
      assert.equal(result.predicted[0].path, 'src/auth/login.js');
      assert.ok(result.matchedPattern);
      assert.equal(result.matchedPattern.occurrences, 3);
    });

    it('should return empty for unmatched tasks', async () => {
      await recordContextAccess({
        task: 'implement payment gateway',
        intent: 'implementation',
        files: [{ path: 'src/payment/stripe.js', relevance: 1.0 }]
      });

      const result = await predictContextFiles({
        task: 'fix database connection',
        intent: 'debug'
      });

      assert.equal(result.predicted.length, 0);
      assert.equal(result.confidence, 0);
    });

    it('should respect maxFiles limit', async () => {
      const files = Array.from({ length: 15 }, (_, i) => ({
        path: `src/file${i}.js`,
        relevance: 1.0 - (i * 0.05)
      }));

      await recordContextAccess({
        task: 'large refactor',
        intent: 'implementation',
        files
      });

      await recordContextAccess({
        task: 'large refactor',
        intent: 'implementation',
        files
      });

      await recordContextAccess({
        task: 'large refactor',
        intent: 'implementation',
        files
      });

      const result = await predictContextFiles({
        task: 'large refactor',
        intent: 'implementation',
        maxFiles: 5
      });

      assert.ok(result.predicted.length <= 5);
    });

    it('should match intent correctly', async () => {
      await recordContextAccess({
        task: 'authentication',
        intent: 'implementation',
        files: [{ path: 'src/auth/login.js', relevance: 1.0 }]
      });

      await recordContextAccess({
        task: 'authentication',
        intent: 'implementation',
        files: [{ path: 'src/auth/login.js', relevance: 1.0 }]
      });

      await recordContextAccess({
        task: 'authentication',
        intent: 'implementation',
        files: [{ path: 'src/auth/login.js', relevance: 1.0 }]
      });

      await recordContextAccess({
        task: 'authentication',
        intent: 'debug',
        files: [{ path: 'tests/auth.test.js', relevance: 1.0 }]
      });

      const implResult = await predictContextFiles({
        task: 'authentication',
        intent: 'implementation'
      });

      const debugResult = await predictContextFiles({
        task: 'authentication',
        intent: 'debug'
      });

      assert.equal(implResult.predicted[0].path, 'src/auth/login.js');
      assert.equal(debugResult.predicted[0].path, 'tests/auth.test.js');
    });
  });

  describe('cleanupStalePatterns', () => {
    it('should remove old patterns', async () => {
      await recordContextAccess({
        task: 'old task',
        intent: 'explore',
        files: [{ path: 'src/old.js', relevance: 1.0 }]
      });

      const result = await cleanupStalePatterns({ retentionDays: 0 });

      assert.ok(result.deletedPatterns > 0);

      const prediction = await predictContextFiles({
        task: 'old task',
        intent: 'explore'
      });

      assert.equal(prediction.predicted.length, 0);
    });
  });
});
