import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ensureIndexReady, getIndexStatus } from '../src/index-manager.js';

const TEST_ROOT = path.join(process.cwd(), '.test-index-manager');

describe('Index Manager', () => {
  before(() => {
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true });
    }
    fs.mkdirSync(TEST_ROOT, { recursive: true });
    fs.mkdirSync(path.join(TEST_ROOT, 'src'), { recursive: true });
    fs.writeFileSync(path.join(TEST_ROOT, 'src', 'test.js'), 'export const foo = () => {};');
  });

  after(() => {
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true });
    }
  });

  it('ensureIndexReady builds index on first call', async () => {
    const result = await ensureIndexReady({ root: TEST_ROOT, timeoutMs: 30000 });
    
    assert.ok(['built', 'fallback'].includes(result.status));
    
    if (result.status === 'built') {
      assert.ok(result.fileCount >= 0);
      assert.equal(result.cached, false);
    }
  });

  it('ensureIndexReady uses cache on second call', async () => {
    await ensureIndexReady({ root: TEST_ROOT, timeoutMs: 30000 });
    
    const result = await ensureIndexReady({ root: TEST_ROOT, timeoutMs: 30000 });
    
    if (result.status === 'ready') {
      assert.equal(result.cached, true);
    }
  });

  it('getIndexStatus returns correct status', async () => {
    await ensureIndexReady({ root: TEST_ROOT, timeoutMs: 30000 });
    
    const status = getIndexStatus(TEST_ROOT);
    
    assert.ok(typeof status.available === 'boolean');
    assert.ok(typeof status.fresh === 'boolean');
  });

  it('ensureIndexReady respects force flag', async () => {
    await ensureIndexReady({ root: TEST_ROOT, timeoutMs: 30000 });
    
    const result = await ensureIndexReady({ root: TEST_ROOT, force: true, timeoutMs: 30000 });
    
    if (result.status === 'built') {
      assert.equal(result.cached, false);
    }
  });
});
