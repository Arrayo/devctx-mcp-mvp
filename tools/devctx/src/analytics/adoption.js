/**
 * Adoption analytics - measures how often agents use devctx tools in practice
 * 
 * Limitations:
 * - Complexity is inferred from operation count, not actual task complexity
 * - Can't detect feedback shown (requires agent cooperation)
 * - Can't detect forcing prompts (requires prompt analysis)
 * - Can only measure when devctx IS used, not when it's ignored
 */

const DEVCTX_TOOLS = new Set([
  'smart_read',
  'smart_search',
  'smart_context',
  'smart_shell',
  'smart_summary',
  'smart_turn',
  'smart_read_batch',
  'smart_metrics',
  'build_index',
  'warm_cache',
  'git_blame',
  'cross_project',
]);

const inferComplexity = (opCount, fileCount) => {
  if (opCount <= 2 && fileCount <= 1) return 'trivial';
  if (opCount <= 5 && fileCount <= 3) return 'simple';
  if (opCount <= 15 && fileCount <= 10) return 'moderate';
  return 'complex';
};

const groupBySession = (entries) => {
  const sessions = new Map();
  
  for (const entry of entries) {
    const sessionId = entry.sessionId || entry.session_id || 'unknown';
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        sessionId,
        operations: [],
        devctxTools: new Set(),
        nativeTools: new Set(),
        filesAccessed: new Set(),
        totalRawTokens: 0,
        totalCompressedTokens: 0,
        totalSavedTokens: 0,
      });
    }
    
    const session = sessions.get(sessionId);
    session.operations.push(entry);
    
    const tool = entry.tool;
    if (DEVCTX_TOOLS.has(tool)) {
      session.devctxTools.add(tool);
    } else if (tool) {
      session.nativeTools.add(tool);
    }
    
    if (entry.target) {
      session.filesAccessed.add(entry.target);
    }
    
    session.totalRawTokens += Number(entry.rawTokens || entry.raw_tokens || 0);
    session.totalCompressedTokens += Number(entry.compressedTokens || entry.compressed_tokens || 0);
    session.totalSavedTokens += Number(entry.savedTokens || entry.saved_tokens || 0);
  }
  
  return Array.from(sessions.values());
};

export const analyzeAdoption = (entries) => {
  const sessions = groupBySession(entries);
  
  const sessionsWithDevctx = sessions.filter(s => s.devctxTools.size > 0);
  const sessionsWithoutDevctx = sessions.filter(s => s.devctxTools.size === 0 && s.operations.length > 0);
  
  const byComplexity = {
    trivial: { total: 0, withDevctx: 0 },
    simple: { total: 0, withDevctx: 0 },
    moderate: { total: 0, withDevctx: 0 },
    complex: { total: 0, withDevctx: 0 },
  };
  
  for (const session of sessions) {
    const complexity = inferComplexity(session.operations.length, session.filesAccessed.size);
    byComplexity[complexity].total += 1;
    if (session.devctxTools.size > 0) {
      byComplexity[complexity].withDevctx += 1;
    }
  }
  
  const nonTrivialSessions = sessions.filter(s => {
    const complexity = inferComplexity(s.operations.length, s.filesAccessed.size);
    return complexity !== 'trivial';
  });
  
  const nonTrivialWithDevctx = nonTrivialSessions.filter(s => s.devctxTools.size > 0);
  
  const toolUsageCount = {};
  for (const session of sessionsWithDevctx) {
    for (const tool of session.devctxTools) {
      toolUsageCount[tool] = (toolUsageCount[tool] || 0) + 1;
    }
  }
  
  return {
    totalSessions: sessions.length,
    sessionsWithDevctx: sessionsWithDevctx.length,
    sessionsWithoutDevctx: sessionsWithoutDevctx.length,
    adoptionRate: sessions.length > 0 
      ? Number(((sessionsWithDevctx.length / sessions.length) * 100).toFixed(1))
      : 0,
    
    nonTrivial: {
      total: nonTrivialSessions.length,
      withDevctx: nonTrivialWithDevctx.length,
      adoptionRate: nonTrivialSessions.length > 0
        ? Number(((nonTrivialWithDevctx.length / nonTrivialSessions.length) * 100).toFixed(1))
        : 0,
    },
    
    byComplexity: Object.fromEntries(
      Object.entries(byComplexity).map(([level, stats]) => [
        level,
        {
          ...stats,
          adoptionRate: stats.total > 0 
            ? Number(((stats.withDevctx / stats.total) * 100).toFixed(1))
            : 0,
        },
      ])
    ),
    
    toolUsageCount,
    
    avgToolsPerSession: sessionsWithDevctx.length > 0
      ? Number((sessionsWithDevctx.reduce((sum, s) => sum + s.devctxTools.size, 0) / sessionsWithDevctx.length).toFixed(1))
      : 0,
    
    avgTokenSavingsWhenUsed: sessionsWithDevctx.length > 0
      ? Number((sessionsWithDevctx.reduce((sum, s) => sum + s.totalSavedTokens, 0) / sessionsWithDevctx.length).toFixed(0))
      : 0,
  };
};

export const formatAdoptionReport = (stats) => {
  const lines = [];
  
  lines.push('');
  lines.push('Adoption Analysis (Inferred from Tool Usage)');
  lines.push('');
  lines.push(`Total sessions:        ${stats.totalSessions}`);
  lines.push(`Sessions with devctx:  ${stats.sessionsWithDevctx} (${stats.adoptionRate}%)`);
  lines.push(`Sessions without:      ${stats.sessionsWithoutDevctx} (${100 - stats.adoptionRate}%)`);
  lines.push('');
  
  lines.push('Non-Trivial Tasks Only:');
  lines.push(`Total:                 ${stats.nonTrivial.total}`);
  lines.push(`With devctx:           ${stats.nonTrivial.withDevctx} (${stats.nonTrivial.adoptionRate}%)`);
  lines.push(`Without devctx:        ${stats.nonTrivial.total - stats.nonTrivial.withDevctx} (${100 - stats.nonTrivial.adoptionRate}%)`);
  lines.push('');
  
  lines.push('By Inferred Complexity:');
  for (const [level, data] of Object.entries(stats.byComplexity)) {
    if (data.total === 0) continue;
    lines.push(`- ${level.padEnd(10)} ${data.withDevctx}/${data.total} (${data.adoptionRate}%)`);
  }
  lines.push('');
  
  if (stats.sessionsWithDevctx > 0) {
    lines.push('When devctx IS used:');
    lines.push(`Avg tools/session:     ${stats.avgToolsPerSession}`);
    lines.push(`Avg token savings:     ${stats.avgTokenSavingsWhenUsed.toLocaleString()} tokens`);
    lines.push('');
  }
  
  lines.push('Top Tools Used:');
  const sortedTools = Object.entries(stats.toolUsageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [tool, count] of sortedTools) {
    lines.push(`- ${tool.padEnd(20)} ${count} sessions`);
  }
  lines.push('');
  
  lines.push('Limitations:');
  lines.push('- Complexity inferred from operation count (not actual task complexity)');
  lines.push('- Can only measure when devctx IS used (tool calls visible)');
  lines.push('- Cannot measure feedback shown or forcing prompts (requires agent cooperation)');
  lines.push('- Sessions without devctx may be simple tasks (not adoption failures)');
  lines.push('');
  
  return lines.join('\n');
};
