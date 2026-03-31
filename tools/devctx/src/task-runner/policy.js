const normalizeWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const truncate = (value, maxLength = 140) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return '';
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const buildContinuePrompt = (prompt) => {
  const normalized = normalizeWhitespace(prompt);
  if (!normalized) {
    return 'Continue the active devctx task using the persisted context, follow the next recommended step, and checkpoint the next milestone.';
  }
  return [
    'Continue the active devctx task using the persisted context and align with the next recommended step.',
    '',
    `User request: ${normalized}`,
  ].join('\n');
};

export const RUNNER_COMMANDS = Object.freeze([
  'task',
  'implement',
  'continue',
  'resume',
  'review',
  'debug',
  'refactor',
  'test',
  'doctor',
  'status',
  'checkpoint',
  'cleanup',
]);

const DOCTOR_REQUIRED_STORAGE_ISSUES = new Set([
  'locked',
  'corrupted',
  'unavailable',
  'unknown',
]);

export const WORKFLOW_COMMANDS = new Set([
  'task',
  'implement',
  'continue',
  'resume',
  'review',
  'debug',
  'refactor',
  'test',
]);

export const SPECIALIZED_WORKFLOW_COMMANDS = new Set([
  'implement',
  'review',
  'debug',
  'refactor',
  'test',
]);

export const WORKFLOW_DEFINITIONS = Object.freeze({
  task: {
    label: 'generic task',
    defaultEvent: 'milestone',
    requirePrompt: true,
    workflowIntent: 'implementation',
    policyMode: 'task_guided',
    nextTools: ['smart_context', 'smart_read', 'smart_turn(end)'],
    checkpointStrategy: 'Checkpoint the first meaningful milestone after you validate the working set.',
    preflight: {
      tool: 'smart_context',
      detail: 'minimal',
      include: ['hints', 'graph'],
      maxTokens: 1200,
    },
    buildPrompt: (prompt) => normalizeWhitespace(prompt),
  },
  implement: {
    label: 'implementation task',
    defaultEvent: 'milestone',
    requirePrompt: true,
    workflowIntent: 'implementation',
    policyMode: 'implement_guided',
    nextTools: ['smart_context', 'smart_read(symbol)', 'smart_turn(end)'],
    checkpointStrategy: 'Checkpoint after the first real implementation slice is integrated or behavior changes materially.',
    preflight: {
      tool: 'smart_context',
      detail: 'minimal',
      include: ['hints', 'graph', 'symbolDetail'],
      maxTokens: 1400,
    },
    buildPrompt: (prompt) => {
      const normalized = normalizeWhitespace(prompt);
      return [
        'Implement this change using devctx context first.',
        'Prefer compact dependency-aware context and symbol reads before broad file edits.',
        '',
        `Implementation target: ${normalized}`,
      ].join('\n');
    },
  },
  continue: {
    label: 'continue task',
    defaultEvent: 'milestone',
    requirePrompt: false,
    workflowIntent: 'implementation',
    policyMode: 'continue_guided',
    nextTools: ['smart_turn(start)', 'smart_context', 'smart_turn(end)'],
    checkpointStrategy: 'Continue until you reach the next concrete milestone, then checkpoint it.',
    preflight: {
      tool: 'smart_context',
      detail: 'minimal',
      include: ['hints', 'graph'],
      maxTokens: 1200,
    },
    buildPrompt: buildContinuePrompt,
  },
  resume: {
    label: 'resume task',
    defaultEvent: 'milestone',
    requirePrompt: false,
    workflowIntent: 'implementation',
    policyMode: 'resume_guided',
    nextTools: ['smart_turn(start)', 'smart_context', 'smart_turn(end)'],
    checkpointStrategy: 'Resume the active session and checkpoint the next meaningful slice rather than every minor step.',
    preflight: {
      tool: 'smart_context',
      detail: 'minimal',
      include: ['hints', 'graph'],
      maxTokens: 1200,
    },
    buildPrompt: buildContinuePrompt,
  },
  review: {
    label: 'code review',
    defaultEvent: 'milestone',
    requirePrompt: false,
    workflowIntent: 'explore',
    policyMode: 'review_guided',
    nextTools: ['smart_context', 'smart_read', 'smart_turn(end)'],
    checkpointStrategy: 'Checkpoint only after concrete findings, risk assessment, or a completed review slice.',
    preflight: {
      tool: 'smart_context',
      detail: 'minimal',
      include: ['hints', 'graph'],
      maxTokens: 1200,
    },
    buildPrompt: (prompt) => {
      const normalized = normalizeWhitespace(prompt) || 'Review the relevant diff or touched code path and surface concrete findings first.';
      return [
        'Perform a code review using devctx context first.',
        'Prefer diff-aware context (`smart_context(diff=true)`) and compact reads before full-file reads.',
        '',
        `Review target: ${normalized}`,
      ].join('\n');
    },
  },
  debug: {
    label: 'debugging task',
    defaultEvent: 'milestone',
    requirePrompt: false,
    workflowIntent: 'debug',
    policyMode: 'debug_guided',
    nextTools: ['smart_search(intent=debug)', 'smart_read(symbol)', 'smart_turn(end)'],
    checkpointStrategy: 'Checkpoint after the root cause is isolated or after the fix path is narrowed materially.',
    preflight: {
      tool: 'smart_search',
      intent: 'debug',
    },
    buildPrompt: (prompt) => {
      const normalized = normalizeWhitespace(prompt) || 'Investigate the failing path, identify the root cause, and propose or apply the smallest correct fix.';
      return [
        'Debug this issue using devctx search and compact reads first.',
        'Prefer `smart_search(intent=debug)` and `smart_read(symbol)` before broad full-file reads.',
        '',
        `Debug target: ${normalized}`,
      ].join('\n');
    },
  },
  refactor: {
    label: 'refactor task',
    defaultEvent: 'milestone',
    requirePrompt: false,
    workflowIntent: 'implementation',
    policyMode: 'refactor_guided',
    nextTools: ['smart_context', 'smart_read(symbol)', 'smart_turn(end)'],
    checkpointStrategy: 'Checkpoint each behavior-preserving slice once the dependency edges are revalidated.',
    preflight: {
      tool: 'smart_context',
      detail: 'minimal',
      include: ['hints', 'graph', 'symbolDetail'],
      maxTokens: 1400,
    },
    buildPrompt: (prompt) => {
      const normalized = normalizeWhitespace(prompt) || 'Refactor the target area while preserving behavior and validating the main dependency edges.';
      return [
        'Refactor this area using devctx dependency-aware context first.',
        'Prefer compact context, symbol-level reads, and explicit checkpointing after each meaningful slice.',
        '',
        `Refactor target: ${normalized}`,
      ].join('\n');
    },
  },
  test: {
    label: 'testing task',
    defaultEvent: 'milestone',
    requirePrompt: false,
    workflowIntent: 'tests',
    policyMode: 'test_guided',
    nextTools: ['smart_search(intent=tests)', 'smart_read(symbol)', 'smart_turn(end)'],
    checkpointStrategy: 'Checkpoint after the target tests are added, repaired, or conclusively validated.',
    preflight: {
      tool: 'smart_search',
      intent: 'tests',
    },
    buildPrompt: (prompt) => {
      const normalized = normalizeWhitespace(prompt) || 'Add or repair the relevant test coverage, then verify the main expected path.';
      return [
        'Work in testing mode using devctx context first.',
        'Prefer `smart_search(intent=tests)` and targeted symbol reads before writing or updating tests.',
        '',
        `Testing target: ${normalized}`,
      ].join('\n');
    },
  },
});

