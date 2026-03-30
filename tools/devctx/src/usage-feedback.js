/**
 * Usage feedback system - tracks devctx tool usage in current session
 * and provides visible feedback to users about what tools were used and tokens saved.
 * 
 * Enable with environment variable: DEVCTX_SHOW_USAGE=true
 * 
 * Auto-enabled for first 10 tool calls (onboarding mode), then auto-disables.
 * User can explicitly enable/disable at any time.
 */

const sessionUsage = {
  tools: new Map(), // toolName -> { count, savedTokens }
  totalSavedTokens: 0,
  enabled: false,
  totalToolCalls: 0,
  onboardingMode: true,
  ONBOARDING_THRESHOLD: 10, // Auto-disable after 10 tool calls
};

/**
 * Check if usage feedback is enabled
 * 
 * Priority:
 * 1. Explicit env var (DEVCTX_SHOW_USAGE=true/false)
 * 2. Onboarding mode (first 10 tool calls)
 * 3. Default: disabled
 */
export const isFeedbackEnabled = () => {
  const envValue = process.env.DEVCTX_SHOW_USAGE?.toLowerCase();
  
  // Explicit enable
  if (envValue === 'true' || envValue === '1' || envValue === 'yes') {
    sessionUsage.enabled = true;
    sessionUsage.onboardingMode = false;
    return true;
  }
  
  // Explicit disable
  if (envValue === 'false' || envValue === '0' || envValue === 'no') {
    sessionUsage.enabled = false;
    sessionUsage.onboardingMode = false;
    return false;
  }
  
  // Onboarding mode: auto-enable for first N tool calls
  if (sessionUsage.onboardingMode && sessionUsage.totalToolCalls < sessionUsage.ONBOARDING_THRESHOLD) {
    sessionUsage.enabled = true;
    return true;
  }
  
  // After onboarding threshold, auto-disable
  if (sessionUsage.onboardingMode && sessionUsage.totalToolCalls >= sessionUsage.ONBOARDING_THRESHOLD) {
    sessionUsage.enabled = false;
    sessionUsage.onboardingMode = false;
  }
  
  return sessionUsage.enabled;
};

/**
 * Record tool usage for feedback
 */
export const recordToolUsage = ({ tool, savedTokens = 0, target = null }) => {
  // Increment total tool calls (for onboarding mode)
  sessionUsage.totalToolCalls += 1;
  
  if (!isFeedbackEnabled()) return;
  
  const current = sessionUsage.tools.get(tool) || { count: 0, savedTokens: 0, targets: [] };
  current.count += 1;
  current.savedTokens += savedTokens;
  if (target) current.targets.push(target);
  
  sessionUsage.tools.set(tool, current);
  sessionUsage.totalSavedTokens += savedTokens;
};

/**
 * Get current session usage stats
 */
export const getSessionUsage = () => {
  return {
    tools: Array.from(sessionUsage.tools.entries()).map(([tool, stats]) => ({
      tool,
      count: stats.count,
      savedTokens: stats.savedTokens,
      targets: stats.targets.slice(-3), // Last 3 targets only
    })),
    totalSavedTokens: sessionUsage.totalSavedTokens,
  };
};

/**
 * Format usage feedback as markdown
 */
export const formatUsageFeedback = () => {
  if (!isFeedbackEnabled()) return '';
  
  const usage = getSessionUsage();
  if (usage.tools.length === 0) return '';
  
  const lines = [];
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('📊 **devctx usage this session:**');
  
  // Sort by count descending
  const sorted = usage.tools.sort((a, b) => b.count - a.count);
  
  for (const { tool, count, savedTokens, targets } of sorted) {
    const countStr = count === 1 ? '1 call' : `${count} calls`;
    const tokensStr = savedTokens > 0 ? ` | ~${formatTokens(savedTokens)} saved` : '';
    
    if (targets.length > 0) {
      const targetsPreview = targets.length === 1 
        ? ` (${truncateTarget(targets[0])})`
        : ` (${targets.length} files)`;
      lines.push(`- **${tool}**: ${countStr}${tokensStr}${targetsPreview}`);
    } else {
      lines.push(`- **${tool}**: ${countStr}${tokensStr}`);
    }
  }
  
  if (usage.totalSavedTokens > 0) {
    lines.push('');
    lines.push(`**Total saved:** ~${formatTokens(usage.totalSavedTokens)}`);
  }
  
  lines.push('');
  
  // Show onboarding message if in onboarding mode
  if (sessionUsage.onboardingMode && sessionUsage.totalToolCalls < sessionUsage.ONBOARDING_THRESHOLD) {
    const remaining = sessionUsage.ONBOARDING_THRESHOLD - sessionUsage.totalToolCalls;
    lines.push(`*Onboarding mode: showing for ${remaining} more tool calls. To keep: \`export DEVCTX_SHOW_USAGE=true\`*`);
  } else {
    lines.push('*To disable this message: `export DEVCTX_SHOW_USAGE=false`*');
  }
  
  return lines.join('\n');
};

/**
 * Reset session usage (for testing or manual reset)
 */
export const resetSessionUsage = () => {
  sessionUsage.tools.clear();
  sessionUsage.totalSavedTokens = 0;
  sessionUsage.totalToolCalls = 0;
  sessionUsage.onboardingMode = true;
};

/**
 * Format token count for display
 */
const formatTokens = (tokens) => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tokens`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K tokens`;
  }
  return `${tokens} tokens`;
};

/**
 * Truncate target path for display
 */
const truncateTarget = (target) => {
  if (!target) return '';
  if (target.length <= 40) return target;
  
  // Try to show filename
  const parts = target.split('/');
  const filename = parts[parts.length - 1];
  if (filename.length <= 40) return `.../${filename}`;
  
  return target.slice(0, 37) + '...';
};
