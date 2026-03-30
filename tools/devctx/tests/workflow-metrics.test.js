import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectWorkflowType, getWorkflowBaseline, WORKFLOW_DEFINITIONS } from '../src/workflow-tracker.js';

describe('workflow-tracker', () => {
  describe('detectWorkflowType', () => {
    it('detects debugging from goal', () => {
      const type = detectWorkflowType('Fix TypeError in loginHandler', []);
      assert.equal(type, 'debugging');
    });

    it('detects code-review from goal', () => {
      const type = detectWorkflowType('Review PR #123', []);
      assert.equal(type, 'code-review');
    });

    it('detects refactoring from goal', () => {
      const type = detectWorkflowType('Extract validation logic', []);
      assert.equal(type, 'refactoring');
    });

    it('detects testing from goal', () => {
      const type = detectWorkflowType('Add unit tests for auth', []);
      assert.equal(type, 'testing');
    });

    it('detects architecture from goal', () => {
      const type = detectWorkflowType('Explore codebase structure', []);
      assert.equal(type, 'architecture');
    });

    it('detects debugging from tools', () => {
      const type = detectWorkflowType('', ['smart_turn', 'smart_search', 'smart_read', 'smart_shell']);
      assert.equal(type, 'debugging');
    });

    it('returns null when no match', () => {
      const type = detectWorkflowType('Hello world', ['smart_read']);
      assert.equal(type, null);
    });

    it('requires minimum tools for detection', () => {
      const type = detectWorkflowType('', ['smart_turn', 'smart_search']);
      assert.equal(type, null);
    });
  });

  describe('getWorkflowBaseline', () => {
    it('returns baseline for debugging', () => {
      const baseline = getWorkflowBaseline('debugging');
      assert.equal(baseline, 150000);
    });

    it('returns baseline for code-review', () => {
      const baseline = getWorkflowBaseline('code-review');
      assert.equal(baseline, 200000);
    });

    it('returns baseline for refactoring', () => {
      const baseline = getWorkflowBaseline('refactoring');
      assert.equal(baseline, 180000);
    });

    it('returns baseline for testing', () => {
      const baseline = getWorkflowBaseline('testing');
      assert.equal(baseline, 120000);
    });

    it('returns baseline for architecture', () => {
      const baseline = getWorkflowBaseline('architecture');
      assert.equal(baseline, 300000);
    });

    it('returns 0 for unknown workflow', () => {
      const baseline = getWorkflowBaseline('unknown');
      assert.equal(baseline, 0);
    });
  });

  describe('WORKFLOW_DEFINITIONS', () => {
    it('has all expected workflow types', () => {
      const types = Object.keys(WORKFLOW_DEFINITIONS);
      assert.deepEqual(types, ['debugging', 'code-review', 'refactoring', 'testing', 'architecture']);
    });

    it('each definition has required fields', () => {
      for (const [type, def] of Object.entries(WORKFLOW_DEFINITIONS)) {
        assert.ok(def.name, `${type} missing name`);
        assert.ok(def.description, `${type} missing description`);
        assert.ok(Array.isArray(def.typicalTools), `${type} missing typicalTools`);
        assert.ok(typeof def.minTools === 'number', `${type} missing minTools`);
        assert.ok(typeof def.baselineTokens === 'number', `${type} missing baselineTokens`);
        assert.ok(def.pattern instanceof RegExp, `${type} missing pattern`);
      }
    });
  });
});
