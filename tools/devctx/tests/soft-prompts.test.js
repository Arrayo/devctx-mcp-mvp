import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSoftPrompt,
  isSoftPromptsEnabled,
  shouldEmitSoftPrompt,
  markSoftPromptEmitted,
  _resetSoftPromptThrottle,
} from '../src/orchestration/policy/soft-prompts.js';

describe('soft-prompts :: isSoftPromptsEnabled', () => {
  it('is enabled by default', () => {
    const saved = process.env.DEVCTX_DISABLE_SOFT_PROMPTS;
    delete process.env.DEVCTX_DISABLE_SOFT_PROMPTS;
    try {
      assert.equal(isSoftPromptsEnabled(), true);
    } finally {
      if (saved !== undefined) process.env.DEVCTX_DISABLE_SOFT_PROMPTS = saved;
    }
  });

  it('honors DEVCTX_DISABLE_SOFT_PROMPTS=true', () => {
    const saved = process.env.DEVCTX_DISABLE_SOFT_PROMPTS;
    process.env.DEVCTX_DISABLE_SOFT_PROMPTS = 'true';
    try {
      assert.equal(isSoftPromptsEnabled(), false);
    } finally {
      if (saved !== undefined) process.env.DEVCTX_DISABLE_SOFT_PROMPTS = saved;
      else delete process.env.DEVCTX_DISABLE_SOFT_PROMPTS;
    }
  });
});

describe('soft-prompts :: evaluateSoftPrompt', () => {
  it('large Read response triggers smart_read outline hint', () => {
    const result = evaluateSoftPrompt({
      toolName: 'Read',
      toolInput: { path: 'src/big.js' },
      toolResponse: { content: 'x'.repeat(15000) },
      state: { meaningfulReadCount: 0, readFiles: [], touchedFiles: [] },
    });
    assert.ok(result);
    assert.equal(result.kind, 'large_read');
    assert.match(result.message, /smart_read.*outline/);
    assert.match(result.message, /src\/big\.js/);
  });

  it('repeated reads without writes triggers smart_context hint', () => {
    const result = evaluateSoftPrompt({
      toolName: 'Read',
      toolInput: { path: 'src/a.js' },
      toolResponse: 'small content',
      state: { meaningfulReadCount: 4, readFiles: ['a', 'b', 'c', 'd'], touchedFiles: [] },
    });
    assert.ok(result);
    assert.equal(result.kind, 'repeated_reads');
    assert.match(result.message, /smart_context/);
  });

  it('does not trigger repeated_reads when writes have happened', () => {
    const result = evaluateSoftPrompt({
      toolName: 'Read',
      toolInput: { path: 'src/a.js' },
      toolResponse: 'small',
      state: { meaningfulReadCount: 5, readFiles: ['a'], touchedFiles: ['src/a.js'] },
    });
    assert.equal(result, null);
  });

  it('repeated Grep triggers smart_search hint with kinds example', () => {
    const result = evaluateSoftPrompt({
      toolName: 'Grep',
      toolInput: { pattern: 'auth' },
      toolResponse: '',
      state: { meaningfulReadCount: 0, readFiles: ['a', 'b'], touchedFiles: [] },
    });
    assert.ok(result);
    assert.equal(result.kind, 'repeated_search');
    assert.match(result.message, /smart_search/);
    assert.match(result.message, /kinds/);
  });

  it('returns null for unrelated tools', () => {
    const result = evaluateSoftPrompt({
      toolName: 'Write',
      toolInput: { path: 'src/x.js', content: 'foo' },
      toolResponse: 'ok',
      state: { meaningfulReadCount: 0, readFiles: [], touchedFiles: [] },
    });
    assert.equal(result, null);
  });

  it('returns null when toolName missing', () => {
    assert.equal(evaluateSoftPrompt({}), null);
  });
});

describe('soft-prompts :: throttling', () => {
  beforeEach(() => _resetSoftPromptThrottle());

  it('first emission for a hookKey is allowed', () => {
    assert.equal(shouldEmitSoftPrompt('cursor:abc'), true);
  });

  it('blocks consecutive emissions within the throttle window', () => {
    const key = 'cursor:abc';
    const now = Date.now();
    assert.equal(shouldEmitSoftPrompt(key, now), true);
    markSoftPromptEmitted(key, now);
    assert.equal(shouldEmitSoftPrompt(key, now + 30_000), false);
  });

  it('allows emission after the throttle window expires', () => {
    const key = 'cursor:abc';
    const now = Date.now();
    markSoftPromptEmitted(key, now);
    assert.equal(shouldEmitSoftPrompt(key, now + 3 * 60_000), true);
  });

  it('different hookKeys are independent', () => {
    const now = Date.now();
    markSoftPromptEmitted('cursor:a', now);
    assert.equal(shouldEmitSoftPrompt('cursor:b', now + 1000), true);
  });
});
