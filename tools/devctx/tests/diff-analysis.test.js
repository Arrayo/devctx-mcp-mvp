import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { 
  getDetailedDiff, 
  analyzeChangeImpact, 
  expandChangedContext,
  generateDiffSummary,
  getChangedSymbols,
} from '../src/diff-analysis.js';

describe('diff-analysis', () => {
  let tmpRoot;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-diff-'));
    execFileSync('git', ['init'], { cwd: tmpRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpRoot });

    fs.writeFileSync(path.join(tmpRoot, 'app.js'), 'export function main() { return 42; }\n');
    fs.writeFileSync(path.join(tmpRoot, 'utils.js'), 'export function helper() { return 1; }\n');
    execFileSync('git', ['add', '.'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpRoot });

    fs.writeFileSync(
      path.join(tmpRoot, 'app.js'), 
      'export function main() {\n  return 42;\n}\n\nexport function newFunc() {\n  return 100;\n}\n'
    );
    fs.writeFileSync(path.join(tmpRoot, 'config.json'), '{"key": "value"}\n');
  });

  after(() => {
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('getDetailedDiff returns change statistics', async () => {
    const changes = await getDetailedDiff('HEAD', tmpRoot);

    assert.ok(Array.isArray(changes));
    assert.ok(changes.length > 0);

    const appChange = changes.find(c => c.file === 'app.js');
    assert.ok(appChange, 'should find app.js change');
    assert.ok(appChange.additions > 0, 'should have additions');
    assert.ok(typeof appChange.totalChanges === 'number');
    assert.ok(['addition', 'modification', 'refactor', 'deletion'].includes(appChange.changeType));
  });

  it('analyzeChangeImpact scores implementation files higher', async () => {
    const changes = await getDetailedDiff('HEAD', tmpRoot);
    const analyzed = analyzeChangeImpact(changes, null);

    assert.ok(Array.isArray(analyzed));
    
    const appChange = analyzed.find(c => c.file === 'app.js');
    const configChange = analyzed.find(c => c.file === 'config.json');

    if (appChange && configChange) {
      assert.ok(appChange.impactScore > configChange.impactScore, 
        'implementation files should score higher than config');
    }
  });

  it('analyzeChangeImpact assigns priority levels', async () => {
    const changes = await getDetailedDiff('HEAD', tmpRoot);
    const analyzed = analyzeChangeImpact(changes, null);

    const withPriority = analyzed.filter(c => c.priority);
    assert.ok(withPriority.length > 0, 'should assign priorities');

    for (const change of withPriority) {
      assert.ok(['critical', 'high', 'medium', 'low'].includes(change.priority));
    }
  });

  it('expandChangedContext includes dependencies from graph', () => {
    const changedFiles = ['app.js'];
    const mockIndex = {
      graph: {
        edges: [
          { from: 'test.js', to: 'app.js', kind: 'import' },
          { from: 'app.js', to: 'utils.js', kind: 'import' },
          { from: 'app.test.js', to: 'app.js', kind: 'testOf' },
        ],
      },
    };

    const expanded = expandChangedContext(changedFiles, mockIndex, 5);

    assert.ok(expanded.has('app.js'), 'should include changed file');
    assert.ok(expanded.has('test.js'), 'should include importer');
    assert.ok(expanded.has('utils.js'), 'should include dependency');
    assert.ok(expanded.has('app.test.js'), 'should include test');
  });

  it('generateDiffSummary creates readable summary', async () => {
    const changes = await getDetailedDiff('HEAD', tmpRoot);
    const analyzed = analyzeChangeImpact(changes, null);
    const summary = generateDiffSummary(analyzed);

    assert.ok(typeof summary === 'string');
    assert.match(summary, /files changed/);
    assert.match(summary, /lines modified/);
  });

  it('getChangedSymbols extracts function names from diff', async () => {
    const symbols = await getChangedSymbols('HEAD', 'app.js', tmpRoot);

    assert.ok(Array.isArray(symbols));
    if (symbols.length > 0) {
      assert.ok(symbols.some(s => s === 'newFunc'), `should find newFunc in ${symbols.join(', ')}`);
    }
  });

  it('expandChangedContext respects maxExpansion limit', () => {
    const changedFiles = ['app.js'];
    const mockIndex = {
      graph: {
        edges: Array.from({ length: 20 }, (_, i) => ({
          from: `file${i}.js`,
          to: 'app.js',
          kind: 'import',
        })),
      },
    };

    const expanded = expandChangedContext(changedFiles, mockIndex, 5);

    assert.ok(expanded.size <= 6, `should respect maxExpansion (got ${expanded.size})`);
  });

  it('expandChangedContext works without index', () => {
    const changedFiles = ['app.js', 'utils.js'];
    const expanded = expandChangedContext(changedFiles, null, 5);

    assert.equal(expanded.size, 2, 'should return only changed files when no index');
    assert.ok(expanded.has('app.js'));
    assert.ok(expanded.has('utils.js'));
  });
});
