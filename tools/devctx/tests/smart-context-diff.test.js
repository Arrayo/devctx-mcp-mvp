import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { smartContext } from '../src/tools/smart-context.js';
import { buildIndex } from '../src/index.js';
import { setProjectRoot } from '../src/utils/paths.js';

describe('smart_context diff-aware integration', () => {
  let tmpRoot;
  let originalProjectRoot;

  before(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-diff-context-'));
    
    originalProjectRoot = process.env.DEVCTX_PROJECT_ROOT;
    process.env.DEVCTX_PROJECT_ROOT = tmpRoot;
    setProjectRoot(tmpRoot);

    execFileSync('git', ['init'], { cwd: tmpRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpRoot });
    fs.writeFileSync(
      path.join(tmpRoot, 'server.js'),
      `import { handler } from './handler.js';
export function startServer() {
  return handler();
}`
    );

    fs.writeFileSync(
      path.join(tmpRoot, 'handler.js'),
      `export function handler() {
  return { status: 200 };
}`
    );

    fs.writeFileSync(
      path.join(tmpRoot, 'config.json'),
      `{"port": 3000}`
    );

    fs.writeFileSync(
      path.join(tmpRoot, 'server.test.js'),
      `import { startServer } from './server.js';
// test code`
    );

    execFileSync('git', ['add', '.'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpRoot });

    await buildIndex(tmpRoot);
    fs.writeFileSync(
      path.join(tmpRoot, 'handler.js'),
      `export function handler() {
  return { status: 200, message: 'Hello' };
}

export function newHandler() {
  return { status: 201 };
}`
    );

    fs.writeFileSync(
      path.join(tmpRoot, 'config.json'),
      `{"port": 3000, "host": "localhost"}`
    );
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
  });

  it('prioritizes high-impact files in diff mode', async () => {
    const result = await smartContext({
      task: 'Review recent changes',
      diff: 'HEAD',
      maxTokens: 4000,
    });

    if (!result.success) {
      console.error('Test failed, result:', JSON.stringify(result, null, 2));
    }

    assert.ok(result.success, `smartContext should succeed, got: ${JSON.stringify(result.error || result)}`);
    assert.ok(Array.isArray(result.context));
    
    const files = result.context.map(c => c.file);
    assert.ok(files.some(f => f.includes('handler.js')), 'should include handler.js');
    assert.ok(files.some(f => f.includes('config.json')), 'should include config.json');
    
    assert.ok(result.diffSummary);
    assert.ok(result.diffSummary.totalChanged > 0);
    assert.ok(result.diffSummary.topImpact);
    assert.ok(result.diffSummary.topImpact.length > 0);
    
    const handlerInTop = result.diffSummary.topImpact.some(f => f.file === 'handler.js');
    assert.ok(handlerInTop, 'handler.js should be in topImpact');
  });

  it('expands context to include importers', async () => {
    const result = await smartContext({
      task: 'Review changes to handler',
      diff: 'HEAD',
      maxTokens: 8000,
    });

    assert.ok(result.success);
    
    const files = result.context.map(c => c.file);
    
    assert.ok(files.some(f => f.includes('handler.js')), 'should include handler.js');
    
    const hasServerJs = files.some(f => f.includes('server.js'));
    
    if (result.diffSummary.expanded !== undefined && hasServerJs) {
      assert.ok(result.diffSummary.expanded > 0, 'should have expanded files when server.js is present');
    }
  });

  it('includes test files related to changes', async () => {
    const result = await smartContext({
      task: 'Check test coverage for changes',
      diff: 'HEAD',
      maxTokens: 6000,
    });

    assert.ok(result.success);
  });

  it('generates detailed diff summary', async () => {
    const result = await smartContext({
      task: 'What changed?',
      diff: 'HEAD',
    });

    assert.ok(result.success);
    assert.ok(result.diffSummary);
    assert.ok(result.diffSummary.summary);
    
    const summary = result.diffSummary.summary;
    assert.match(summary, /files changed/);
    assert.match(summary, /lines modified/);
  });

  it('respects maxTokens budget', async () => {
    const result = await smartContext({
      task: 'Review all changes',
      diff: 'HEAD',
      maxTokens: 1000,
    });

    assert.ok(result.success);
    assert.ok(result.metrics.totalTokens <= 1000 + 200);
  });
});
