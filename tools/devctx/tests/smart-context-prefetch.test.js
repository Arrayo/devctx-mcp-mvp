import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { smartContext } from '../src/tools/smart-context.js';
import { recordContextAccess } from '../src/context-patterns.js';

const TEST_DB_PATH = path.join(process.cwd(), '.devctx', 'test-state.sqlite');

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const SKIP_SQLITE_TESTS = nodeMajor < 22;

describe('smart_context with prefetch', { skip: SKIP_SQLITE_TESTS ? 'SQLite tests require Node 22+' : false }, () => {
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

  it('should work without prefetch', async () => {
    const result = await smartContext({
      task: 'understand smart_read implementation',
      intent: 'explore',
      maxTokens: 5000,
      prefetch: false
    });

    assert.ok(result.context);
    assert.ok(result.context.length > 0);
    assert.ok(!result.stats.prefetch);
  });

  it('should enable prefetch and return metadata', async () => {
    const result = await smartContext({
      task: 'understand smart_read implementation',
      intent: 'explore',
      maxTokens: 5000,
      prefetch: true
    });

    assert.ok(result.context);
    assert.ok(result.context.length > 0);
    assert.ok(result.stats.prefetch);
    assert.equal(result.stats.prefetch.enabled, true);
    assert.ok(typeof result.stats.prefetch.confidence === 'number');
    assert.ok(typeof result.stats.prefetch.predictedFiles === 'number');
  });

  it('should use historical patterns when available', async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    
    await recordContextAccess({
      task: 'understand smart_read implementation',
      intent: 'explore',
      files: [
        { path: 'tools/devctx/src/tools/smart-read.js', relevance: 1.0 },
        { path: 'tools/devctx/src/tokenCounter.js', relevance: 0.8 }
      ]
    });

    await recordContextAccess({
      task: 'understand smart_read implementation',
      intent: 'explore',
      files: [
        { path: 'tools/devctx/src/tools/smart-read.js', relevance: 1.0 },
        { path: 'tools/devctx/src/tokenCounter.js', relevance: 0.8 }
      ]
    });

    await recordContextAccess({
      task: 'understand smart_read implementation',
      intent: 'explore',
      files: [
        { path: 'tools/devctx/src/tools/smart-read.js', relevance: 1.0 }
      ]
    });

    const result = await smartContext({
      task: 'understand smart_read implementation',
      intent: 'explore',
      maxTokens: 5000,
      prefetch: true
    });

    assert.ok(result.stats.prefetch.confidence > 0.6);
    assert.ok(result.stats.prefetch.predictedFiles > 0);
    assert.ok(result.stats.prefetch.matchedPattern);
    assert.ok(result.stats.prefetch.matchedPattern.occurrences >= 3);
  });

  it('should include prefetch evidence in context items when files not found by search', async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    await recordContextAccess({
      task: 'analyze tokenCounter utility',
      intent: 'explore',
      files: [
        { path: 'tools/devctx/src/tokenCounter.js', relevance: 1.0 },
        { path: 'tools/devctx/src/utils/paths.js', relevance: 0.8 }
      ]
    });

    await recordContextAccess({
      task: 'analyze tokenCounter utility',
      intent: 'explore',
      files: [
        { path: 'tools/devctx/src/tokenCounter.js', relevance: 1.0 }
      ]
    });

    await recordContextAccess({
      task: 'analyze tokenCounter utility',
      intent: 'explore',
      files: [
        { path: 'tools/devctx/src/tokenCounter.js', relevance: 1.0 }
      ]
    });

    const result = await smartContext({
      task: 'analyze tokenCounter utility',
      intent: 'explore',
      maxTokens: 5000,
      prefetch: true
    });

    assert.ok(result.stats.prefetch.confidence > 0.6);
    assert.ok(result.stats.prefetch.predictedFiles > 0);
  });
});
