import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractLiteralPatterns } from '../src/utils/query-extraction.js';
import { smartContext } from '../src/tools/smart-context.js';

describe('extractLiteralPatterns', () => {
  it('should detect JSDoc comments', () => {
    const patterns = extractLiteralPatterns('Find files with /** comments');
    assert.ok(patterns.includes('/**'));
  });

  it('should detect TODO comments', () => {
    const patterns = extractLiteralPatterns('Find all // TODO items');
    assert.ok(patterns.includes('TODO'));
  });

  it('should detect FIXME comments', () => {
    const patterns = extractLiteralPatterns('Search for // FIXME markers');
    assert.ok(patterns.includes('FIXME'));
  });

  it('should detect console.log', () => {
    const patterns = extractLiteralPatterns('Remove all console.log statements');
    assert.ok(patterns.includes('console.log'));
  });

  it('should detect multiple patterns', () => {
    const patterns = extractLiteralPatterns('Find /** and // TODO and console.log');
    assert.ok(patterns.includes('/**'));
    assert.ok(patterns.includes('TODO'));
    assert.ok(patterns.includes('console.log'));
  });

  it('should return empty for no patterns', () => {
    const patterns = extractLiteralPatterns('Implement user authentication');
    assert.equal(patterns.length, 0);
  });
});

describe('smart_context with literal patterns', () => {
  it('should prioritize literal patterns in search', async () => {
    const result = await smartContext({
      task: 'Find files with /** comments',
      detail: 'minimal',
    });

    assert.ok(result.success);
    assert.ok(result.context.length > 0, 'Should find files with JSDoc comments');
  });
});
