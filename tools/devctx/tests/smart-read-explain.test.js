import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smartRead, clearReadCache } from '../src/tools/smart-read.js';
import { clearExplainCache } from '../src/storage/sqlite.js';
import { buildStructuralExplanation, detectSideEffects, extractDocstring } from '../src/explain/explainer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../evals/fixtures/sample-project');

describe('smart_read mode=explain', () => {
  let originalEnv;
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-explain-test-'));
    originalEnv = process.env.DEVCTX_STATE_DB_PATH;
    process.env.DEVCTX_STATE_DB_PATH = path.join(tempDir, 'state.sqlite');
  });

  after(() => {
    if (originalEnv !== undefined) {
      process.env.DEVCTX_STATE_DB_PATH = originalEnv;
    } else {
      delete process.env.DEVCTX_STATE_DB_PATH;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    clearReadCache();
    await clearExplainCache();
  });

  it('requires symbol parameter', async () => {
    const result = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'explain',
      cwd: fixturesDir,
    });
    assert.match(result.content, /symbol parameter is required/i);
  });

  it('returns structured explanation for a known symbol', async () => {
    const result = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'explain',
      symbol: 'AuthMiddleware',
      cwd: fixturesDir,
    });
    assert.equal(result.mode, 'explain');
    assert.equal(result.parser, 'structural');
    assert.equal(result.indexHint, true);
    assert.match(result.content, /AuthMiddleware/);
    assert.match(result.content, /signature:/);
    assert.match(result.content, /callers:/);
  });

  it('second call hits cache (cached=true)', async () => {
    const filePath = path.join(fixturesDir, 'src/auth/middleware.js');
    const first = await smartRead({ filePath, mode: 'explain', symbol: 'AuthMiddleware', cwd: fixturesDir });
    assert.equal(first.cached, false);

    clearReadCache();

    const second = await smartRead({ filePath, mode: 'explain', symbol: 'AuthMiddleware', cwd: fixturesDir });
    assert.equal(second.cached, true);
    assert.equal(second.content, first.content);
  });

  it('handles multiple symbols in one call', async () => {
    const result = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'explain',
      symbol: ['AuthMiddleware', 'requireRole'],
      cwd: fixturesDir,
    });
    assert.match(result.content, /AuthMiddleware/);
    assert.match(result.content, /requireRole/);
  });

  it('reports missing symbol gracefully', async () => {
    const result = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'explain',
      symbol: 'DefinitelyNotASymbol',
      cwd: fixturesDir,
    });
    assert.match(result.content, /not found/i);
  });
});

describe('explainer building blocks', () => {
  it('detectSideEffects classifies common patterns', () => {
    assert.deepEqual(detectSideEffects("console.log('x'); fs.readFileSync('/tmp/a');").sort(), ['io', 'logging']);
    assert.deepEqual(detectSideEffects('await fetch("/x"); throw new Error("boom");').sort(), ['async', 'network', 'throws']);
    assert.deepEqual(detectSideEffects('return a + b;'), []);
  });

  it('extractDocstring picks up jsdoc above signature', () => {
    const lines = [
      '/**',
      ' * Validates a JWT token',
      ' * and returns the payload',
      ' */',
      'export function validate(token) {',
      '  return jwt.verify(token);',
      '}',
    ];
    const doc = extractDocstring(lines, 4);
    assert.match(doc, /Validates a JWT token/);
  });

  it('buildStructuralExplanation returns null when symbol unknown', () => {
    const result = buildStructuralExplanation({
      fullPath: path.join(fixturesDir, 'src/auth/middleware.js'),
      content: fs.readFileSync(path.join(fixturesDir, 'src/auth/middleware.js'), 'utf8'),
      symbol: 'NopeNotHere',
    });
    assert.equal(result, null);
  });
});
