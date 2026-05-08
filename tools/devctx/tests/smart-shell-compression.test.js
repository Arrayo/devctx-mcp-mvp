import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compressTapOutput, compressGitLog } from '../src/tools/smart-shell.js';

test('compressTapOutput collapses ok lines and keeps summary', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: foo',
    'ok 1 - foo',
    '  ---',
    '  duration_ms: 1.2',
    '  ...',
    'ok 2 - bar',
    '  ---',
    '  duration_ms: 0.4',
    '  ...',
    '1..2',
    '# tests 2',
    '# pass 2',
    '# fail 0',
    '# duration_ms 5',
  ].join('\n');

  const compressed = compressTapOutput(tap);

  assert.match(compressed, /TAP version 13/);
  assert.match(compressed, /all tests passed/);
  assert.match(compressed, /# tests 2/);
  assert.match(compressed, /# pass 2/);
  assert.doesNotMatch(compressed, /^ok 1 - foo$/m);
  assert.ok(compressed.length < tap.length);
});

test('compressTapOutput preserves not-ok failures with context', () => {
  const tap = [
    'TAP version 13',
    'ok 1 - happy',
    'not ok 2 - broken thing',
    '  ---',
    '  error: AssertionError [ERR_ASSERTION]',
    '  expected: true',
    '  actual: false',
    '  ...',
    'ok 3 - other',
    '# tests 3',
    '# pass 2',
    '# fail 1',
  ].join('\n');

  const compressed = compressTapOutput(tap);

  assert.match(compressed, /not ok 2 - broken thing/);
  assert.match(compressed, /AssertionError/);
  assert.match(compressed, /# fail 1/);
});

test('compressGitLog collapses commits to short sha + subject', () => {
  const log = [
    'commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'Author: Foo <foo@bar.com>',
    'Date:   Mon May 5 12:00:00 2026 +0200',
    '',
    '    First commit subject',
    '',
    '    Body details that should be ignored.',
    '',
    'commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'Author: Foo <foo@bar.com>',
    'Date:   Sun May 4 09:00:00 2026 +0200',
    '',
    '    Second commit subject',
  ].join('\n');

  const compressed = compressGitLog(log);
  const lines = compressed.split('\n');

  assert.equal(lines.length, 2);
  assert.match(lines[0], /^aaaaaaa First commit subject$/);
  assert.match(lines[1], /^bbbbbbb Second commit subject$/);
});

test('compressGitLog limits commit count and reports skipped', () => {
  const commits = Array.from({ length: 50 }, (_, i) => {
    const sha = String(i).padStart(40, '0');
    return [
      `commit ${sha}`,
      'Author: Foo <foo@bar.com>',
      'Date:   Mon May 5 12:00:00 2026 +0200',
      '',
      `    Subject ${i}`,
      '',
    ].join('\n');
  }).join('\n');

  const compressed = compressGitLog(commits);
  assert.match(compressed, /# 10 more commit\(s\) not shown/);
});
