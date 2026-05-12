import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIndex, extractAdrSymbols, isAdrPath, queryIndex } from '../src/index.js';
import { smartSearch } from '../src/tools/smart-search.js';
import { setProjectRoot, projectRoot as originalProjectRoot } from '../src/utils/runtime-config.js';

describe('ADR parser', () => {
  it('isAdrPath recognises canonical ADR locations and filenames', () => {
    assert.equal(isAdrPath('docs/adr/0001-use-jwt.md'), true);
    assert.equal(isAdrPath('docs/decisions/auth.md'), true);
    assert.equal(isAdrPath('architecture/SPEC.md'), true);
    assert.equal(isAdrPath('docs/ARCHITECTURE.md'), true);
    assert.equal(isAdrPath('README.md'), false);
    assert.equal(isAdrPath('src/foo.md'), false);
  });

  it('extractAdrSymbols parses title, status and sections', () => {
    const content = [
      '# Use JWT for authentication',
      '',
      '**Status: Accepted**',
      '',
      '## Context',
      'We need a stateless auth mechanism.',
      '',
      '## Decision',
      'Adopt JWT signed with HS256.',
      '',
      '## Consequences',
      'Tokens cannot be revoked individually.',
    ].join('\n');

    const symbols = extractAdrSymbols(content, '/repo/docs/adr/0001-use-jwt.md');
    const title = symbols.find((s) => s.kind === 'adr');
    assert.ok(title, 'should detect title');
    assert.equal(title.line, 1);
    assert.equal(title.title, 'Use JWT for authentication');
    assert.equal(title.status, 'accepted');

    const sectionNames = symbols.filter((s) => s.kind === 'adr-section').map((s) => s.name);
    assert.deepEqual(sectionNames, ['context', 'decision', 'consequences']);
  });

  it('falls back to filename when no H1 is present', () => {
    const symbols = extractAdrSymbols('## Context\nWhatever', '/repo/docs/adr/0002-some-decision.md');
    assert.equal(symbols[0].kind, 'adr');
    assert.equal(symbols[0].line, 1);
  });
});

describe('ADR indexing end-to-end', () => {
  let tempRoot;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-adr-fixture-'));
    fs.mkdirSync(path.join(tempRoot, 'docs', 'adr'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, 'src', 'auth.js'), [
      'export class AuthService {',
      '  validate(token) { return token; }',
      '}',
      '',
    ].join('\n'));

    fs.writeFileSync(path.join(tempRoot, 'docs', 'adr', '0001-use-jwt.md'), [
      '# Use JWT for authentication',
      '',
      'Status: accepted',
      '',
      '## Context',
      'Need stateless auth.',
      '',
      '## Decision',
      'Use jose with HS256.',
    ].join('\n'));

    fs.writeFileSync(path.join(tempRoot, 'README.md'), '# Demo project\nNot an ADR.');
  });

  after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('buildIndex picks up ADR markdown files and skips other markdown', () => {
    const index = buildIndex(tempRoot);
    assert.equal(index.version, 7);

    assert.ok(index.files['docs/adr/0001-use-jwt.md'], 'ADR file indexed');
    assert.equal(index.files['README.md'], undefined, 'README ignored');

    const adrSymbols = index.files['docs/adr/0001-use-jwt.md'].symbols;
    const title = adrSymbols.find((s) => s.kind === 'adr');
    assert.equal(title.status, 'accepted');
    const sections = adrSymbols.filter((s) => s.kind === 'adr-section').map((s) => s.name);
    assert.deepEqual(sections, ['context', 'decision']);
  });

  it('queryIndex enriches ADR hits with signature/snippet', () => {
    const index = buildIndex(tempRoot);
    const hits = queryIndex(index, 'use-jwt-for-authentication');
    assert.ok(hits.length > 0);
    assert.equal(hits[0].kind, 'adr');
    assert.match(hits[0].signature ?? '', /Use JWT for authentication/);
  });
});

describe('smart_search kinds filter', () => {
  let tempRoot;
  let savedRoot;
  let originalIndexDir;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-adr-search-'));
    fs.mkdirSync(path.join(tempRoot, 'docs', 'adr'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, '.devctx'), { recursive: true });

    fs.writeFileSync(path.join(tempRoot, 'src', 'cache.js'), [
      'export class CacheService {',
      '  set(k, v) { return true; }',
      '  get(k) { return null; }',
      '}',
      '',
    ].join('\n'));

    fs.writeFileSync(path.join(tempRoot, 'docs', 'adr', '0002-cache.md'), [
      '# Cache strategy',
      '',
      'Status: accepted',
      '',
      '## Decision',
      'Use Redis for shared cache.',
    ].join('\n'));

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

  it('kinds=["adr","adr-section"] restricts results to ADR files', async () => {
    const result = await smartSearch({
      query: 'cache',
      cwd: tempRoot,
      kinds: ['adr', 'adr-section'],
    });
    assert.deepEqual(result.kinds, ['adr', 'adr-section']);
    const files = (result.topFiles ?? []).map((f) => f.file);
    for (const f of files) {
      assert.match(f, /\.md$/, `expected ADR markdown, got ${f}`);
    }
  });

  it('omitting kinds returns mixed results', async () => {
    const result = await smartSearch({
      query: 'cache',
      cwd: tempRoot,
    });
    assert.equal(result.kinds, undefined);
  });
});
