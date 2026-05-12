import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isIgnoredPath,
  applyChanges,
  startIndexWatcher,
  isWatchEnabled,
  _internal,
} from '../src/index-watcher.js';
import { buildIndex, loadIndex, persistIndex } from '../src/index.js';
import { setProjectRoot, projectRoot as savedProjectRoot } from '../src/utils/runtime-config.js';

const { classifyChange } = _internal;

describe('index-watcher :: isIgnoredPath', () => {
  it('ignores directories like node_modules, .git, .devctx', () => {
    assert.equal(isIgnoredPath('node_modules/foo/index.js'), true);
    assert.equal(isIgnoredPath('.git/HEAD'), true);
    assert.equal(isIgnoredPath('.devctx/state.sqlite'), true);
    assert.equal(isIgnoredPath('dist/bundle.js'), true);
    assert.equal(isIgnoredPath('coverage/lcov.info'), true);
  });

  it('ignores lockfiles and min/map/snap patterns', () => {
    assert.equal(isIgnoredPath('package-lock.json'), true);
    assert.equal(isIgnoredPath('pnpm-lock.yaml'), true);
    assert.equal(isIgnoredPath('vendor/bundle.min.js'), true);
    assert.equal(isIgnoredPath('foo.test.js.snap'), true);
  });

  it('ignores files without indexable extension', () => {
    assert.equal(isIgnoredPath('README.txt'), true);
    assert.equal(isIgnoredPath('image.png'), true);
    assert.equal(isIgnoredPath('script.sh'), true);
  });

  it('accepts indexable source files and markdown', () => {
    assert.equal(isIgnoredPath('src/foo.ts'), false);
    assert.equal(isIgnoredPath('lib/bar.js'), false);
    assert.equal(isIgnoredPath('mod/main.py'), false);
    assert.equal(isIgnoredPath('docs/architecture.md'), false);
  });

  it('rejects empty and non-string input safely', () => {
    assert.equal(isIgnoredPath(''), true);
    assert.equal(isIgnoredPath(null), true);
    assert.equal(isIgnoredPath(undefined), true);
  });
});

describe('index-watcher :: classifyChange', () => {
  let tmp;
  before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-watch-')); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('returns "changed" for existing file', () => {
    const f = path.join(tmp, 'a.js');
    fs.writeFileSync(f, 'export const a = 1;\n');
    assert.equal(classifyChange(tmp, 'a.js'), 'changed');
  });

  it('returns "removed" for missing file', () => {
    assert.equal(classifyChange(tmp, 'missing.js'), 'removed');
  });

  it('returns "directory" for directories', () => {
    fs.mkdirSync(path.join(tmp, 'sub'));
    assert.equal(classifyChange(tmp, 'sub'), 'directory');
  });
});

describe('index-watcher :: applyChanges', () => {
  let tmp;
  let savedRoot;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-watch-apply-'));
    savedRoot = savedProjectRoot;
    setProjectRoot(tmp);
    fs.writeFileSync(path.join(tmp, 'a.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(tmp, 'b.js'), 'export const b = 2;\n');
  });

  after(() => {
    setProjectRoot(savedRoot);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reindexes changed files and removes deleted ones', async () => {
    const index = buildIndex(tmp);
    await persistIndex(index, tmp);
    assert.ok(index.files['a.js']);
    assert.ok(index.files['b.js']);

    fs.writeFileSync(path.join(tmp, 'a.js'), 'export const a = 1; export const c = 3;\n');
    fs.unlinkSync(path.join(tmp, 'b.js'));

    const result = applyChanges({ index, root: tmp, changes: ['a.js', 'b.js'] });
    assert.equal(result.touched, 1);
    assert.equal(result.removed, 1);
    assert.ok(index.files['a.js']);
    assert.equal(index.files['b.js'], undefined);
  });

  it('handles unknown paths gracefully', () => {
    const index = loadIndex(tmp) ?? buildIndex(tmp);
    const result = applyChanges({ index, root: tmp, changes: ['nonexistent.js'] });
    assert.equal(result.touched, 0);
    assert.equal(result.removed, 1);
  });
});

describe('index-watcher :: opt-in gating', () => {
  it('startIndexWatcher returns disabled handle when DEVCTX_WATCH_INDEX=false', () => {
    const prev = process.env.DEVCTX_WATCH_INDEX;
    process.env.DEVCTX_WATCH_INDEX = 'false';
    try {
      assert.equal(isWatchEnabled(), false);
      const handle = startIndexWatcher();
      assert.equal(handle.isRunning(), false);
      assert.equal(handle.stats().enabled, false);
    } finally {
      if (prev === undefined) delete process.env.DEVCTX_WATCH_INDEX;
      else process.env.DEVCTX_WATCH_INDEX = prev;
    }
  });

  it('isWatchEnabled defaults to true (opt-out)', () => {
    const prev = process.env.DEVCTX_WATCH_INDEX;
    delete process.env.DEVCTX_WATCH_INDEX;
    try {
      assert.equal(isWatchEnabled(), true);
    } finally {
      if (prev !== undefined) process.env.DEVCTX_WATCH_INDEX = prev;
    }
  });
});

describe('index-watcher :: end-to-end with fs.watch', () => {
  let tmp;
  let savedRoot;
  let prevWatchFlag;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-watch-e2e-'));
    savedRoot = savedProjectRoot;
    setProjectRoot(tmp);
    fs.writeFileSync(path.join(tmp, 'seed.js'), 'export const seed = 1;\n');
    const index = buildIndex(tmp);
    return persistIndex(index, tmp);
  });

  after(() => {
    setProjectRoot(savedRoot);
    if (prevWatchFlag === undefined) delete process.env.DEVCTX_WATCH_INDEX;
    else process.env.DEVCTX_WATCH_INDEX = prevWatchFlag;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('detects new files and reindexes them', async () => {
    prevWatchFlag = process.env.DEVCTX_WATCH_INDEX;
    process.env.DEVCTX_WATCH_INDEX = 'true';

    const handle = startIndexWatcher({ debounceMs: 100 });
    if (!handle.isRunning()) {
      handle.stop();
      return;
    }

    fs.writeFileSync(path.join(tmp, 'new-file.js'), 'export const fresh = 42;\n');
    await new Promise((r) => setTimeout(r, 400));

    const flushed = await handle.flush();
    await handle.stop();

    const index = loadIndex(tmp);
    assert.ok(index.files['new-file.js'], 'expected new-file.js to be indexed');
    assert.ok(flushed.touched >= 0);
  });
});
