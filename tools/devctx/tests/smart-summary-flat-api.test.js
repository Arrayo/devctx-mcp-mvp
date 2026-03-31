import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { smartSummary } from '../src/tools/smart-summary.js';

describe('smart_summary flat API', () => {
  before(async () => {
    await smartSummary({ action: 'reset' });
  });

  after(async () => {
    await smartSummary({ action: 'reset' });
  });

  it('should accept flat format (new API)', async () => {
    const result = await smartSummary({
      action: 'update',
      goal: 'Test flat API',
      status: 'in_progress',
      nextStep: 'Verify it works',
      decisions: ['Use flat format', 'Maintain compatibility'],
    });

    assert.ok(result.sessionId);
    assert.equal(result.summary.goal, 'Test flat API');
    assert.equal(result.summary.status, 'in_progress');
    assert.equal(result.summary.nextStep, 'Verify it works');
  });

  it('should still accept nested format (old API)', async () => {
    const result = await smartSummary({
      action: 'update',
      update: {
        goal: 'Test nested API',
        status: 'in_progress',
        nextStep: 'Verify backward compatibility',
        decisions: ['Keep old format working'],
      },
    });

    assert.ok(result.sessionId);
    assert.equal(result.summary.goal, 'Test nested API');
    assert.equal(result.summary.status, 'in_progress');
  });

  it('should prioritize nested format when both provided', async () => {
    const result = await smartSummary({
      action: 'update',
      goal: 'Flat goal',
      update: {
        goal: 'Nested goal',
        status: 'in_progress',
      },
    });

    assert.equal(result.summary.goal, 'Nested goal');
  });
});
