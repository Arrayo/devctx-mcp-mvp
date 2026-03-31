import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { smartEdit } from '../src/tools/smart-edit.js';

const FIXTURE_DIR = path.join(process.cwd(), 'evals/fixtures/sample-project');
const TEST_FILE_1 = path.join(FIXTURE_DIR, 'test-edit-1.txt');
const TEST_FILE_2 = path.join(FIXTURE_DIR, 'test-edit-2.txt');

describe('smart_edit', () => {
  before(() => {
    fs.writeFileSync(TEST_FILE_1, 'console.log("test");\nconsole.log("debug");\nconst x = 1;', 'utf8');
    fs.writeFileSync(TEST_FILE_2, 'TODO: fix this\nFIXME: broken\ncode here', 'utf8');
  });

  after(() => {
    try { fs.unlinkSync(TEST_FILE_1); } catch {}
    try { fs.unlinkSync(TEST_FILE_2); } catch {}
  });

  it('should replace literal strings', () => {
    const result = smartEdit({
      pattern: 'console.log',
      replacement: 'logger.info',
      files: [TEST_FILE_1],
      mode: 'literal',
      dryRun: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.totalMatches, 2);
    assert.equal(result.filesModified, 1);
    assert.equal(result.dryRun, true);
  });

  it('should replace with regex', () => {
    const result = smartEdit({
      pattern: 'console\\.log\\([^)]+\\);?\\n?',
      replacement: '',
      files: [TEST_FILE_1],
      mode: 'regex',
      dryRun: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.totalMatches, 2);
  });

  it('should modify files when not dry run', () => {
    const result = smartEdit({
      pattern: 'TODO',
      replacement: 'DONE',
      files: [TEST_FILE_2],
      mode: 'literal',
      dryRun: false,
    });

    assert.equal(result.success, true);
    assert.equal(result.totalReplacements, 1);
    
    const content = fs.readFileSync(TEST_FILE_2, 'utf8');
    assert.ok(content.includes('DONE'));
    assert.ok(!content.includes('TODO'));
  });

  it('should handle multiple files', () => {
    fs.writeFileSync(TEST_FILE_1, 'test\ntest\ntest', 'utf8');
    fs.writeFileSync(TEST_FILE_2, 'test\ntest', 'utf8');

    const result = smartEdit({
      pattern: 'test',
      replacement: 'prod',
      files: [TEST_FILE_1, TEST_FILE_2],
      mode: 'literal',
      dryRun: false,
    });

    assert.equal(result.success, true);
    assert.equal(result.totalMatches, 5);
    assert.equal(result.filesModified, 2);
  });

  it('should handle files with no matches', () => {
    fs.writeFileSync(TEST_FILE_1, 'nothing here', 'utf8');

    const result = smartEdit({
      pattern: 'nonexistent',
      replacement: 'replacement',
      files: [TEST_FILE_1],
      mode: 'literal',
      dryRun: false,
    });

    assert.equal(result.success, true);
    assert.equal(result.totalMatches, 0);
    assert.equal(result.filesModified, 0);
  });

  it('should handle errors gracefully', () => {
    const result = smartEdit({
      pattern: 'test',
      replacement: 'prod',
      files: ['nonexistent-file.txt'],
      mode: 'literal',
      dryRun: false,
    });

    assert.equal(result.success, true);
    assert.ok(result.results[0].error);
  });
});
