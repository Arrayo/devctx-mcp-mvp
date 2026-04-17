const sessionActivity = {
  devctxOperations: 0,
  totalOperations: 0,
  lastDevctxCall: 0,
  sessionStart: Date.now(),
  enabled: true,
  warnings: [],
};

const DEVCTX_TOOLS = new Set([
  'smart_read',
  'smart_search',
  'smart_context',
  'smart_shell',
  'smart_summary',
  'smart_turn',
  'smart_read_batch',
  'build_index',
]);

export const isMissedDetectionEnabled = () => {
  const envValue = process.env.DEVCTX_DETECT_MISSED?.toLowerCase();
  
  if (envValue === 'true' || envValue === '1' || envValue === 'yes') {
    sessionActivity.enabled = true;
    return true;
  }
  
  if (envValue === 'false' || envValue === '0' || envValue === 'no') {
    sessionActivity.enabled = false;
    return false;
  }
  
  sessionActivity.enabled = true;
  return true;
};

export const recordDevctxOperation = () => {
  if (!isMissedDetectionEnabled()) return;
  
  sessionActivity.devctxOperations += 1;
  sessionActivity.totalOperations += 1;
  sessionActivity.lastDevctxCall = Date.now();
};

const estimateTotalOperations = () => {
  const now = Date.now();
  const sessionDuration = now - sessionActivity.sessionStart;
  const timeSinceLastDevctx = now - sessionActivity.lastDevctxCall;
  
  if (timeSinceLastDevctx < 2 * 60 * 1000) {
    return sessionActivity.totalOperations;
  }
  
  const estimatedNativeOps = Math.floor(timeSinceLastDevctx / 10000);
  return sessionActivity.totalOperations + estimatedNativeOps;
};

export const analyzeMissedOpportunities = () => {
  if (!isMissedDetectionEnabled()) return null;
  
  const now = Date.now();
  const sessionDuration = now - sessionActivity.sessionStart;
  const timeSinceLastDevctx = now - sessionActivity.lastDevctxCall;
  const estimatedTotal = estimateTotalOperations();
  const opportunities = [];
  
  if (sessionDuration > 5 * 60 * 1000 && sessionActivity.devctxOperations === 0) {
    opportunities.push({
      type: 'no_devctx_usage',
      severity: 'high',
      reason: 'Session active for >5 minutes with 0 devctx calls. Agent may not be using devctx.',
      suggestion: 'Use forcing prompt or check if MCP is active',
      estimatedSavings: estimatedTotal * 10000,
    });
  }
  
  const devctxRatio = estimatedTotal > 0 ? sessionActivity.devctxOperations / estimatedTotal : 0;
  if (estimatedTotal >= 10 && devctxRatio < 0.3) {
    opportunities.push({
      type: 'low_devctx_adoption',
      severity: 'medium',
      reason: `Low devctx adoption: ${sessionActivity.devctxOperations}/${estimatedTotal} operations (${Math.round(devctxRatio * 100)}%). Target: >50%.`,
      suggestion: 'Agent may be using native tools. Consider forcing prompt.',
      estimatedSavings: (estimatedTotal - sessionActivity.devctxOperations) * 8000,
    });
  }
  
  if (sessionActivity.devctxOperations > 0 && timeSinceLastDevctx > 3 * 60 * 1000) {
    const minutesSince = Math.round(timeSinceLastDevctx / 60000);
    opportunities.push({
      type: 'devctx_usage_dropped',
      severity: 'medium',
      reason: `No devctx calls for ${minutesSince} minutes. Agent may have switched to native tools.`,
      suggestion: 'Re-apply forcing prompt if task is still complex',
      estimatedSavings: Math.floor(timeSinceLastDevctx / 10000) * 5000,
    });
  }
  
  if (sessionDuration < 60 * 1000 && opportunities.length === 0) {
    return {
      opportunities: [],
      message: 'Session too short to analyze (<1 minute)',
      devctxOperations: sessionActivity.devctxOperations,
      estimatedTotal,
    };
  }
  
  return {
    opportunities,
    devctxOperations: sessionActivity.devctxOperations,
    estimatedTotal,
    devctxRatio: Math.round(devctxRatio * 100),
    sessionDuration: Math.round(sessionDuration / 1000),
    totalEstimatedSavings: opportunities.reduce((sum, opp) => sum + (opp.estimatedSavings || 0), 0),
  };
};

