import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { buildIndex } from '../src/index.js';
import { smartTest, _internal } from '../src/tools/smart-test.js';
import { clearLastTestFailure, setLastTestFailure, getLastTestFailure } from '../src/storage/sqlite.js';
import { setProjectRoot, projectRoot as originalProjectRoot } from '../src/utils/runtime-config.js';

const { detectAffectedTests, buildShellCommand, parseFailureFromOutput } = _internal;

const writeFixture = (root, files) => {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
};

const FIXTURE = {
  'src/auth.js': "export const auth = (t) => t === 'ok';\n",
  'src/api.js': "import { auth } from './auth.js';\nexport const api = (t) => auth(t);\n",
  'src/unused.js': "export const lonely = () => 1;\n",
  'tests/auth.test.js': "import { auth } from '../src/auth.js';\nauth('ok');\n",
  'tests/api.test.js': "import { api } from '../src/api.js';\napi('ok');\n",
};

describe('smart_test internals', () => {
  let tempRoot;
  let index;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-smart-test-'));
    writeFixture(tempRoot, FIXTURE);
    index = buildIndex(tempRoot);
  });

  after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('detectAffectedTests expands through import graph and keeps test files', () => {
    const { tests, expanded } = detectAffectedTests(index, ['src/auth.js']);
    assert.ok(tests.length >= 1, 'should detect at least one affected test');
    assert.ok(tests.some((t) => t.endsWith('auth.test.js')));
    assert.ok(expanded.has('src/auth.js'));
  });

  it('detectAffectedTests returns no tests for unrelated file', () => {
    const { tests } = detectAffectedTests(index, ['src/unused.js']);
    assert.equal(tests.length, 0);
  });

  it('buildShellCommand validates runner allowlist', () => {
    assert.equal(buildShellCommand({ runner: 'npm-test' }), 'npm test');
    assert.equal(buildShellCommand({ runner: 'node-test' }), 'node --test');
    assert.equal(buildShellCommand({ runner: 'npm-run', script: 'lint' }), 'npm run lint');
    assert.throws(() => buildShellCommand({ runner: 'rm -rf /' }), /not allowed/);
    assert.throws(() => buildShellCommand({ runner: 'npm-run', script: 'lint; rm -rf' }), /invalid script/);
    assert.throws(() => buildShellCommand({ runner: 'npm-test', files: ['tests/a.js; ls'] }), /unsafe characters/);
  });

  it('parseFailureFromOutput picks TAP/jest-style failures', () => {
    const tap = [
      'ok 1 - first',
      'not ok 2 - boom',
      '  ---',
      '  message: kaboom',
      'ok 3 - third',
    ].join('\n');
    const failures = parseFailureFromOutput(tap);
    assert.equal(failures.length, 1);
    assert.match(failures[0].context, /not ok 2/);

    const jest = '  FAIL tests/api.test.js\n    expected true to be false';
    const jestFails = parseFailureFromOutput(jest);
    assert.ok(jestFails.length >= 1);
  });
});

describe('smart_test actions (integration)', () => {
  let tempRoot;
  let savedRoot;
  let savedIndexDir;
  let savedDb;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-smart-test-int-'));
    writeFixture(tempRoot, FIXTURE);

    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -q -m init', {
      cwd: tempRoot,
      stdio: 'ignore',
    });
    fs.writeFileSync(path.join(tempRoot, 'src/auth.js'), "export const auth = (t) => t === 'changed';\n");

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

  beforeEach(async () => {
    await clearLastTestFailure();
  });

  it('action=affected returns affected test files from uncommitted diff', async () => {
    const result = await smartTest({ action: 'affected' });
    assert.equal(result.success, true);
    assert.equal(result.action, 'affected');
    assert.ok(result.affectedTests.some((t) => t.endsWith('auth.test.js')),
      `expected auth.test.js in affected: ${JSON.stringify(result.affectedTests)}`);
    assert.ok(result.stats.changedFiles >= 1);
  });

  it('action=last_failure returns hasFailure=false when none persisted', async () => {
    const result = await smartTest({ action: 'last_failure' });
    assert.equal(result.success, true);
    assert.equal(result.hasFailure, false);
  });

  it('action=last_failure returns persisted record', async () => {
    await setLastTestFailure({
      payload: {
        command: 'npm test',
        runner: 'npm-test',
        exitCode: 1,
        failures: [{ line: 5, context: 'not ok 1' }],
      },
    });
    const result = await smartTest({ action: 'last_failure' });
    assert.equal(result.hasFailure, true);
    assert.equal(result.record.exitCode, 1);
    assert.equal(result.record.runner, 'npm-test');

    const direct = await getLastTestFailure();
    assert.equal(direct.command, 'npm test');
  });

  it('rejects unknown actions', async () => {
    const result = await smartTest({ action: 'nuke' });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid action/);
  });

  it('rejects unsafe runner in action=run', async () => {
    const result = await smartTest({ action: 'run', runner: 'evil' });
    assert.equal(result.success, false);
  });
});
