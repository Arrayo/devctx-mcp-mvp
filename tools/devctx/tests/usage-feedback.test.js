import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFeedbackEnabled,
  recordToolUsage,
  getSessionUsage,
  formatUsageFeedback,
  resetSessionUsage,
} from '../src/usage-feedback.js';

test('usage feedback - disabled by default', () => {
  delete process.env.DEVCTX_SHOW_USAGE;
  resetSessionUsage();
  
  assert.equal(isFeedbackEnabled(), false);
  assert.equal(formatUsageFeedback(), '');
});

test('usage feedback - enabled with DEVCTX_SHOW_USAGE=true', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  assert.equal(isFeedbackEnabled(), true);
});

test('usage feedback - enabled with DEVCTX_SHOW_USAGE=1', () => {
  process.env.DEVCTX_SHOW_USAGE = '1';
  resetSessionUsage();
  
  assert.equal(isFeedbackEnabled(), true);
});

test('usage feedback - records tool usage', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file.js' });
  recordToolUsage({ tool: 'smart_search', savedTokens: 2000, target: 'query' });
  
  const usage = getSessionUsage();
  
  assert.equal(usage.tools.length, 2);
  assert.equal(usage.totalSavedTokens, 3000);
  
  const smartRead = usage.tools.find(t => t.tool === 'smart_read');
  assert.equal(smartRead.count, 1);
  assert.equal(smartRead.savedTokens, 1000);
  assert.deepEqual(smartRead.targets, ['file.js']);
});

test('usage feedback - aggregates multiple calls to same tool', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file1.js' });
  recordToolUsage({ tool: 'smart_read', savedTokens: 500, target: 'file2.js' });
  recordToolUsage({ tool: 'smart_read', savedTokens: 750, target: 'file3.js' });
  
  const usage = getSessionUsage();
  
  assert.equal(usage.tools.length, 1);
  const smartRead = usage.tools[0];
  assert.equal(smartRead.tool, 'smart_read');
  assert.equal(smartRead.count, 3);
  assert.equal(smartRead.savedTokens, 2250);
  assert.deepEqual(smartRead.targets, ['file1.js', 'file2.js', 'file3.js']);
});

test('usage feedback - formats feedback correctly', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 45000, target: 'file.js' });
  recordToolUsage({ tool: 'smart_search', savedTokens: 12000, target: 'query' });
  
  const feedback = formatUsageFeedback();
  
  assert.match(feedback, /📊 \*\*devctx usage this session:\*\*/);
  assert.match(feedback, /smart_read/);
  assert.match(feedback, /smart_search/);
  assert.match(feedback, /45\.0K tokens/);
  assert.match(feedback, /12\.0K tokens/);
  assert.match(feedback, /Total saved.*57\.0K tokens/);
  assert.match(feedback, /To disable this message/);
});

test('usage feedback - formats large token counts', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 1500000, target: 'file.js' });
  
  const feedback = formatUsageFeedback();
  
  assert.match(feedback, /1\.5M tokens/);
});

test('usage feedback - truncates long target paths', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  const longPath = 'very/long/path/to/some/deeply/nested/file/that/is/very/long.js';
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: longPath });
  
  const feedback = formatUsageFeedback();
  
  // Should show filename or truncated path
  assert.match(feedback, /\.\.\./);
});

test('usage feedback - shows multiple files count', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file1.js' });
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file2.js' });
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file3.js' });
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file4.js' });
  
  const feedback = formatUsageFeedback();
  
  // Shows last 3 targets, but count is 4 calls
  assert.match(feedback, /4 calls/);
  assert.match(feedback, /3 files/);
});

test('usage feedback - resets session usage', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file.js' });
  
  let usage = getSessionUsage();
  assert.equal(usage.tools.length, 1);
  
  resetSessionUsage();
  
  usage = getSessionUsage();
  assert.equal(usage.tools.length, 0);
  assert.equal(usage.totalSavedTokens, 0);
});

test('usage feedback - does not record when disabled', () => {
  process.env.DEVCTX_SHOW_USAGE = 'false';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000, target: 'file.js' });
  
  const usage = getSessionUsage();
  assert.equal(usage.tools.length, 0);
});

test('usage feedback - sorts tools by count descending', () => {
  process.env.DEVCTX_SHOW_USAGE = 'true';
  resetSessionUsage();
  
  recordToolUsage({ tool: 'smart_read', savedTokens: 1000 });
  recordToolUsage({ tool: 'smart_search', savedTokens: 1000 });
  recordToolUsage({ tool: 'smart_search', savedTokens: 1000 });
  recordToolUsage({ tool: 'smart_search', savedTokens: 1000 });
  recordToolUsage({ tool: 'smart_context', savedTokens: 1000 });
  recordToolUsage({ tool: 'smart_context', savedTokens: 1000 });
  
  const feedback = formatUsageFeedback();
  
  // smart_search (3 calls) should appear before smart_context (2 calls) and smart_read (1 call)
  const searchIndex = feedback.indexOf('smart_search');
  const contextIndex = feedback.indexOf('smart_context');
  const readIndex = feedback.indexOf('smart_read');
  
  assert.ok(searchIndex < contextIndex);
  assert.ok(contextIndex < readIndex);
});
