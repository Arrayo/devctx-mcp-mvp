/**
 * Decision explainer - tracks and explains why devctx tools were used or not used
 * 
 * Enable with environment variable: DEVCTX_EXPLAIN=true
 * 
 * Provides transparency into agent decision-making:
 * - Why was smart_read used instead of Read?
 * - Why was smart_search chosen?
 * - What are the expected benefits?
 */

const sessionDecisions = {
  decisions: [],
  enabled: false,
};

/**
 * Check if explanations are enabled
 */
export const isExplainEnabled = () => {
  const envValue = process.env.DEVCTX_EXPLAIN?.toLowerCase();
  const enabled = envValue === 'true' || envValue === '1' || envValue === 'yes';
  sessionDecisions.enabled = enabled;
  return enabled;
};

/**
 * Record a decision with explanation
 */
export const recordDecision = ({
  tool,
  action,
  reason,
  alternative = null,
  expectedBenefit = null,
  context = null,
}) => {
  if (!isExplainEnabled()) return;
  
  sessionDecisions.decisions.push({
    tool,
    action,
    reason,
    alternative,
    expectedBenefit,
    context,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Get all decisions for current session
 */
export const getSessionDecisions = () => {
  return sessionDecisions.decisions;
};

/**
 * Format decisions as markdown for display
 */
export const formatDecisionExplanations = () => {
  if (!isExplainEnabled()) return '';
  
  const decisions = getSessionDecisions();
  if (decisions.length === 0) return '';
  
  const lines = [];
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('🤖 **Decision explanations:**');
  lines.push('');
  
  for (const decision of decisions) {
    lines.push(`**${decision.tool}** (${decision.action})`);
    lines.push(`- **Why:** ${decision.reason}`);
    
    if (decision.alternative) {
      lines.push(`- **Instead of:** ${decision.alternative}`);
    }
    
    if (decision.expectedBenefit) {
      lines.push(`- **Expected benefit:** ${decision.expectedBenefit}`);
    }
    
    if (decision.context) {
      lines.push(`- **Context:** ${decision.context}`);
    }
    
    lines.push('');
  }
  
  lines.push('*To disable: `export DEVCTX_EXPLAIN=false`*');
  
  return lines.join('\n');
};

/**
 * Reset session decisions (for testing or manual reset)
 */
export const resetSessionDecisions = () => {
  sessionDecisions.decisions = [];
};

/**
 * Common decision reasons (for consistency)
 */
export const DECISION_REASONS = {
  // smart_read reasons
  LARGE_FILE: 'File is large (>500 lines), outline mode extracts structure only',
  SYMBOL_EXTRACTION: 'Extracting specific symbol, smart_read can locate and extract it efficiently',
  TOKEN_BUDGET: 'Token budget constraint, cascading to more compressed mode',
  MULTIPLE_SYMBOLS: 'Reading multiple symbols, smart_read can batch them',
  
  // smart_search reasons
  MULTIPLE_FILES: 'Query spans 50+ files, smart_search ranks by relevance',
  INTENT_AWARE: 'Intent-aware search prioritizes relevant results (debug/implementation/tests)',
  INDEX_BOOST: 'Symbol index available, boosting relevant matches',
  PATTERN_SEARCH: 'Complex pattern search, smart_search handles regex efficiently',
  
  // smart_context reasons
  TASK_CONTEXT: 'Building complete context for task, smart_context orchestrates multiple reads',
  RELATED_FILES: 'Need related files (callers, tests, types), smart_context finds them',
  ONE_CALL: 'Single call to get all context, more efficient than multiple reads',
  DIFF_ANALYSIS: 'Analyzing git diff, smart_context expands changed symbols',
  
  // smart_shell reasons
  COMMAND_OUTPUT: 'Command output needs compression (git log, npm test, etc.)',
  RELEVANT_LINES: 'Extracting relevant lines from command output',
  SAFE_EXECUTION: 'Using allowlist-validated command execution',
  
  // smart_summary reasons
  CHECKPOINT: 'Saving task checkpoint for session recovery',
  RESUME: 'Recovering previous task context',
  PERSISTENCE: 'Maintaining task state across agent restarts',
  
  // Native tool reasons
  SIMPLE_TASK: 'Task is simple, native tool is more direct',
  ALREADY_CACHED: 'Content already in context, no need for compression',
  SINGLE_LINE: 'Reading single line, native Read is sufficient',
  SMALL_FILE: 'File is small (<100 lines), compression not needed',
  NO_INDEX: 'No symbol index available, native search is equivalent',
};

/**
 * Common expected benefits (for consistency)
 */
export const EXPECTED_BENEFITS = {
  TOKEN_SAVINGS: (tokens) => `~${formatTokens(tokens)} saved`,
  FASTER_RESPONSE: 'Faster response due to less data to process',
  BETTER_RANKING: 'Better result ranking, relevant items first',
  COMPLETE_CONTEXT: 'Complete context in single call',
  SESSION_RECOVERY: 'Can recover task state if agent restarts',
  FOCUSED_RESULTS: 'Focused on relevant code only',
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
