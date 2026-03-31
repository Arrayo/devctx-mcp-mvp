import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { smartRead } from '../src/tools/smart-read.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../evals/fixtures/sample-project');

describe('smart_read outline with range', () => {
  it('should extract only signatures in range when mode=outline with startLine/endLine', async () => {
    const result = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'outline',
      startLine: 1,
      endLine: 20,
    });

    assert.ok(result.content, 'Should have content');
    assert.equal(result.mode, 'outline');
    assert.equal(result.parser, 'ast');
    
    const lines = result.content.split('\n');
    assert.ok(lines.length < 100, 'Should be compressed (outline mode)');
  });

  it('should work with signatures mode and range', async () => {
    const result = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'signatures',
      startLine: 1,
      endLine: 20,
    });

    assert.ok(result.content, 'Should have content');
    const lines = result.content.split('\n');
    assert.ok(lines.length < 50, 'Should be very compressed (signatures mode)');
  });

  it('should fallback to full file when no range specified', async () => {
    const resultWithRange = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'outline',
      startLine: 1,
      endLine: 10,
    });

    const resultFullFile = await smartRead({
      filePath: path.join(fixturesDir, 'src/auth/middleware.js'),
      mode: 'outline',
    });

    assert.ok(resultWithRange.content, 'Range result should have content');
    assert.ok(resultFullFile.content, 'Full file result should have content');
    assert.ok(resultFullFile.content.length >= resultWithRange.content.length, 
      'Full file should have at least as much content as range');
  });
});
