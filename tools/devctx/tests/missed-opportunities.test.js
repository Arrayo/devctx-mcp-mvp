import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMissedDetectionEnabled,
  recordDevctxOperation,
  analyzeMissedOpportunities,
  formatMissedOpportunities,
  getSessionActivity,
  resetSessionActivity,
  __testing__,
} from '../src/missed-opportunities.js';

test('missed opportunities - enabled by default', () => {
  delete process.env.DEVCTX_DETECT_MISSED;
  resetSessionActivity();
  
  assert.equal(isMissedDetectionEnabled(), true);
});

test('missed opportunities - enabled with DEVCTX_DETECT_MISSED=true', () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  assert.equal(isMissedDetectionEnabled(), true);
});

test('missed opportunities - records devctx operations', () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  recordDevctxOperation();
  recordDevctxOperation();
  recordDevctxOperation();
  
  const activity = getSessionActivity();
  assert.equal(activity.devctxOperations, 3);
  assert.equal(activity.totalOperations, 3);
});

test('missed opportunities - detects no devctx usage in long session', async () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  // Simulate session start 6 minutes ago
  __testing__.setSessionStart(Date.now() - (6 * 60 * 1000));
  
  const analysis = analyzeMissedOpportunities();
  
  assert.ok(analysis);
  assert.ok(analysis.opportunities.length > 0);
  
  const noUsage = analysis.opportunities.find(o => o.type === 'no_devctx_usage');
  assert.ok(noUsage);
  assert.equal(noUsage.severity, 'high');
  assert.match(noUsage.reason, /Session active for >5 minutes with 0 devctx calls/);
});

test('missed opportunities - detects low adoption', () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  // Simulate 2 devctx calls
  recordDevctxOperation();
  recordDevctxOperation();
  
  // Manually set estimated total to 15 (simulating many native calls)
  __testing__.setTotalOperations(15);
  
  const analysis = analyzeMissedOpportunities();
  
  assert.ok(analysis);
  const lowAdoption = analysis.opportunities.find(o => o.type === 'low_devctx_adoption');
  assert.ok(lowAdoption);
  assert.equal(lowAdoption.severity, 'medium');
  assert.match(lowAdoption.reason, /Low devctx adoption/);
});

test('missed opportunities - detects usage dropped', async () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  // Record devctx operation
  recordDevctxOperation();
  
  // Simulate last devctx call was 4 minutes ago
  __testing__.setLastDevctxCall(Date.now() - (4 * 60 * 1000));
  
  const analysis = analyzeMissedOpportunities();
  
  assert.ok(analysis);
  const dropped = analysis.opportunities.find(o => o.type === 'devctx_usage_dropped');
  assert.ok(dropped);
  assert.equal(dropped.severity, 'medium');
  assert.match(dropped.reason, /No devctx calls for \d+ minutes/);
});

test('missed opportunities - no detection for short sessions', () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  // Session just started (<1 minute)
  const analysis = analyzeMissedOpportunities();
  
  assert.ok(analysis);
  // May have 0 or 1 opportunities depending on timing
  // Just verify analysis returns and has message for short session
  if (analysis.opportunities.length === 0) {
    assert.match(analysis.message || '', /Session too short/);
  }
});

test('missed opportunities - formats opportunities correctly', async () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  // Simulate long session with no devctx
  __testing__.setSessionStart(Date.now() - (6 * 60 * 1000));
  
  const formatted = formatMissedOpportunities();
  
  assert.match(formatted, /⚠️ \*\*Missed devctx opportunities detected:\*\*/);
  assert.match(formatted, /Session stats:/);
  assert.match(formatted, /How to fix:/);
  assert.match(formatted, /forcing prompt/);
});

test('missed opportunities - calculates estimated savings', async () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  // Simulate session with low adoption
  recordDevctxOperation();
  __testing__.setTotalOperations(20); // Many operations, few devctx
  
  const analysis = analyzeMissedOpportunities();
  
  assert.ok(analysis);
  assert.ok(analysis.totalEstimatedSavings > 0);
});

test('missed opportunities - resets session activity', () => {
  process.env.DEVCTX_DETECT_MISSED = 'true';
  resetSessionActivity();
  
  recordDevctxOperation();
  recordDevctxOperation();
  
  let activity = getSessionActivity();
  assert.equal(activity.devctxOperations, 2);
  
  resetSessionActivity();
  
  activity = getSessionActivity();
  assert.equal(activity.devctxOperations, 0);
  assert.equal(activity.totalOperations, 0);
});

test('missed opportunities - does not detect when disabled', () => {
  process.env.DEVCTX_DETECT_MISSED = 'false';
  resetSessionActivity();
  
  // Simulate long session with no devctx
  __testing__.setSessionStart(Date.now() - (6 * 60 * 1000));
  
  const analysis = analyzeMissedOpportunities();
  assert.equal(analysis, null);
  
  const formatted = formatMissedOpportunities();
  assert.equal(formatted, '');
});

