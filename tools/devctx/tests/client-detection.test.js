import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectClient, resetClientDetection } from '../src/utils/client-detection.js';

describe('client-detection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CURSOR_AGENT;
    delete process.env.CLAUDE_AGENT;
    delete process.env.GEMINI_AGENT;
    delete process.env.CODEX_AGENT;
    resetClientDetection();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetClientDetection();
  });

  it('should detect cursor from CURSOR_AGENT=1', () => {
    process.env.CURSOR_AGENT = '1';
    assert.equal(detectClient(), 'cursor');
  });

  it('should detect claude from CLAUDE_AGENT=1', () => {
    process.env.CLAUDE_AGENT = '1';
    assert.equal(detectClient(), 'claude');
  });

  it('should detect gemini from GEMINI_AGENT=1', () => {
    process.env.GEMINI_AGENT = '1';
    assert.equal(detectClient(), 'gemini');
  });

  it('should detect codex from CODEX_AGENT=1', () => {
    process.env.CODEX_AGENT = '1';
    assert.equal(detectClient(), 'codex');
  });

  it('should return generic when no agent env var is set', () => {
    delete process.env.CURSOR_AGENT;
    delete process.env.CLAUDE_AGENT;
    delete process.env.GEMINI_AGENT;
    delete process.env.CODEX_AGENT;
    assert.equal(detectClient(), 'generic');
  });

  it('should prioritize cursor over other agents', () => {
    process.env.CURSOR_AGENT = '1';
    process.env.CLAUDE_AGENT = '1';
    assert.equal(detectClient(), 'cursor');
  });

  it('should cache detection result', () => {
    process.env.CURSOR_AGENT = '1';
    const first = detectClient();
    process.env.CURSOR_AGENT = '0';
    const second = detectClient();
    assert.equal(first, 'cursor');
    assert.equal(second, 'cursor');
  });

  it('should reset cache when resetClientDetection is called', () => {
    process.env.CURSOR_AGENT = '1';
    const first = detectClient();
    assert.equal(first, 'cursor');

    resetClientDetection();
    delete process.env.CURSOR_AGENT;
    process.env.CLAUDE_AGENT = '1';
    const second = detectClient();
    assert.equal(second, 'claude');
  });
});
