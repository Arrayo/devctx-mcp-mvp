import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createProgressReporter, setServerForStreaming } from '../src/streaming.js';

describe('streaming progress', () => {
  let notifications = [];
  let mockServer;

  before(() => {
    mockServer = {
      notification: (msg) => {
        notifications.push(msg);
      },
    };
    setServerForStreaming(mockServer);
  });

  after(() => {
    setServerForStreaming(null);
  });

  it('sends progress notifications', async () => {
    notifications = [];
    const progress = createProgressReporter('test_operation');

    progress.report({ phase: 'starting', count: 0 });
    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for throttle
    progress.report({ phase: 'processing', count: 50 });
    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for throttle
    progress.complete({ total: 100 });

    assert.ok(notifications.length >= 2, `should send at least 2 notifications (got ${notifications.length})`);
    assert.equal(notifications[0].method, 'notifications/progress');
    assert.equal(notifications[0].params.progress.operation, 'test_operation');
    assert.equal(notifications[0].params.progress.phase, 'starting');
  });

  it('throttles rapid updates', async () => {
    notifications = [];
    const progress = createProgressReporter('throttle_test');

    // Send 10 updates rapidly
    for (let i = 0; i < 10; i++) {
      progress.report({ phase: 'fast', count: i });
    }

    // Should throttle to < 10 notifications (100ms throttle)
    assert.ok(notifications.length < 10, `should throttle (got ${notifications.length} notifications)`);
  });

  it('includes elapsed time', async () => {
    notifications = [];
    const progress = createProgressReporter('timing_test');

    progress.report({ phase: 'test' });
    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for throttle

    assert.ok(notifications.length > 0, `should have notifications (got ${notifications.length})`);
    assert.ok(typeof notifications[0].params.progress.elapsed === 'number');
    assert.ok(notifications[0].params.progress.elapsed >= 0);
  });

  it('handles errors gracefully', () => {
    notifications = [];
    const progress = createProgressReporter('error_test');

    progress.error(new Error('Test error'));

    assert.ok(notifications.length > 0);
    assert.equal(notifications[0].params.progress.phase, 'error');
    assert.equal(notifications[0].params.progress.error, 'Test error');
  });

  it('works without server (no-op)', () => {
    setServerForStreaming(null);
    const progress = createProgressReporter('no_server_test');

    // Should not throw
    assert.doesNotThrow(() => {
      progress.report({ phase: 'test' });
      progress.complete({});
      progress.error('error');
    });

    setServerForStreaming(mockServer);
  });
});
