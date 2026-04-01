import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setServerForStreaming, createProgressReporter } from '../src/streaming.js';

describe('Streaming Progress', () => {
  const notifications = [];
  const mockServer = {
    notification(payload) {
      notifications.push(payload);
    },
  };

  before(() => {
    setServerForStreaming(mockServer);
  });

  after(() => {
    notifications.length = 0;
  });

  it('should send progress notifications', () => {
    const progress = createProgressReporter('test_operation');
    
    progress.report({ phase: 'start', items: 0 });
    progress.report({ phase: 'processing', items: 50 });
    progress.complete({ items: 100 });

    assert.ok(notifications.length >= 2, 'should send at least 2 notifications');
    
    const last = notifications[notifications.length - 1];
    assert.equal(last.method, 'notifications/progress');
    assert.equal(last.params.progress.phase, 'complete');
    assert.equal(last.params.progress.items, 100);
  });

  it('should throttle rapid updates', () => {
    notifications.length = 0;
    const progress = createProgressReporter('throttle_test');
    
    // Send 10 rapid updates
    for (let i = 0; i < 10; i++) {
      progress.report({ phase: 'processing', items: i });
    }
    
    // Should have throttled most of them (100ms throttle)
    assert.ok(notifications.length < 10, 'should throttle rapid updates');
  });

  it('should include operation name and elapsed time', () => {
    notifications.length = 0;
    const progress = createProgressReporter('timed_operation');
    
    progress.report({ phase: 'start' });
    
    assert.ok(notifications.length > 0);
    const notification = notifications[0];
    assert.equal(notification.params.progress.operation, 'timed_operation');
    assert.ok(typeof notification.params.progress.elapsed === 'number');
  });

  it('should handle errors gracefully', () => {
    notifications.length = 0;
    const progress = createProgressReporter('error_test');
    
    progress.error(new Error('Test error'));
    
    assert.ok(notifications.length > 0);
    const notification = notifications[0];
    assert.equal(notification.params.progress.phase, 'error');
    assert.equal(notification.params.progress.error, 'Test error');
  });
});
