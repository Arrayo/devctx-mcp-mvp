import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  getFileBlame,
  getSymbolBlame,
  getFileAuthorshipStats,
  findSymbolsByAuthor,
  getRecentlyModifiedSymbols,
} from '../src/git-blame.js';
import { buildIndex, persistIndex } from '../src/index.js';
import { setProjectRoot } from '../src/utils/paths.js';

describe('git-blame', () => {
  let tmpRoot;
  let originalProjectRoot;

  before(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-blame-'));
    
    originalProjectRoot = process.env.DEVCTX_PROJECT_ROOT;
    process.env.DEVCTX_PROJECT_ROOT = tmpRoot;
    setProjectRoot(tmpRoot);

    execFileSync('git', ['init'], { cwd: tmpRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'alice@test.com'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.name', 'Alice'], { cwd: tmpRoot });

    fs.writeFileSync(path.join(tmpRoot, 'app.js'), `export function main() {
  console.log('hello');
}

export function helper() {
  return 42;
}
`);
    
    execFileSync('git', ['add', '.'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpRoot });

    execFileSync('git', ['config', 'user.email', 'bob@test.com'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.name', 'Bob'], { cwd: tmpRoot });

    const content = fs.readFileSync(path.join(tmpRoot, 'app.js'), 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'app.js'), content.replace('return 42;', 'return 100;'));
    
    execFileSync('git', ['add', '.'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-m', 'update helper'], { cwd: tmpRoot });

    const index = buildIndex(tmpRoot);
    await persistIndex(index, tmpRoot);
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

  it('getFileBlame returns line-level attribution', async () => {
    const blame = await getFileBlame('app.js', tmpRoot);

    assert.ok(Array.isArray(blame));
    assert.ok(blame.length > 0);
    assert.ok(blame[0].author);
    assert.ok(blame[0].email);
    assert.ok(blame[0].date);
    assert.ok(blame[0].commit);
    assert.ok(blame[0].content !== undefined);
    assert.equal(typeof blame[0].line, 'number');
  });

  it('getSymbolBlame returns function-level attribution', async () => {
    const symbolBlame = await getSymbolBlame('app.js', tmpRoot);

    assert.ok(Array.isArray(symbolBlame));
    assert.ok(symbolBlame.length >= 2, 'should have at least 2 functions');

    const mainFunc = symbolBlame.find(s => s.symbol === 'main');
    assert.ok(mainFunc, 'should find main function');
    assert.equal(mainFunc.kind, 'function');
    assert.equal(mainFunc.author, 'Alice');
    assert.equal(mainFunc.email, 'alice@test.com');
    assert.ok(mainFunc.authorshipPercentage > 0);

    const helperFunc = symbolBlame.find(s => s.symbol === 'helper');
    assert.ok(helperFunc, 'should find helper function');
    assert.ok(helperFunc.contributors >= 1);
  });

  it('getFileAuthorshipStats returns aggregated file stats', async () => {
    const stats = await getFileAuthorshipStats('app.js', tmpRoot);

    assert.ok(stats.totalLines > 0);
    assert.ok(Array.isArray(stats.authors));
    assert.ok(stats.authors.length > 0);
    assert.ok(stats.lastModified);
    assert.ok(stats.oldestLine);

    const alice = stats.authors.find(a => a.email === 'alice@test.com');
    assert.ok(alice, 'should have Alice as contributor');
    assert.ok(alice.lines > 0);
    assert.ok(alice.percentage > 0);
    assert.ok(alice.commits > 0);
  });

  it('findSymbolsByAuthor finds symbols by author name', async () => {
    const results = await findSymbolsByAuthor('Alice', tmpRoot, 10);

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results[0].file);
    assert.ok(results[0].symbol);
    assert.ok(results[0].author);
    assert.equal(results[0].author, 'Alice');
  });

  it('findSymbolsByAuthor finds symbols by email', async () => {
    const results = await findSymbolsByAuthor('alice@test.com', tmpRoot, 10);

    assert.ok(Array.isArray(results));
    assert.ok(results.some(r => r.email === 'alice@test.com'));
  });

  it('getRecentlyModifiedSymbols returns recent changes', async () => {
    const results = await getRecentlyModifiedSymbols(tmpRoot, 10, 30);

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results[0].file);
    assert.ok(results[0].symbol);
    assert.ok(results[0].author);
    assert.ok(results[0].date);
    assert.ok(typeof results[0].daysAgo === 'number');
    assert.ok(results[0].daysAgo >= 0);
  });

  it('getFileBlame handles missing files gracefully', async () => {
    const blame = await getFileBlame('missing.js', tmpRoot);

    assert.ok(Array.isArray(blame));
    assert.equal(blame.length, 0);
  });

  it('getSymbolBlame handles files without index', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'unindexed.js'), 'export const x = 1;\n');
    execFileSync('git', ['add', '.'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-m', 'add unindexed'], { cwd: tmpRoot });

    const symbolBlame = await getSymbolBlame('unindexed.js', tmpRoot);

    assert.ok(Array.isArray(symbolBlame));
    assert.equal(symbolBlame.length, 0);
  });

  it('getSymbolBlame calculates authorship percentage correctly', async () => {
    const symbolBlame = await getSymbolBlame('app.js', tmpRoot);

    for (const sb of symbolBlame) {
      assert.ok(sb.authorshipPercentage >= 0 && sb.authorshipPercentage <= 100);
      assert.ok(sb.linesAuthored <= sb.totalLines);
    }
  });
});
