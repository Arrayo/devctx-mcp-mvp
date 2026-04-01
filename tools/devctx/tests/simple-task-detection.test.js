import { test } from 'node:test';
import assert from 'node:assert';
import { isSimpleTask } from '../src/orchestration/policy/event-policy.js';

test('isSimpleTask - detects simple single-action tasks', () => {
  assert.strictEqual(isSimpleTask('move hook from UI to view-model'), true);
  assert.strictEqual(isSimpleTask('rename getUserData to fetchUserProfile'), true);
  assert.strictEqual(isSimpleTask('delete unused import in auth.js'), true);
  assert.strictEqual(isSimpleTask('add error handling to login'), true);
  assert.strictEqual(isSimpleTask('fix typo in README'), true);
  assert.strictEqual(isSimpleTask('update version to 1.7.2'), true);
});

test('isSimpleTask - detects simple creation/display tasks', () => {
  assert.strictEqual(isSimpleTask('create a helper function'), true);
  assert.strictEqual(isSimpleTask('write a test for auth'), true);
  assert.strictEqual(isSimpleTask('read the config file'), true);
  assert.strictEqual(isSimpleTask('show me the error handler'), true);
  assert.strictEqual(isSimpleTask('find the login component'), true);
});

test('isSimpleTask - detects single-item tasks', () => {
  assert.strictEqual(isSimpleTask('update this file'), true);
  assert.strictEqual(isSimpleTask('fix that function'), true);
  assert.strictEqual(isSimpleTask('change one component'), true);
  assert.strictEqual(isSimpleTask('remove this method'), true);
});

test('isSimpleTask - detects simple comment/import tasks', () => {
  assert.strictEqual(isSimpleTask('add comment to calculateTotal'), true);
  assert.strictEqual(isSimpleTask('remove unused import'), true);
  assert.strictEqual(isSimpleTask('update type definition'), true);
  assert.strictEqual(isSimpleTask('fix interface declaration'), true);
});

test('isSimpleTask - rejects complex multi-step tasks', () => {
  assert.strictEqual(isSimpleTask('refactor the entire auth system'), false);
  assert.strictEqual(isSimpleTask('migrate all components to TypeScript'), false);
  assert.strictEqual(isSimpleTask('redesign the architecture'), false);
  assert.strictEqual(isSimpleTask('implement user authentication'), false);
  assert.strictEqual(isSimpleTask('integrate payment system'), false);
});

test('isSimpleTask - rejects tasks with complex indicators', () => {
  assert.strictEqual(isSimpleTask('update all files in src/'), false);
  assert.strictEqual(isSimpleTask('fix every occurrence of the bug'), false);
  assert.strictEqual(isSimpleTask('change the entire infrastructure'), false);
  assert.strictEqual(isSimpleTask('update multiple components'), false);
  assert.strictEqual(isSimpleTask('refactor several modules'), false);
});

test('isSimpleTask - rejects long prompts', () => {
  const longPrompt = 'a'.repeat(250);
  assert.strictEqual(isSimpleTask(longPrompt), false);
});

test('isSimpleTask - handles edge cases', () => {
  assert.strictEqual(isSimpleTask(''), false);
  assert.strictEqual(isSimpleTask(null), false);
  assert.strictEqual(isSimpleTask(undefined), false);
  assert.strictEqual(isSimpleTask(123), false);
});

test('isSimpleTask - case insensitive matching', () => {
  assert.strictEqual(isSimpleTask('MOVE hook to view-model'), true);
  assert.strictEqual(isSimpleTask('FIX typo in readme'), true);
  assert.strictEqual(isSimpleTask('REFACTOR entire system'), false);
});

test('isSimpleTask - whitespace normalization', () => {
  assert.strictEqual(isSimpleTask('move   hook   to   view-model'), true);
  assert.strictEqual(isSimpleTask('  fix typo  '), true);
});