export const buildWorkflowPrompt = ({ commandName, prompt }) => {
  const definition = WORKFLOW_DEFINITIONS[commandName];
  if (!definition) {
    throw new Error(`Unsupported workflow command: ${commandName}`);
  }

  const effectivePrompt = definition.buildPrompt(prompt ?? '');
  if (definition.requirePrompt && !normalizeWhitespace(effectivePrompt)) {
    throw new Error(`prompt is required for ${commandName}`);
  }

  return effectivePrompt;
};

export const buildWorkflowPolicyProfile = ({ commandName }) => {
  const definition = WORKFLOW_DEFINITIONS[commandName];
  if (!definition) {
    throw new Error(`Unsupported workflow command: ${commandName}`);
  }

  return {
    commandName,
    label: definition.label,
    workflowIntent: definition.workflowIntent ?? 'implementation',
    policyMode: definition.policyMode ?? 'guided',
    nextTools: [...(definition.nextTools ?? [])],
    checkpointStrategy: definition.checkpointStrategy ?? null,
    preflight: definition.preflight ? { ...definition.preflight } : null,
    specialized: SPECIALIZED_WORKFLOW_COMMANDS.has(commandName),
    defaultEvent: definition.defaultEvent ?? 'milestone',
  };
};

export const evaluateRunnerGate = ({ startResult }) => {
  const blocked = Boolean(startResult?.mutationSafety?.blocked);
  const storageIssue = startResult?.storageHealth?.issue ?? 'ok';
  const storageBlocked = DOCTOR_REQUIRED_STORAGE_ISSUES.has(storageIssue);
  const pathBlocked = startResult?.recommendedPath?.mode === 'blocked_guided';

  const reasons = [];
  if (blocked) {
    reasons.push('mutation_blocked');
  }
  if (storageBlocked) {
    reasons.push(`storage_${storageIssue}`);
  }
  if (pathBlocked) {
    reasons.push('recommended_path_blocked');
  }

  const requiresDoctor = blocked || storageBlocked || pathBlocked;

  return {
    blocked,
    storageIssue,
    pathBlocked,
    requiresDoctor,
    reasons,
  };
};

export const buildBlockedRunnerMessage = ({ commandName, gate, doctorResult }) => {
  const doctorMessage = normalizeWhitespace(doctorResult?.message ?? '');
  if (doctorMessage) {
    return doctorMessage;
  }

  if (gate.storageIssue !== 'ok') {
    return `The ${commandName} workflow is paused until storageHealth.issue=${gate.storageIssue} is remediated.`;
  }

  if (gate.blocked) {
    return `The ${commandName} workflow is paused until mutationSafety.blocked is remediated.`;
  }

  return `The ${commandName} workflow is paused until the operational state is remediated.`;
};

export const buildRunnerBlockedResult = ({
  commandName,
  client,
  prompt,
  startResult,
  gate,
  doctorResult,
  allowDegraded,
  workflowPolicy,
}) => ({
  success: false,
  command: commandName,
  client,
  prompt: truncate(prompt, 240),
  blocked: true,
  usedWrapper: false,
  allowDegraded,
  message: buildBlockedRunnerMessage({ commandName, gate, doctorResult }),
  gate,
  start: startResult,
  doctor: doctorResult,
  sessionId: startResult?.sessionId ?? null,
  recommendedActions: doctorResult?.recommendedActions ?? startResult?.mutationSafety?.recommendedActions ?? [],
  workflowPolicy,
});

export const buildCleanupPlan = ({
  mode = 'compact',
  apply = false,
  retentionDays = 30,
  keepLatestEventsPerSession = 20,
  keepLatestMetrics = 1000,
  vacuum = false,
}) => ({
  mode,
  apply,
  retentionDays,
  keepLatestEventsPerSession,
  keepLatestMetrics,
  vacuum,
});
