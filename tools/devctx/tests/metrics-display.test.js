import { test } from 'node:test';
import assert from 'node:assert';
import { buildMetricsDisplay } from '../src/utils/metrics-display.js';

test('buildMetricsDisplay - formats basic tool output', () => {
  const display = buildMetricsDisplay({
    tool: 'smart_read',
    target: 'src/auth.js',
    metrics: {
      rawTokens: 1200,
      compressedTokens: 120,
      savedTokens: 1080,
    },
  });

  assert.match(display, /✓ smart_read/);
  assert.match(display, /src\/auth\.js/);
  assert.match(display, /1\.2K→120 tokens/);
  assert.match(display, /10\.0:1/);
});

test('buildMetricsDisplay - formats large numbers with K/M suffixes', () => {
  const display = buildMetricsDisplay({
    tool: 'smart_context',
    target: 'analyze auth flow',
    metrics: {
      rawTokens: 15000,
      compressedTokens: 1500,
      savedTokens: 13500,
    },
    filesCount: 8,
  });

  assert.match(display, /15\.0K→1\.5K tokens/);
  assert.match(display, /8 files/);
  assert.match(display, /10\.0:1/);
});

test('buildMetricsDisplay - omits ratio when compression is low', () => {
  const display = buildMetricsDisplay({
    tool: 'smart_read',
    target: 'config.json',
    metrics: {
      rawTokens: 100,
      compressedTokens: 80,
      savedTokens: 20,
    },
  });

  assert.match(display, /100→80 tokens/);
  assert.doesNotMatch(display, /:/);
});

test('buildMetricsDisplay - truncates long targets', () => {
  const longTarget = 'a'.repeat(50);
  const display = buildMetricsDisplay({
    tool: 'smart_search',
    target: longTarget,
    metrics: {
      rawTokens: 500,
      compressedTokens: 100,
    },
  });

  assert.match(display, /\.\.\./);
  assert.ok(display.length < 150);
});

test('buildMetricsDisplay - includes files count for multi-file operations', () => {
  const display = buildMetricsDisplay({
    tool: 'smart_context',
    target: 'refactor auth',
    metrics: {
      rawTokens: 5000,
      compressedTokens: 500,
    },
    filesCount: 12,
  });

  assert.match(display, /12 files/);
});

test('buildMetricsDisplay - omits files count for single file', () => {
  const display = buildMetricsDisplay({
    tool: 'smart_read',
    target: 'src/auth.js',
    metrics: {
      rawTokens: 1000,
      compressedTokens: 100,
    },
    filesCount: 1,
  });

  assert.doesNotMatch(display, /files/);
});

test('buildMetricsDisplay - handles zero tokens gracefully', () => {
  const display = buildMetricsDisplay({
    tool: 'smart_shell',
    target: 'git status',
    metrics: {
      rawTokens: 0,
      compressedTokens: 0,
    },
  });

  assert.match(display, /✓ smart_shell/);
  assert.match(display, /git status/);
  assert.doesNotMatch(display, /tokens/);
});

test('buildMetricsDisplay - formats millions correctly', () => {
  const display = buildMetricsDisplay({
    tool: 'smart_context',
    target: 'full codebase analysis',
    metrics: {
      rawTokens: 2500000,
      compressedTokens: 250000,
    },
    filesCount: 150,
  });

  assert.match(display, /2\.5M→250\.0K tokens/);
  assert.match(display, /150 files/);
});
