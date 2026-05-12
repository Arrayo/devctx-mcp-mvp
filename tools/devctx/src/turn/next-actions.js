const INTENT_HINTS = [
  { intent: 'debug',          re: /\b(?:bug|fail\w*|error|broken|crash|stack[- ]?trace|regression|fix\w*)\b/i },
  { intent: 'tests',          re: /\b(?:tests?|specs?|coverage|TDD|unit|integration)\b/i },
  { intent: 'review',         re: /\b(?:review|audit|preflight|merge|PR|pull[- ]?request)\b/i },
  { intent: 'refactor',       re: /\b(?:refactor|rename|extract|migrate|split|consolidat)\w*/i },
  { intent: 'implementation', re: /\b(?:implement\w*|add|build|create|introduce|support)\b/i },
  { intent: 'docs',           re: /\b(?:docs?|readme|changelog|adr|architecture)\b/i },
  { intent: 'explore',        re: /\b(?:understand|how does|trace|map|explore|investigate)\b/i },
];

const inferIntentFromPrompt = (prompt) => {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return 'explore';
  for (const { intent, re } of INTENT_HINTS) {
    if (re.test(prompt)) return intent;
  }
  return 'explore';
};

const truncatePrompt = (prompt, limit = 80) => {
  if (typeof prompt !== 'string') return '';
  const clean = prompt.trim().replace(/\s+/g, ' ');
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
};

const action = (tool, args, why, when) => ({ tool, args, why, ...(when ? { when } : {}) });

export const deriveStartActions = ({ prompt, intent, mode, refreshedContext, summaryResult } = {}) => {
  const finalIntent = intent ?? inferIntentFromPrompt(prompt);
  const shortPrompt = truncatePrompt(prompt);

  if (mode === 'blocked_guided') {
    return [
      action('repo_safety', {}, 'Surface what is blocking persistence and follow recommendedActions', 'first'),
      action('smart_search', { query: shortPrompt || '<refine query>', intent: finalIntent }, 'Read-only exploration is allowed while repo safety is unfixed'),
      action('smart_turn', { phase: 'end', event: 'blocker' }, 'Record the blocker explicitly so it propagates to the next agent', 'after-fix-or-blocker'),
    ];
  }

  if (mode === 'guided_refresh' && refreshedContext?.topFiles?.length) {
    const top = refreshedContext.topFiles
      .slice(0, 3)
      .map((f) => (typeof f === 'string' ? f : f?.file ?? f?.path ?? null))
      .filter(Boolean);
    return [
      action('smart_read', { mode: 'outline', paths: top }, 'Start from refreshed top files in outline mode (cheapest) before any full reads', 'first'),
      action('smart_read', { mode: 'symbol', paths: top.slice(0, 1) }, 'Drill into a specific symbol once you have the structure', 'on-demand'),
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'Checkpoint on first meaningful progress'),
    ];
  }

  const actions = [];

  if (summaryResult?.ambiguous && summaryResult?.recommendedSessionId) {
    actions.push(action(
      'smart_turn',
      { phase: 'start', sessionId: summaryResult.recommendedSessionId, ensureSession: true },
      'Reuse the recommended persisted session explicitly to disambiguate continuity',
      'first',
    ));
  }

  if (finalIntent === 'debug') {
    actions.push(
      action('smart_test', { action: 'last_failure' }, 'Recover the last red run if one exists — fastest path to the root cause', 'first'),
      action('smart_context', { task: shortPrompt || '<derived from prompt>', intent: 'debug' }, 'Curated context with affected files + tests + callers'),
      action('smart_read', { mode: 'outline' }, 'Outline mode before full reads on suspect files'),
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'Checkpoint when root cause or fix is identified'),
    );
  } else if (finalIntent === 'tests') {
    actions.push(
      action('smart_test', { action: 'affected' }, 'List tests impacted by the current diff via the import graph', 'first'),
      action('smart_context', { task: shortPrompt, intent: 'tests' }, 'Pull the related sources + tests together'),
      action('smart_test', { action: 'run', runner: 'node-test' }, 'Run the affected tests once you have a candidate fix', 'on-demand'),
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'Checkpoint after green'),
    );
  } else if (finalIntent === 'review') {
    actions.push(
      action('smart_review', { ref: 'HEAD' }, 'One-shot diff + heuristics + graph impact + coverage gap', 'first'),
      action('smart_test', { action: 'affected' }, 'Use the coverageGap hint to verify which tests must re-run'),
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'Checkpoint after review verdict'),
    );
  } else if (finalIntent === 'refactor' || finalIntent === 'implementation') {
    actions.push(
      action('smart_context', { task: shortPrompt, intent: finalIntent }, 'Curated context with graph expansion — replaces multiple search/read calls', 'first'),
      action('smart_read', { mode: 'outline' }, 'Outline mode before reading whole files'),
      action('smart_read', { mode: 'explain', symbol: '<key symbol>' }, 'Offline structural explanation for any unfamiliar symbol', 'on-demand'),
      action('smart_test', { action: 'affected' }, 'Identify tests to re-run as you change code'),
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'Checkpoint on first meaningful progress'),
    );
  } else if (finalIntent === 'docs') {
    actions.push(
      action('smart_search', { query: shortPrompt || 'architecture decisions', kinds: ['adr', 'adr-section'] }, 'Surface ADRs / spec sections relevant to the task', 'first'),
      action('smart_read', { mode: 'outline' }, 'Outline before opening full docs'),
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'Checkpoint on doc/code alignment'),
    );
  } else if (finalIntent === 'explore') {
    actions.push(
      action('smart_context', { task: shortPrompt || '<derived from prompt>', intent: 'explore' }, 'Curated multi-file context is the cheapest entry point', 'first'),
      action('smart_read', { mode: 'outline' }, 'Outline mode for any unfamiliar file'),
      action('smart_context', { paths: { from: '<entry symbol>', to: '<target symbol>' } }, 'Use paths mode to traverse the import graph when tracing how X reaches Y', 'on-demand'),
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'Checkpoint on first concrete finding'),
    );
  } else {
    actions.push(
      action('smart_search', { query: shortPrompt || '<refine query>' }, 'Stay lightweight: only escalate to smart_context if the task grows'),
      action('smart_read', { mode: 'outline' }, 'Outline mode before reading whole files'),
    );
  }

  return actions;
};

export const deriveEndActions = ({ event, checkpoint, mutationSafety, workflow } = {}) => {
  if (mutationSafety?.blocked) {
    return [
      action('repo_safety', {}, 'Fix repo safety before expecting persistence', 'first'),
      action('smart_turn', { phase: 'end', event: 'blocker' }, 'Record blocker so the next agent picks it up'),
    ];
  }

  if (checkpoint?.skipped) {
    return [
      action('smart_turn', { phase: 'end', event: 'milestone' }, 'No durable checkpoint was written; call again with a concrete milestone', 'when-progress'),
    ];
  }

  if (workflow?.ended) {
    return [
      action('smart_turn', { phase: 'start', ensureSession: true }, 'Workflow closed; start a fresh turn for the next task boundary', 'next-task'),
    ];
  }

  return [
    action('smart_turn', { phase: 'start', ensureSession: true }, 'On the next substantial prompt, restart with smart_turn(start) to reuse this checkpoint', 'next-prompt'),
    action('smart_review', { ref: 'HEAD' }, 'If progress changed code, run a preflight review before handing off', 'on-handoff'),
  ];
};

export const _internal = { inferIntentFromPrompt, INTENT_HINTS };
