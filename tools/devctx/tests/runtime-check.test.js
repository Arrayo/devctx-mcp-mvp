import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNodeVersion, assertNodeVersion } from '../src/utils/runtime-check.js';

test('checkNodeVersion returns ok for Node 22+', () => {
  const result = checkNodeVersion();
  assert.equal(result.ok, true);
  assert.match(result.current, /^v?\d+\.\d+\.\d+/);
  assert.equal(result.minimum, 22);
  assert.equal(result.reason, null);
});

test('assertNodeVersion does not throw for Node 22+', () => {
  assert.doesNotThrow(() => assertNodeVersion());
});
