import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildIndex, persistIndex } from '../src/index.js';
import { createProgressReporter, setServerForStreaming } from '../src/streaming.js';

describe('build_index with streaming', () => {
  let tmpRoot;
  let notifications = [];
  let mockServer;

  before(() => {
    mockServer = {
      notification: (msg) => {
        notifications.push(msg);
      },
    };
    setServerForStreaming(mockServer);

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-streaming-index-'));
    
    // Create test files
    for (let i = 0; i < 100; i++) {
      const filePath = path.join(tmpRoot, `file${i}.js`);
      fs.writeFileSync(filePath, `export function test${i}() { return ${i}; }\n`);
    }
  });

  after(() => {
    setServerForStreaming(null);
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('sends progress notifications during indexing', () => {
    notifications = [];
    const progress = createProgressReporter('build_index');

    const index = buildIndex(tmpRoot, progress);
    progress.complete({ files: Object.keys(index.files).length });

    // Should have at least scanning + complete
    assert.ok(notifications.length >= 2, `expected >=2 notifications, got ${notifications.length}`);
    
    // First should be scanning
    assert.equal(notifications[0].params.progress.phase, 'scanning');
    assert.ok(notifications[0].params.progress.total > 0);

    // Last should be complete
    const lastNotif = notifications[notifications.length - 1];
    assert.equal(lastNotif.params.progress.phase, 'complete');
    assert.ok(lastNotif.params.progress.files > 0);
  });

  it('includes percentage in progress updates', () => {
    notifications = [];
    const progress = createProgressReporter('build_index');

    buildIndex(tmpRoot, progress);

    const indexingNotifs = notifications.filter(n => n.params.progress.phase === 'indexing');
    
    if (indexingNotifs.length > 0) {
      assert.ok(indexingNotifs[0].params.progress.percentage >= 0);
      assert.ok(indexingNotifs[0].params.progress.percentage <= 100);
    }
  });

  it('reports files and symbols count during indexing', () => {
    notifications = [];
    const progress = createProgressReporter('build_index');

    buildIndex(tmpRoot, progress);

    const indexingNotifs = notifications.filter(n => n.params.progress.phase === 'indexing');
    
    if (indexingNotifs.length > 0) {
      const notif = indexingNotifs[0].params.progress;
      assert.ok(typeof notif.files === 'number');
      assert.ok(typeof notif.symbols === 'number');
      assert.ok(notif.files > 0);
      assert.ok(notif.symbols > 0);
    }
  });
});
