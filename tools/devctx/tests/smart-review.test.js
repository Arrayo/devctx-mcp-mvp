import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { buildIndex } from '../src/index.js';
import { smartReview } from '../src/tools/smart-review.js';
import {
  detectIssuesInDiff,
  detectLayer,
  summarizeIssues,
} from '../src/review/heuristics.js';
import { setProjectRoot, projectRoot as originalProjectRoot } from '../src/utils/runtime-config.js';

const writeFixture = (root, files) => {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
};

describe('review heuristics', () => {
  it('detects console.log added in a diff hunk', () => {
    const diff = [
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      '+console.log("debug");',
      ' const b = 2;',
    ].join('\n');
    const issues = detectIssuesInDiff(diff, { relPath: 'src/foo.js' });
    assert.ok(issues.some((i) => i.kind === 'console-log'));
  });

  it('detects TODO and debugger and eval', () => {
    const diff = [
      '@@ -0,0 +1,3 @@',
      '+// TODO: refactor this',
      '+debugger;',
      '+eval(someInput);',
    ].join('\n');
    const issues = detectIssuesInDiff(diff, { relPath: 'src/x.js' });
    const kinds = new Set(issues.map((i) => i.kind));
    assert.ok(kinds.has('todo'));
    assert.ok(kinds.has('debugger'));
    assert.ok(kinds.has('eval'));
    const sev = summarizeIssues(issues);
    assert.ok(sev.high >= 2);
  });

  it('"any" issues are only reported in TS files', () => {
    const diff = ['@@ -0,0 +1,1 @@', '+const x: any = 1;'].join('\n');
    const ts = detectIssuesInDiff(diff, { relPath: 'src/x.ts' });
    const js = detectIssuesInDiff(diff, { relPath: 'src/x.js' });
    assert.ok(ts.some((i) => i.kind === 'any-annot'));
    assert.equal(js.length, 0);
  });

  it('detectLayer classifies common paths', () => {
    assert.equal(detectLayer('src/domain/order.js'), 'domain');
    assert.equal(detectLayer('src/application/use-cases/create.js'), 'application');
    assert.equal(detectLayer('src/infrastructure/db/repo.js'), 'infrastructure');
    assert.equal(detectLayer('src/utils/log.js'), null);
  });
});

describe('smart_review integration', () => {
  let tempRoot;
  let savedRoot;
  let savedIndexDir;
  let savedDb;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-review-'));

    const initial = {
      'src/domain/order.js': "export const total = (items) => items.length;\n",
      'src/application/cart.js': "import { total } from '../domain/order.js';\nexport const checkout = (i) => total(i);\n",
      'src/infrastructure/api.js': "import { checkout } from '../application/cart.js';\nexport const handle = (req) => checkout(req.items);\n",
      'tests/cart.test.js': "import { checkout } from '../src/application/cart.js';\ncheckout([]);\n",
    };
    writeFixture(tempRoot, initial);

    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -q -m init', {
      cwd: tempRoot,
      stdio: 'ignore',
    });

    fs.writeFileSync(
      path.join(tempRoot, 'src/application/cart.js'),
      [
        "import { total } from '../domain/order.js';",
        "// TODO: validate inputs",
        "export const checkout = (i) => {",
        "  console.log('debug');",
        "  return total(i);",
        "};",
        "",
      ].join('\n'),
    );

    fs.mkdirSync(path.join(tempRoot, '.devctx'), { recursive: true });
    const index = buildIndex(tempRoot);
    fs.writeFileSync(path.join(tempRoot, '.devctx', 'index.json'), JSON.stringify(index));

    savedRoot = originalProjectRoot;
    savedIndexDir = process.env.DEVCTX_INDEX_DIR;
    savedDb = process.env.DEVCTX_STATE_DB_PATH;
    setProjectRoot(tempRoot);
    process.env.DEVCTX_INDEX_DIR = path.join(tempRoot, '.devctx');
    process.env.DEVCTX_STATE_DB_PATH = path.join(tempRoot, '.devctx', 'state.db');
  });

  after(() => {
    setProjectRoot(savedRoot);
    if (savedIndexDir !== undefined) process.env.DEVCTX_INDEX_DIR = savedIndexDir;
    else delete process.env.DEVCTX_INDEX_DIR;
    if (savedDb !== undefined) process.env.DEVCTX_STATE_DB_PATH = savedDb;
    else delete process.env.DEVCTX_STATE_DB_PATH;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns structured review with issues, callers and coverage gap', async () => {
    const result = await smartReview({ ref: 'HEAD' });
    assert.equal(result.success, true);
    assert.ok(result.files.length >= 1, 'expected at least one analyzed file');

    const cart = result.files.find((f) => f.path.endsWith('cart.js'));
    assert.ok(cart, 'cart.js should appear in results');
    assert.ok(cart.issues.some((i) => i.kind === 'console-log'));
    assert.ok(cart.issues.some((i) => i.kind === 'todo'));
    assert.ok(cart.callers.some((c) => c.endsWith('infrastructure/api.js')),
      `expected api.js as caller: ${JSON.stringify(cart.callers)}`);

    assert.ok(result.summary.coverageGap.some((g) => g.file.endsWith('cart.js')),
      'cart.js should flag coverage gap since its test wasn\'t changed');

    assert.ok(result.summary.layersTouched.includes('application'));
    assert.equal(result.summary.issuesBySeverity.med >= 1, true);
  });

  it('rejects unsafe refs', async () => {
    const result = await smartReview({ ref: 'HEAD; rm -rf /' });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid ref/);
  });

  it('no findings when no relevant changes', async () => {
    const result = await smartReview({ ref: 'HEAD', maxFiles: 0 });
    assert.equal(result.success, true);
    assert.equal(result.files.length, 0);
    assert.equal(result.summary.issuesBySeverity.high, 0);
  });
});