export const formatMissedOpportunities = () => {
  if (!isMissedDetectionEnabled()) return '';
  
  const analysis = analyzeMissedOpportunities();
  if (!analysis) return '';
  
  if (analysis.message) {
    return '';
  }
  
  if (analysis.opportunities.length === 0 && analysis.devctxOperations > 0) {
    return `\n\n✅ **devctx adoption: ${analysis.devctxRatio}%** (${analysis.devctxOperations}/${analysis.estimatedTotal} operations)\n`;
  }
  
  if (analysis.opportunities.length === 0) {
    return '';
  }
  
  const lines = [];
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('⚠️ **Missed devctx opportunities detected:**');
  lines.push('');
  
  lines.push(`**Session stats:**`);
  lines.push(`- Duration: ${analysis.sessionDuration}s`);
  lines.push(`- devctx operations: ${analysis.devctxOperations}`);
  lines.push(`- Estimated total operations: ${analysis.estimatedTotal}`);
  lines.push(`- devctx adoption: ${analysis.devctxRatio}%`);
  lines.push('');
  
  for (const opp of analysis.opportunities) {
    const severityIcon = opp.severity === 'high' ? '🔴' : '🟡';
    lines.push(`${severityIcon} **${opp.type.replace(/_/g, ' ')}**`);
    lines.push(`- **Issue:** ${opp.reason}`);
    lines.push(`- **Suggestion:** ${opp.suggestion}`);
    
    if (opp.estimatedSavings) {
      lines.push(`- **Potential savings:** ~${formatTokens(opp.estimatedSavings)}`);
    }
    
    lines.push('');
  }
  
  if (analysis.totalEstimatedSavings > 0) {
    lines.push(`**Total potential savings:** ~${formatTokens(analysis.totalEstimatedSavings)}`);
    lines.push('');
  }
  
  lines.push('**How to fix:**');
  lines.push('1. Use forcing prompt: `Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)`');
  lines.push('2. Check if index is built: `ls .devctx/index.json`');
  lines.push('3. Verify MCP is active in Cursor settings');
  lines.push('');
  lines.push('*To disable: `export DEVCTX_DETECT_MISSED=false`*');
  
  return lines.join('\n');
};

export const getSessionActivity = () => {
  return {
    devctxOperations: sessionActivity.devctxOperations,
    totalOperations: sessionActivity.totalOperations,
    estimatedTotal: estimateTotalOperations(),
    sessionDuration: Date.now() - sessionActivity.sessionStart,
    timeSinceLastDevctx: Date.now() - sessionActivity.lastDevctxCall,
  };
};

export const resetSessionActivity = () => {
  sessionActivity.devctxOperations = 0;
  sessionActivity.totalOperations = 0;
  sessionActivity.lastDevctxCall = 0;
  sessionActivity.sessionStart = Date.now();
  sessionActivity.warnings = [];
  sessionActivity.enabled = true;
};

export const __testing__ = {
  setSessionStart: (timestamp) => {
    sessionActivity.sessionStart = timestamp;
  },
  setLastDevctxCall: (timestamp) => {
    sessionActivity.lastDevctxCall = timestamp;
  },
  setTotalOperations: (count) => {
    sessionActivity.totalOperations = count;
  },
  getSessionActivity: () => sessionActivity,
};

const formatTokens = (tokens) => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tokens`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K tokens`;
  }
  return `${tokens} tokens`;
};

