import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNodeVersion, assertNodeVersion } from '../src/utils/runtime-check.js';

test('checkNodeVersion returns ok for Node 22+', () => {
  const result = checkNodeVersion('v22.14.0');
  assert.equal(result.ok, true);
  assert.equal(result.current, 'v22.14.0');
  assert.equal(result.minimum, 22);
  assert.equal(result.reason, null);
});

test('assertNodeVersion does not throw for Node 22+', () => {
  assert.doesNotThrow(() => assertNodeVersion('v22.14.0'));
});

test('checkNodeVersion returns failure for Node 20', () => {
  const result = checkNodeVersion('v20.20.1');
  assert.equal(result.ok, false);
  assert.equal(result.current, 'v20.20.1');
  assert.equal(result.minimum, 22);
  assert.match(result.message, /below minimum requirement \(22\+\)/);
  assert.match(result.reason, /node:sqlite and node:test require Node 22\+/);
});

test('assertNodeVersion throws for Node 20', () => {
  assert.throws(
    () => assertNodeVersion('v20.20.1'),
    /Node v20\.20\.1 is below minimum requirement \(22\+\)/,
  );
});
