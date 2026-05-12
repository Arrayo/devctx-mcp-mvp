import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStartActions, deriveEndActions, _internal } from '../src/turn/next-actions.js';

const { inferIntentFromPrompt } = _internal;

const toolNames = (actions) => actions.map((a) => a.tool);

describe('next-actions :: inferIntentFromPrompt', () => {
  it('maps common keywords to intents', () => {
    assert.equal(inferIntentFromPrompt('fix a bug in auth'), 'debug');
    assert.equal(inferIntentFromPrompt('write tests for cart'), 'tests');
    assert.equal(inferIntentFromPrompt('review my pull request'), 'review');
    assert.equal(inferIntentFromPrompt('refactor the payment service'), 'refactor');
    assert.equal(inferIntentFromPrompt('implement OAuth flow'), 'implementation');
    assert.equal(inferIntentFromPrompt('update the readme'), 'docs');
    assert.equal(inferIntentFromPrompt('understand how X reaches Y'), 'explore');
  });

  it('falls back to explore for empty/unknown prompts', () => {
    assert.equal(inferIntentFromPrompt(''), 'explore');
    assert.equal(inferIntentFromPrompt('do the thing'), 'explore');
    assert.equal(inferIntentFromPrompt(null), 'explore');
  });
});

describe('next-actions :: deriveStartActions', () => {
  it('blocked_guided returns repo_safety first', () => {
    const actions = deriveStartActions({ prompt: 'add feature', mode: 'blocked_guided' });
    assert.equal(actions[0].tool, 'repo_safety');
    assert.ok(toolNames(actions).includes('smart_turn'));
  });

  it('guided_refresh seeds smart_read with topFiles', () => {
    const actions = deriveStartActions({
      prompt: 'something',
      mode: 'guided_refresh',
      refreshedContext: { topFiles: [{ path: 'src/a.js' }, { path: 'src/b.js' }] },
    });
    assert.equal(actions[0].tool, 'smart_read');
    assert.deepEqual(actions[0].args.paths, ['src/a.js', 'src/b.js']);
    assert.equal(actions[0].args.mode, 'outline');
  });

  it('debug intent leads with smart_test(last_failure)', () => {
    const actions = deriveStartActions({ prompt: 'fix this bug in cart', mode: 'guided_context' });
    assert.equal(actions[0].tool, 'smart_test');
    assert.equal(actions[0].args.action, 'last_failure');
    assert.ok(toolNames(actions).includes('smart_context'));
  });

  it('tests intent suggests smart_test affected → run', () => {
    const actions = deriveStartActions({ prompt: 'write unit tests for cart', mode: 'guided_context' });
    const tools = toolNames(actions);
    assert.ok(tools.includes('smart_test'));
    const first = actions[0];
    assert.equal(first.tool, 'smart_test');
    assert.equal(first.args.action, 'affected');
  });

  it('review intent leads with smart_review', () => {
    const actions = deriveStartActions({ prompt: 'review my PR', mode: 'guided_context' });
    assert.equal(actions[0].tool, 'smart_review');
  });

  it('refactor intent suggests smart_context first + smart_test affected', () => {
    const actions = deriveStartActions({ prompt: 'refactor the cart service', mode: 'guided_context' });
    const tools = toolNames(actions);
    assert.equal(actions[0].tool, 'smart_context');
    assert.ok(tools.includes('smart_test'));
  });

  it('docs intent surfaces ADR search with kinds filter', () => {
    const actions = deriveStartActions({ prompt: 'update the architecture docs', mode: 'guided_context' });
    assert.equal(actions[0].tool, 'smart_search');
    assert.deepEqual(actions[0].args.kinds, ['adr', 'adr-section']);
  });

  it('every action carries a non-empty why', () => {
    const actions = deriveStartActions({ prompt: 'fix something', mode: 'guided_context' });
    for (const a of actions) {
      assert.ok(typeof a.why === 'string' && a.why.length > 0, `action ${a.tool} missing why`);
    }
  });

  it('summaryResult.ambiguous prepends a smart_turn(sessionId) action', () => {
    const actions = deriveStartActions({
      prompt: 'continue work',
      mode: 'guided_context',
      summaryResult: { ambiguous: true, recommendedSessionId: 'sess-123' },
    });
    assert.equal(actions[0].tool, 'smart_turn');
    assert.equal(actions[0].args.sessionId, 'sess-123');
  });
});

describe('next-actions :: deriveEndActions', () => {
  it('blocked → repo_safety first', () => {
    const actions = deriveEndActions({ mutationSafety: { blocked: true } });
    assert.equal(actions[0].tool, 'repo_safety');
  });

  it('skipped checkpoint → suggest milestone retry', () => {
    const actions = deriveEndActions({ checkpoint: { skipped: true } });
    assert.equal(actions[0].tool, 'smart_turn');
    assert.equal(actions[0].args.event, 'milestone');
  });

  it('workflow ended → restart fresh', () => {
    const actions = deriveEndActions({ workflow: { ended: true } });
    assert.equal(actions[0].tool, 'smart_turn');
    assert.equal(actions[0].args.phase, 'start');
  });

  it('default path suggests start + review', () => {
    const actions = deriveEndActions({});
    const tools = toolNames(actions);
    assert.ok(tools.includes('smart_turn'));
    assert.ok(tools.includes('smart_review'));
  });
});
