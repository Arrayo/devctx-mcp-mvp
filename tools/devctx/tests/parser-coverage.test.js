import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildIndex,
  loadIndex,
  persistIndex,
} from '../src/index.js';
import {
  registerParser,
  getParser,
  clearRegistry,
  listRegisteredExtensions,
} from '../src/parsers/registry.js';
import { setProjectRoot, projectRoot as savedProjectRoot } from '../src/utils/runtime-config.js';

describe('parser-registry :: pluggable interface', () => {
  it('registerParser/getParser round-trips', () => {
    const parser = ({ content }) => ({
      symbols: [{ name: 'X', kind: 'function', line: 1, signature: content.slice(0, 10) }],
    });
    registerParser('.demo', parser);
    assert.equal(getParser('.demo'), parser);
    clearRegistry();
    assert.equal(getParser('.demo'), null);
  });

  it('listRegisteredExtensions reflects registry state', () => {
    clearRegistry();
    registerParser('.foo', () => ({ symbols: [] }));
    const before = listRegisteredExtensions();
    assert.deepEqual(before.symbols, ['.foo']);
    clearRegistry();
  });
});

describe('python parser :: extended coverage', () => {
  let tmp;
  let savedRoot;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-py-'));
    savedRoot = savedProjectRoot;
    setProjectRoot(tmp);
  });

  after(() => {
    setProjectRoot(savedRoot);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('captures decorators, async methods, and type aliases', async () => {
    const src = [
      'from typing import TypeAlias, TypeVar',
      '',
      'UserId: TypeAlias = int',
      'T = TypeVar("T")',
      '',
      '@dataclass',
      'class User:',
      '    name: str',
      '',
      '    @property',
      '    def display_name(self):',
      '        return self.name',
      '',
      '    async def fetch(self, id):',
      '        return id',
      '',
      '@cached',
      'def top_level():',
      '    return 1',
      '',
      'async def fetch_all():',
      '    return []',
    ].join('\n');
    fs.writeFileSync(path.join(tmp, 'sample.py'), src);
    const index = buildIndex(tmp);
    const file = index.files['sample.py'];
    assert.ok(file, 'sample.py should be indexed');
    const byName = Object.fromEntries(file.symbols.map((s) => [s.name, s]));

    assert.ok(byName.UserId, 'type alias not captured');
    assert.equal(byName.UserId.kind, 'type');

    assert.ok(byName.T, 'TypeVar not captured');
    assert.equal(byName.T.kind, 'type');

    assert.ok(byName.User);
    assert.equal(byName.User.kind, 'class');
    assert.ok(byName.User.decorators?.includes('dataclass'));

    assert.ok(byName.display_name);
    assert.equal(byName.display_name.kind, 'method');
    assert.equal(byName.display_name.parent, 'User');
    assert.ok(byName.display_name.decorators?.includes('property'));

    assert.ok(byName.fetch);
    assert.equal(byName.fetch.kind, 'async-method');
    assert.equal(byName.fetch.parent, 'User');

    assert.ok(byName.top_level);
    assert.equal(byName.top_level.kind, 'function');
    assert.ok(byName.top_level.decorators?.includes('cached'));

    assert.ok(byName.fetch_all);
    assert.equal(byName.fetch_all.kind, 'async-function');
  });
});

describe('go parser :: extended coverage', () => {
  let tmp;
  let savedRoot;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-go-'));
    savedRoot = savedProjectRoot;
    setProjectRoot(tmp);
  });

  after(() => {
    setProjectRoot(savedRoot);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('captures methods with receiver type, interfaces, structs, const/var', async () => {
    const src = [
      'package svc',
      '',
      'import "context"',
      '',
      'const Version = "1.0"',
      'var DefaultTimeout = 30',
      '',
      'type Service struct {',
      '\tname string',
      '}',
      '',
      'type Handler interface {',
      '\tServe(ctx context.Context) error',
      '}',
      '',
      'func NewService(name string) *Service {',
      '\treturn &Service{name: name}',
      '}',
      '',
      'func (s *Service) Run(ctx context.Context) error {',
      '\treturn nil',
      '}',
      '',
      'func (s Service) Name() string {',
      '\treturn s.name',
      '}',
    ].join('\n');
    fs.writeFileSync(path.join(tmp, 'service.go'), src);
    const index = buildIndex(tmp);
    const file = index.files['service.go'];
    assert.ok(file);
    const byName = Object.fromEntries(file.symbols.map((s) => [s.name, s]));

    assert.equal(byName.Version?.kind, 'const');
    assert.equal(byName.DefaultTimeout?.kind, 'var');
    assert.equal(byName.Service?.kind, 'type');
    assert.equal(byName.Handler?.kind, 'interface');
    assert.equal(byName.NewService?.kind, 'function');
    assert.equal(byName.Run?.kind, 'method');
    assert.equal(byName.Run?.parent, 'Service');
    assert.equal(byName.Name?.kind, 'method');
    assert.equal(byName.Name?.parent, 'Service');
  });
});

describe('index version :: bumped to 7 for richer symbol shape', () => {
  let tmp;
  let savedRoot;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-idxv-'));
    savedRoot = savedProjectRoot;
    setProjectRoot(tmp);
    fs.writeFileSync(path.join(tmp, 'a.js'), 'export const a = 1;');
    const idx = buildIndex(tmp);
    return persistIndex(idx, tmp);
  });

  after(() => {
    setProjectRoot(savedRoot);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('persists index.version = 7', () => {
    const idx = loadIndex(tmp);
    assert.equal(idx.version, 7);
  });
});
