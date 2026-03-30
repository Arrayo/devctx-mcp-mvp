import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAdoption, formatAdoptionReport } from '../src/analytics/adoption.js';

test('adoption analytics - analyzes empty entries', () => {
  const result = analyzeAdoption([]);
  
  assert.equal(result.totalSessions, 0);
  assert.equal(result.sessionsWithDevctx, 0);
  assert.equal(result.sessionsWithoutDevctx, 0);
  assert.equal(result.adoptionRate, 0);
});

test('adoption analytics - counts sessions with devctx tools', () => {
  const entries = [
    { tool: 'smart_read', sessionId: 'session1', rawTokens: 1000, compressedTokens: 100, savedTokens: 900 },
    { tool: 'smart_search', sessionId: 'session1', rawTokens: 2000, compressedTokens: 200, savedTokens: 1800 },
    { tool: 'smart_read', sessionId: 'session2', rawTokens: 500, compressedTokens: 50, savedTokens: 450 },
  ];
  
  const result = analyzeAdoption(entries);
  
  assert.equal(result.totalSessions, 2);
  assert.equal(result.sessionsWithDevctx, 2);
  assert.equal(result.sessionsWithoutDevctx, 0);
  assert.equal(result.adoptionRate, 100);
});

test('adoption analytics - counts sessions without devctx tools', () => {
  const entries = [
    { tool: 'Read', sessionId: 'session1', rawTokens: 1000, compressedTokens: 1000, savedTokens: 0 },
    { tool: 'Grep', sessionId: 'session1', rawTokens: 2000, compressedTokens: 2000, savedTokens: 0 },
    { tool: 'smart_read', sessionId: 'session2', rawTokens: 500, compressedTokens: 50, savedTokens: 450 },
  ];
  
  const result = analyzeAdoption(entries);
  
  assert.equal(result.totalSessions, 2);
  assert.equal(result.sessionsWithDevctx, 1);
  assert.equal(result.sessionsWithoutDevctx, 1);
  assert.equal(result.adoptionRate, 50);
});

test('adoption analytics - infers complexity from operation count', () => {
  const entries = [
    // Trivial: 1 op, 1 file
    { tool: 'smart_read', sessionId: 'trivial', target: 'file1.js', rawTokens: 100, compressedTokens: 10 },
    
    // Simple: 3 ops, 2 files
    { tool: 'smart_read', sessionId: 'simple', target: 'file1.js', rawTokens: 100, compressedTokens: 10 },
    { tool: 'smart_read', sessionId: 'simple', target: 'file2.js', rawTokens: 100, compressedTokens: 10 },
    { tool: 'smart_search', sessionId: 'simple', target: 'query', rawTokens: 100, compressedTokens: 10 },
    
    // Moderate: 8 ops, 5 files
    ...Array(8).fill(null).map((_, i) => ({
      tool: 'smart_read',
      sessionId: 'moderate',
      target: `file${i % 5}.js`,
      rawTokens: 100,
      compressedTokens: 10,
    })),
    
    // Complex: 20 ops, 15 files
    ...Array(20).fill(null).map((_, i) => ({
      tool: 'smart_read',
      sessionId: 'complex',
      target: `file${i % 15}.js`,
      rawTokens: 100,
      compressedTokens: 10,
    })),
  ].flat();
  
  const result = analyzeAdoption(entries);
  
  assert.equal(result.byComplexity.trivial.total, 1);
  assert.equal(result.byComplexity.simple.total, 1);
  assert.equal(result.byComplexity.moderate.total, 1);
  assert.equal(result.byComplexity.complex.total, 1);
  
  assert.equal(result.byComplexity.trivial.withDevctx, 1);
  assert.equal(result.byComplexity.simple.withDevctx, 1);
  assert.equal(result.byComplexity.moderate.withDevctx, 1);
  assert.equal(result.byComplexity.complex.withDevctx, 1);
});

