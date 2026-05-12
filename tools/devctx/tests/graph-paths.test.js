import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIndex } from '../src/index.js';
import {
  findPath,
  resolveEntityToFiles,
  buildPathsResult,
} from '../src/graph-paths.js';
import { smartContext } from '../src/tools/smart-context.js';
import { setProjectRoot, projectRoot as originalProjectRoot } from '../src/utils/runtime-config.js';

const writeFixture = (root, files) => {
  for (const [rel, content] of Object.entries(files)) {
    const fullPath = path.join(root, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
};

const FIXTURE = {
  'src/api/login.js': [
    "import { authenticate } from '../auth/middleware.js';",
    "import { logger } from '../utils/logger.js';",
    "export const loginHandler = async (req, res) => authenticate(req.body, logger);",
    '',
  ].join('\n'),
  'src/auth/middleware.js': [
    "import { verifyJwt } from '../utils/jwt.js';",
    "export const authenticate = (body, log) => verifyJwt(body.token);",
    '',
  ].join('\n'),
  'src/utils/jwt.js': [
    "export const verifyJwt = (token) => token === 'ok';",
    '',
  ].join('\n'),
  'src/utils/logger.js': [
    "export const logger = { info: (m) => m };",
    '',
  ].join('\n'),
  'src/unrelated/orphan.js': [
    "export const orphan = () => 'lonely';",
    '',
  ].join('\n'),
};

describe('graph-paths helpers', () => {
  let tempRoot;
  let index;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-paths-'));
    writeFixture(tempRoot, FIXTURE);
    index = buildIndex(tempRoot);
  });

  after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('resolveEntityToFiles handles paths and symbol names', () => {
    assert.deepEqual(resolveEntityToFiles(index, 'src/api/login.js'), ['src/api/login.js']);
    assert.deepEqual(resolveEntityToFiles(index, 'login.js'), ['src/api/login.js']);
    const fromSymbol = resolveEntityToFiles(index, 'authenticate');
    assert.deepEqual(fromSymbol, ['src/auth/middleware.js']);
    assert.deepEqual(resolveEntityToFiles(index, 'nope-not-real'), []);
  });

  it('findPath traverses the import graph (undirected)', () => {
    const result = findPath(index, 'src/api/login.js', 'src/utils/jwt.js');
    assert.ok(result, 'expected a path');
    assert.equal(result.hops, 2);
    assert.deepEqual(result.path, [
      'src/api/login.js',
      'src/auth/middleware.js',
      'src/utils/jwt.js',
    ]);
  });

  it('findPath returns null when no path exists within maxHops', () => {
    const result = findPath(index, 'src/api/login.js', 'src/unrelated/orphan.js');
    assert.equal(result, null);
  });

  it('buildPathsResult returns hops + per-step signatures when found', () => {
    const r = buildPathsResult(index, 'loginHandler', 'verifyJwt');
    assert.equal(r.found, true);
    assert.equal(r.hops, 2);
    assert.equal(r.path.length, 3);
    assert.ok(r.path[0].file.endsWith('login.js'));
    assert.ok(r.path[2].file.endsWith('jwt.js'));
    assert.ok(r.path[0].signature, 'first step should expose a signature');
  });

  it('buildPathsResult falls back to neighbors when no path exists', () => {
    const r = buildPathsResult(index, 'src/api/login.js', 'src/unrelated/orphan.js');
    assert.equal(r.found, false);
    assert.equal(r.reason, 'no-path');
    assert.ok(Array.isArray(r.fallback?.fromNeighbors));
    assert.ok(r.fallback.fromNeighbors.length > 0);
  });
});

describe('smart_context paths mode', () => {
  let tempRoot;
  let savedRoot;
  let originalIndexDir;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-paths-mode-'));
    writeFixture(tempRoot, FIXTURE);
    fs.mkdirSync(path.join(tempRoot, '.devctx'), { recursive: true });
    const index = buildIndex(tempRoot);
    fs.writeFileSync(path.join(tempRoot, '.devctx', 'index.json'), JSON.stringify(index));

    savedRoot = originalProjectRoot;
    originalIndexDir = process.env.DEVCTX_INDEX_DIR;
    setProjectRoot(tempRoot);
    process.env.DEVCTX_INDEX_DIR = path.join(tempRoot, '.devctx');
  });

  after(() => {
    setProjectRoot(savedRoot);
    if (originalIndexDir !== undefined) process.env.DEVCTX_INDEX_DIR = originalIndexDir;
    else delete process.env.DEVCTX_INDEX_DIR;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns path between two symbols', async () => {
    const result = await smartContext({ paths: { from: 'loginHandler', to: 'verifyJwt' } });
    assert.equal(result.success, true);
    assert.equal(result.mode, 'paths');
    assert.equal(result.paths.found, true);
    assert.equal(result.paths.hops, 2);
  });

  it('returns fallback neighbors when no path exists', async () => {
    const result = await smartContext({ paths: { from: 'src/api/login.js', to: 'src/unrelated/orphan.js' } });
    assert.equal(result.success, true);
    assert.equal(result.paths.found, false);
    assert.equal(result.paths.reason, 'no-path');
    assert.ok(result.paths.fallback);
  });

  it('errors when neither task nor paths is provided', async () => {
    const result = await smartContext({});
    assert.equal(result.success, false);
    assert.match(result.error, /task is required/i);
  });
});
