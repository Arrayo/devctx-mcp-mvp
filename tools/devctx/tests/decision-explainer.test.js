import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExplainEnabled,
  recordDecision,
  getSessionDecisions,
  formatDecisionExplanations,
  resetSessionDecisions,
  DECISION_REASONS,
  EXPECTED_BENEFITS,
} from '../src/decision-explainer.js';

test('decision explainer - disabled by default', () => {
  delete process.env.DEVCTX_EXPLAIN;
  resetSessionDecisions();
  
  assert.equal(isExplainEnabled(), false);
  assert.equal(formatDecisionExplanations(), '');
});

test('decision explainer - enabled with DEVCTX_EXPLAIN=true', () => {
  process.env.DEVCTX_EXPLAIN = 'true';
  resetSessionDecisions();
  
  assert.equal(isExplainEnabled(), true);
});

test('decision explainer - records decisions', () => {
  process.env.DEVCTX_EXPLAIN = 'true';
  resetSessionDecisions();
  
  recordDecision({
    tool: 'smart_read',
    action: 'read file.js (outline mode)',
    reason: DECISION_REASONS.LARGE_FILE,
    alternative: 'Read (full file)',
    expectedBenefit: EXPECTED_BENEFITS.TOKEN_SAVINGS(45000),
  });
  
  const decisions = getSessionDecisions();
  
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].tool, 'smart_read');
  assert.equal(decisions[0].action, 'read file.js (outline mode)');
  assert.equal(decisions[0].reason, DECISION_REASONS.LARGE_FILE);
  assert.equal(decisions[0].alternative, 'Read (full file)');
});

test('decision explainer - formats explanations correctly', () => {
  process.env.DEVCTX_EXPLAIN = 'true';
  resetSessionDecisions();
  
  recordDecision({
    tool: 'smart_read',
    action: 'read file.js (outline mode)',
    reason: DECISION_REASONS.LARGE_FILE,
    alternative: 'Read (full file)',
    expectedBenefit: EXPECTED_BENEFITS.TOKEN_SAVINGS(45000),
    context: '2500 lines, 50000 tokens → 5000 tokens',
  });
  
  const explanation = formatDecisionExplanations();
  
  assert.match(explanation, /🤖 \*\*Decision explanations:\*\*/);
  assert.match(explanation, /smart_read/);
  assert.match(explanation, /Why:/);
  assert.match(explanation, /Instead of:/);
  assert.match(explanation, /Expected benefit:/);
  assert.match(explanation, /Context:/);
  assert.match(explanation, /45\.0K tokens/);
});

test('decision explainer - does not record when disabled', () => {
  process.env.DEVCTX_EXPLAIN = 'false';
  resetSessionDecisions();
  
  recordDecision({
    tool: 'smart_read',
    action: 'read file.js',
    reason: 'test',
  });
  
  const decisions = getSessionDecisions();
  assert.equal(decisions.length, 0);
});

test('decision explainer - handles multiple decisions', () => {
  process.env.DEVCTX_EXPLAIN = 'true';
  resetSessionDecisions();
  
  recordDecision({
    tool: 'smart_read',
    action: 'read file1.js',
    reason: DECISION_REASONS.LARGE_FILE,
  });
  
  recordDecision({
    tool: 'smart_search',
    action: 'search "query"',
    reason: DECISION_REASONS.INTENT_AWARE,
  });
  
  const decisions = getSessionDecisions();
  assert.equal(decisions.length, 2);
  
  const explanation = formatDecisionExplanations();
  assert.match(explanation, /smart_read/);
  assert.match(explanation, /smart_search/);
});

test('decision explainer - resets session decisions', () => {
  process.env.DEVCTX_EXPLAIN = 'true';
  resetSessionDecisions();
  
  recordDecision({
    tool: 'smart_read',
    action: 'read file.js',
    reason: 'test',
  });
  
  let decisions = getSessionDecisions();
  assert.equal(decisions.length, 1);
  
  resetSessionDecisions();
  
  decisions = getSessionDecisions();
  assert.equal(decisions.length, 0);
});

test('decision explainer - DECISION_REASONS are defined', () => {
  assert.ok(DECISION_REASONS.LARGE_FILE);
  assert.ok(DECISION_REASONS.SYMBOL_EXTRACTION);
  assert.ok(DECISION_REASONS.MULTIPLE_FILES);
  assert.ok(DECISION_REASONS.INTENT_AWARE);
  assert.ok(DECISION_REASONS.TASK_CONTEXT);
});

test('decision explainer - EXPECTED_BENEFITS are defined', () => {
  assert.ok(EXPECTED_BENEFITS.TOKEN_SAVINGS);
  assert.ok(EXPECTED_BENEFITS.FASTER_RESPONSE);
  assert.ok(EXPECTED_BENEFITS.BETTER_RANKING);
  assert.ok(EXPECTED_BENEFITS.COMPLETE_CONTEXT);
});

test('decision explainer - formats token counts correctly', () => {
  process.env.DEVCTX_EXPLAIN = 'true';
  resetSessionDecisions();
  
  recordDecision({
    tool: 'smart_read',
    action: 'read file.js',
    reason: 'test',
    expectedBenefit: EXPECTED_BENEFITS.TOKEN_SAVINGS(1500000),
  });
  
  const explanation = formatDecisionExplanations();
  assert.match(explanation, /1\.5M tokens/);
});

test('decision explainer - handles optional fields', () => {
  process.env.DEVCTX_EXPLAIN = 'true';
  resetSessionDecisions();
  
  // Minimal decision (only required fields)
  recordDecision({
    tool: 'smart_read',
    action: 'read file.js',
    reason: 'test reason',
  });
  
  const decisions = getSessionDecisions();
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].alternative, null);
  assert.equal(decisions[0].expectedBenefit, null);
  assert.equal(decisions[0].context, null);
  
  const explanation = formatDecisionExplanations();
  assert.match(explanation, /smart_read/);
  assert.match(explanation, /\*\*Why:\*\* test reason/);
});