test('adoption analytics - calculates non-trivial adoption rate', () => {
  const entries = [
    // Trivial session (1 op)
    { tool: 'Read', sessionId: 'trivial', rawTokens: 100, compressedTokens: 100 },
    
    // Complex session with devctx (20 ops)
    ...Array(20).fill(null).map((_, i) => ({
      tool: 'smart_read',
      sessionId: 'complex1',
      target: `file${i}.js`,
      rawTokens: 100,
      compressedTokens: 10,
    })),
    
    // Complex session without devctx (20 ops)
    ...Array(20).fill(null).map((_, i) => ({
      tool: 'Read',
      sessionId: 'complex2',
      target: `file${i}.js`,
      rawTokens: 100,
      compressedTokens: 100,
    })),
  ].flat();
  
  const result = analyzeAdoption(entries);
  
  assert.equal(result.nonTrivial.total, 2);
  assert.equal(result.nonTrivial.withDevctx, 1);
  assert.equal(result.nonTrivial.adoptionRate, 50);
});

test('adoption analytics - tracks tool usage count', () => {
  const entries = [
    { tool: 'smart_read', sessionId: 'session1', rawTokens: 100, compressedTokens: 10 },
    { tool: 'smart_read', sessionId: 'session2', rawTokens: 100, compressedTokens: 10 },
    { tool: 'smart_search', sessionId: 'session1', rawTokens: 100, compressedTokens: 10 },
    { tool: 'smart_context', sessionId: 'session3', rawTokens: 100, compressedTokens: 10 },
  ];
  
  const result = analyzeAdoption(entries);
  
  assert.equal(result.toolUsageCount.smart_read, 2);
  assert.equal(result.toolUsageCount.smart_search, 1);
  assert.equal(result.toolUsageCount.smart_context, 1);
});

test('adoption analytics - calculates averages when devctx used', () => {
  const entries = [
    { tool: 'smart_read', sessionId: 'session1', rawTokens: 1000, compressedTokens: 100, savedTokens: 900 },
    { tool: 'smart_search', sessionId: 'session1', rawTokens: 2000, compressedTokens: 200, savedTokens: 1800 },
    { tool: 'smart_read', sessionId: 'session2', rawTokens: 500, compressedTokens: 50, savedTokens: 450 },
  ];
  
  const result = analyzeAdoption(entries);
  
  assert.equal(result.avgToolsPerSession, 1.5); // session1: 2 tools, session2: 1 tool → avg 1.5
  assert.equal(result.avgTokenSavingsWhenUsed, 1575); // (900+1800+450) / 2 sessions = 1575
});

test('adoption analytics - formats report correctly', () => {
  const stats = {
    totalSessions: 100,
    sessionsWithDevctx: 60,
    sessionsWithoutDevctx: 40,
    adoptionRate: 60,
    nonTrivial: {
      total: 80,
      withDevctx: 56,
      adoptionRate: 70,
    },
    byComplexity: {
      trivial: { total: 20, withDevctx: 4, adoptionRate: 20 },
      simple: { total: 30, withDevctx: 15, adoptionRate: 50 },
      moderate: { total: 25, withDevctx: 18, adoptionRate: 72 },
      complex: { total: 25, withDevctx: 23, adoptionRate: 92 },
    },
    toolUsageCount: {
      smart_read: 89,
      smart_search: 67,
      smart_context: 45,
    },
    avgToolsPerSession: 2.8,
    avgTokenSavingsWhenUsed: 146337,
  };
  
  const report = formatAdoptionReport(stats);
  
  assert.match(report, /Adoption Analysis/);
  assert.match(report, /Total sessions:\s+100/);
  assert.match(report, /Sessions with devctx:\s+60 \(60%\)/);
  assert.match(report, /Non-Trivial Tasks Only:/);
  assert.match(report, /By Inferred Complexity:/);
  assert.match(report, /complex\s+23\/25 \(92%\)/);
  assert.match(report, /Limitations:/);
});

test('adoption analytics - handles sessions without sessionId', () => {
  const entries = [
    { tool: 'smart_read', rawTokens: 100, compressedTokens: 10 },
    { tool: 'smart_search', rawTokens: 100, compressedTokens: 10 },
  ];
  
  const result = analyzeAdoption(entries);
  
  assert.equal(result.totalSessions, 1); // Grouped under 'unknown'
  assert.equal(result.sessionsWithDevctx, 1);
});
