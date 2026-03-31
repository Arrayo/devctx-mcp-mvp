import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { smartStatus } from '../src/tools/smart-status.js';
import { smartSummary } from '../src/tools/smart-summary.js';

describe('smart_status', () => {
  before(async () => {
    await smartSummary({ action: 'reset' });
  });

  after(async () => {
    await smartSummary({ action: 'reset' });
  });

  it('should display active session context', async () => {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Test smart_status functionality',
        status: 'in_progress',
        nextStep: 'Verify status display',
        decisions: ['Created smart_status tool', 'Added format options'],
        touchedFiles: ['src/tools/smart-status.js', 'src/server.js'],
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.equal(result.success, true);
    assert.ok(result.summary);
    assert.ok(result.summary.includes('Test smart_status functionality'));
    assert.ok(result.summary.includes('in_progress'));
    assert.ok(result.summary.includes('Verify status display'));
    assert.ok(result.context);
    assert.equal(result.context.goal, 'Test smart_status functionality');
    assert.equal(result.context.stats.decisions, 2);
    assert.equal(result.context.stats.files, 2);
  });

  it('should support compact format', async () => {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Compact format test',
        status: 'in_progress',
        nextStep: 'Test compact output',
        touchedFiles: ['file1.js', 'file2.js', 'file3.js'],
      },
    });

    const result = await smartStatus({ format: 'compact' });
    
    assert.ok(result.sessionId);
    assert.equal(result.status, 'in_progress');
    assert.equal(result.nextStep, 'Test compact output');
    assert.ok(result.stats);
    assert.equal(result.stats.files, 3);
    assert.ok(result.recentFiles);
    assert.equal(result.recentFiles.length, 3);
  });

  it('should limit recent items with maxItems', async () => {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'MaxItems test',
        status: 'in_progress',
        decisions: Array.from({ length: 20 }, (_, i) => `Decision ${i + 1}`),
        touchedFiles: Array.from({ length: 20 }, (_, i) => `file${i + 1}.js`),
      },
    });

    const result = await smartStatus({ format: 'detailed', maxItems: 5 });
    
    assert.ok(result.context.recent.decisions.length <= 5);
    assert.ok(result.context.recent.files.length <= 5);
  });

  it('should show pinned context and unresolved questions', async () => {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Context test',
        status: 'in_progress',
        pinnedContext: ['Important context 1', 'Important context 2'],
        unresolvedQuestions: ['Question 1?', 'Question 2?'],
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.ok(result.summary.includes('Pinned Context'));
    assert.ok(result.summary.includes('Important context 1'));
    assert.ok(result.summary.includes('Unresolved Questions'));
    assert.ok(result.summary.includes('Question 1?'));
    assert.equal(result.context.pinned.length, 2);
    assert.equal(result.context.questions.length, 2);
  });

  it('should handle blocked status', async () => {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Blocked test',
        status: 'blocked',
        whyBlocked: 'Waiting for API key',
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.equal(result.status, 'blocked');
    assert.ok(result.summary.includes('Blocked: Waiting for API key'));
    assert.equal(result.context.whyBlocked, 'Waiting for API key');
  });

  it('should show current focus when set', async () => {
    await smartSummary({
      action: 'update',
      update: {
        goal: 'Focus test',
        status: 'in_progress',
        currentFocus: 'Implementing smart_status tool',
      },
    });

    const result = await smartStatus({ format: 'detailed' });
    
    assert.ok(result.summary.includes('Focus: Implementing smart_status tool'));
    assert.equal(result.context.currentFocus, 'Implementing smart_status tool');
  });
});
