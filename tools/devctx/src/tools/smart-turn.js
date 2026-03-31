import { buildIndexIncremental, persistIndex } from '../index.js';
import { projectRoot } from '../utils/runtime-config.js';
import {
  autoTrackWorkflow,
  endWorkflow,
  getActiveWorkflowForSession,
  isWorkflowTrackingEnabled,
} from '../workflow-tracker.js';
import { smartContext } from './smart-context.js';
import { smartMetrics } from './smart-metrics.js';
import { smartSummary } from './smart-summary.js';

const DEFAULT_START_MAX_TOKENS = 400;
const DEFAULT_END_MAX_TOKENS = 500;
const DEFAULT_END_EVENT = 'milestone';
const DEFAULT_REFRESH_CONTEXT_MAX_TOKENS = 1400;
const MAX_PROMPT_PREVIEW = 160;
const REFRESHED_CONTEXT_FILE_LIMIT = 3;
const SAFE_CONTINUITY_STATES = new Set(['aligned', 'resume']);
const WORKFLOW_END_EVENTS = new Set(['milestone', 'task_complete', 'session_end', 'blocker']);
const INDEX_REFRESH_STATES = new Set(['stale', 'unavailable']);
const HARD_BLOCK_REASONS = Object.freeze([
  ['tracked', 'isTracked'],
  ['staged', 'isStaged'],
]);
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'where',
  'what', 'have', 'will', 'your', 'about', 'there', 'their', 'then', 'than',
  'want', 'need', 'make', 'does', 'just', 'each', 'also', 'todo', 'done',
  'pero', 'para', 'como', 'esta', 'esto', 'cuando', 'donde', 'quiero', 'hacer',
  'sobre', 'porque', 'tengo', 'vamos', 'luego', 'ahora', 'puede', 'puedo',
]);

const normalizeWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const truncate = (value, maxLength = MAX_PROMPT_PREVIEW) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return '';
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const extractTerms = (value) => {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return [];
  }

  return [...new Set(
    normalized
      .split(/[^a-z0-9_.-]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
  )];
};

const collectSummaryStrings = (value, sink = []) => {
  if (typeof value === 'string') {
    if (value.trim()) {
      sink.push(value);
    }
    return sink;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSummaryStrings(item, sink));
    return sink;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectSummaryStrings(item, sink));
  }

  return sink;
};

const summarizeMetrics = (metrics) => {
  if (!metrics?.summary) {
    return null;
  }

  return {
    count: metrics.summary.count,
    savedTokens: metrics.summary.savedTokens,
    savingsPct: metrics.summary.savingsPct,
    netSavedTokens: metrics.summary.netSavedTokens,
    netSavingsPct: metrics.summary.netSavingsPct,
    overheadTokens: metrics.summary.overheadTokens,
    topTools: metrics.summary.tools.slice(0, 3).map((tool) => ({
      tool: tool.tool,
      savedTokens: tool.savedTokens,
      netSavedTokens: tool.netSavedTokens,
      count: tool.count,
    })),
  };
};

const buildMutationSafety = (repoSafety) => {
  if (!repoSafety) {
    return null;
  }

  const blockedBy = HARD_BLOCK_REASONS
    .filter(([, field]) => repoSafety[field])
    .map(([reason]) => reason);
  const blocked = blockedBy.length > 0;
  const stateDbPath = repoSafety.stateDbPath ?? '.devctx/state.sqlite';

  return {
    blocked,
    blockedBy,
    stateDbPath,
    recommendedActions: repoSafety.recommendedActions ?? [],
    message: blocked
      ? `Project-local context writes are blocked until git hygiene is fixed for ${stateDbPath}.`
      : `Project-local context writes are allowed for ${stateDbPath}.`,
  };
};

const classifyContinuity = ({ prompt, summaryResult }) => {
  if (!summaryResult?.found) {
    if (summaryResult?.ambiguous) {
      return {
        state: 'ambiguous_resume',
        shouldReuseContext: false,
        reason: 'Multiple recent sessions matched and need an explicit choice.',
      };
    }

    return {
      state: 'cold_start',
      shouldReuseContext: false,
      reason: 'No persisted session was available for reuse.',
    };
  }

  const promptTerms = extractTerms(prompt);
  if (promptTerms.length === 0) {
    return {
      state: 'resume',
      shouldReuseContext: true,
      reason: 'A persisted session was found and no prompt terms were available for comparison.',
      sharedTerms: [],
      promptTermCount: 0,
      summaryTermCount: 0,
      matchScore: 1,
    };
  }

  const summaryTerms = extractTerms(collectSummaryStrings(summaryResult.summary).join(' '));
  const sharedTerms = promptTerms.filter((term) => summaryTerms.includes(term));
  const matchScore = promptTerms.length === 0
    ? 0
    : Number((sharedTerms.length / promptTerms.length).toFixed(2));

  if (sharedTerms.length >= 3 || matchScore >= 0.35) {
    return {
      state: 'aligned',
      shouldReuseContext: true,
      reason: 'Prompt terms align with persisted task context.',
      sharedTerms: sharedTerms.slice(0, 8),
      promptTermCount: promptTerms.length,
      summaryTermCount: summaryTerms.length,
      matchScore,
    };
  }

  if (sharedTerms.length >= 1 || matchScore >= 0.15) {
    return {
      state: 'possible_shift',
      shouldReuseContext: true,
      reason: 'Prompt partially overlaps the persisted context; review before continuing.',
      sharedTerms: sharedTerms.slice(0, 8),
      promptTermCount: promptTerms.length,
      summaryTermCount: summaryTerms.length,
      matchScore,
    };
  }

  return {
    state: 'context_mismatch',
    shouldReuseContext: false,
    reason: 'Prompt terms do not align with the persisted session summary.',
    sharedTerms: [],
    promptTermCount: promptTerms.length,
    summaryTermCount: summaryTerms.length,
    matchScore,
  };
};

const hasMeaningfulPrompt = (prompt) => {
  const normalized = normalizeWhitespace(prompt);
  return normalized.length >= 20 && extractTerms(normalized).length >= 4;
};

const buildAutoCreateUpdate = (prompt) => ({
  goal: truncate(prompt, 120),
  status: 'planning',
  currentFocus: truncate(prompt, 160),
  pinnedContext: [truncate(prompt, 160)],
  nextStep: 'Inspect relevant code, confirm the task boundaries, and checkpoint the first milestone.',
});

const summarizeRefreshedContext = (result, { indexRefreshed = false } = {}) => {
  if (!result?.success) {
    return null;
  }

  return {
    indexFreshness: result.indexFreshness ?? 'unavailable',
    indexRefreshed,
    graphCoverage: result.graphCoverage ?? result.confidence?.graphCoverage ?? null,
    hints: Array.isArray(result.hints) ? result.hints.slice(0, 2) : [],
    topFiles: Array.isArray(result.context)
      ? result.context.slice(0, REFRESHED_CONTEXT_FILE_LIMIT).map((item) => ({
          file: item.file,
          role: item.role,
          readMode: item.readMode ?? null,
          reasonIncluded: item.reasonIncluded ?? null,
          symbols: Array.isArray(item.symbols) ? item.symbols.slice(0, 3) : [],
        }))
      : [],
  };
};

const refreshPromptContext = async (prompt) => {
  if (!hasMeaningfulPrompt(prompt)) {
    return null;
  }

  const buildContext = async () => smartContext({
    task: prompt,
    detail: 'minimal',
    include: ['hints'],
    maxTokens: DEFAULT_REFRESH_CONTEXT_MAX_TOKENS,
  });

  let result = await buildContext();
  let indexRefreshed = false;

  if (INDEX_REFRESH_STATES.has(result?.indexFreshness ?? '')) {
    try {
      const { index } = buildIndexIncremental(projectRoot);
      await persistIndex(index, projectRoot);
      indexRefreshed = true;
      result = await buildContext();
    } catch {
      // best-effort refresh only
    }
  }

  return summarizeRefreshedContext(result, { indexRefreshed });
};

const shouldIsolateSession = ({ sessionId, ensureSession, prompt, continuity }) =>
  !sessionId
  && ensureSession
  && hasMeaningfulPrompt(prompt)
  && continuity
  && !SAFE_CONTINUITY_STATES.has(continuity.state ?? '');

const shouldRefreshContext = ({ prompt, ensureSession, summaryResult, continuity, isolatedSession, autoCreated }) =>
  hasMeaningfulPrompt(prompt)
  && (
    isolatedSession
    || autoCreated
    || (ensureSession && (summaryResult?.ambiguous || !summaryResult?.found))
    || ['possible_shift', 'context_mismatch'].includes(continuity?.state)
  );

const startTurn = async ({
  sessionId,
  prompt,
  maxTokens = DEFAULT_START_MAX_TOKENS,
  ensureSession = false,
  includeMetrics = false,
  metricsWindow = '7d',
  latestMetrics = 5,
} = {}) => {
  let summaryResult = await smartSummary({
    action: 'get',
    sessionId,
    maxTokens,
  });

  let autoCreated = false;
  let isolatedSession = false;
  let previousSessionId = null;
  if (!summaryResult.found && !summaryResult.ambiguous && ensureSession && hasMeaningfulPrompt(prompt)) {
    const created = await smartSummary({
      action: 'update',
      update: buildAutoCreateUpdate(prompt),
      maxTokens,
    });
    autoCreated = !created.blocked;
    if (autoCreated) {
      summaryResult = await smartSummary({
        action: 'get',
        sessionId: created.sessionId,
        maxTokens,
      });
    }
  }

  let continuity = classifyContinuity({ prompt, summaryResult });

  if (summaryResult.found && shouldIsolateSession({ sessionId, ensureSession, prompt, continuity })) {
    const created = await smartSummary({
      action: 'update',
      update: buildAutoCreateUpdate(prompt),
      maxTokens,
    });

    if (!created.blocked) {
      isolatedSession = true;
      previousSessionId = summaryResult.sessionId ?? null;
      summaryResult = await smartSummary({
        action: 'get',
        sessionId: created.sessionId,
        maxTokens,
      });
      continuity = classifyContinuity({ prompt, summaryResult });
    }
  }

  const effectiveSessionId = summaryResult.sessionId ?? sessionId ?? summaryResult.recommendedSessionId ?? null;
  const mutationSafety = buildMutationSafety(summaryResult.repoSafety);
  const workflowBlocked = Boolean(isWorkflowTrackingEnabled() && mutationSafety?.blocked);
  const refreshedContext = shouldRefreshContext({
    prompt,
    ensureSession,
    summaryResult,
    continuity,
    isolatedSession,
    autoCreated,
  })
    ? await refreshPromptContext(prompt)
    : null;

  let workflow = null;
  if (workflowBlocked) {
    workflow = { enabled: true, blocked: true, workflowId: null, workflowType: null, autoTracked: false };
  } else if (effectiveSessionId && isWorkflowTrackingEnabled()) {
    const workflowId = await autoTrackWorkflow(
      effectiveSessionId,
      summaryResult.summary?.goal ?? prompt ?? '',
    );
    if (workflowId) {
      const activeWorkflow = await getActiveWorkflowForSession(effectiveSessionId);
      workflow = activeWorkflow
        ? {
            enabled: true,
            workflowId: activeWorkflow.workflow_id,
            workflowType: activeWorkflow.workflow_type,
            autoTracked: true,
          }
        : {
            enabled: true,
            workflowId,
            workflowType: null,
            autoTracked: true,
          };
    } else {
      workflow = { enabled: true, workflowId: null, workflowType: null, autoTracked: false };
    }
  }

  const metrics = includeMetrics
    ? await smartMetrics({
        window: metricsWindow,
        latest: latestMetrics,
        sessionId: effectiveSessionId || 'active',
      })
    : null;


  return {
    phase: 'start',
    promptPreview: truncate(prompt, MAX_PROMPT_PREVIEW),
    sessionId: effectiveSessionId,
    found: summaryResult.found ?? false,
    autoCreated,
    isolatedSession,
    ...(previousSessionId ? { previousSessionId } : {}),
    continuity,
    summary: summaryResult.summary ?? null,
    ...(refreshedContext ? { refreshedContext } : {}),
    ...(workflow ? { workflow } : {}),
    ...(mutationSafety ? { mutationSafety } : {}),
    repoSafety: summaryResult.repoSafety ?? metrics?.repoSafety ?? null,
    sideEffectsSuppressed: Boolean(summaryResult.sideEffectsSuppressed ?? metrics?.sideEffectsSuppressed),
    ...(summaryResult.candidates ? { candidates: summaryResult.candidates } : {}),
    ...(summaryResult.recommendedSessionId ? { recommendedSessionId: summaryResult.recommendedSessionId } : {}),
    ...(metrics ? { metrics: summarizeMetrics(metrics) } : {}),
    message: mutationSafety?.blocked
      ? mutationSafety.message
      : summaryResult.found
        ? continuity.reason
        : autoCreated
          ? 'Created a new persisted session for this task prompt.'
          : continuity.reason,
  };
};

const endTurn = async ({
  sessionId,
  event = DEFAULT_END_EVENT,
  update = {},
  force = false,
  maxTokens = DEFAULT_END_MAX_TOKENS,
  includeMetrics = false,
  metricsWindow = '7d',
  latestMetrics = 5,
} = {}) => {
  const checkpoint = await smartSummary({
    action: 'checkpoint',
    sessionId,
    event,
    update,
    force,
    maxTokens,
  });

  const effectiveSessionId = checkpoint.sessionId ?? sessionId ?? 'active';
  const mutationSafety = buildMutationSafety(checkpoint.repoSafety);
  const workflowBlocked = Boolean(isWorkflowTrackingEnabled() && mutationSafety?.blocked);
  let workflow = null;
  if (workflowBlocked) {
    workflow = { enabled: true, blocked: true, workflowId: null, workflowType: null, ended: false };
  } else if (
    checkpoint.sessionId
    && !checkpoint.skipped
    && WORKFLOW_END_EVENTS.has(event)
    && isWorkflowTrackingEnabled()
  ) {
    const activeWorkflow = await getActiveWorkflowForSession(checkpoint.sessionId);
    if (activeWorkflow?.workflow_id) {
      const endedWorkflow = await endWorkflow(activeWorkflow.workflow_id);
      workflow = endedWorkflow
        ? {
            enabled: true,
            workflowId: endedWorkflow.workflowId,
            workflowType: endedWorkflow.workflowType,
            ended: true,
            summary: endedWorkflow,
          }
        : {
            enabled: true,
            workflowId: activeWorkflow.workflow_id,
            workflowType: activeWorkflow.workflow_type,
            ended: false,
          };
    } else {
      workflow = { enabled: true, workflowId: null, workflowType: null, ended: false };
    }
  }

  const metrics = includeMetrics
    ? await smartMetrics({
        window: metricsWindow,
        latest: latestMetrics,
        sessionId: effectiveSessionId,
      })
    : null;

  return {
    phase: 'end',
    sessionId: checkpoint.sessionId ?? sessionId ?? null,
    checkpoint,
    ...(workflow ? { workflow } : {}),
    ...(mutationSafety ? { mutationSafety } : {}),
    repoSafety: checkpoint.repoSafety ?? metrics?.repoSafety ?? null,
    sideEffectsSuppressed: Boolean(checkpoint.sideEffectsSuppressed ?? metrics?.sideEffectsSuppressed),
    ...(metrics ? { metrics: summarizeMetrics(metrics) } : {}),
    message: mutationSafety?.blocked ? mutationSafety.message : checkpoint.message,
  };
};

export const smartTurn = async ({
  phase,
  sessionId,
  prompt,
  update,
  event,
  force,
  maxTokens,
  ensureSession = false,
  includeMetrics = false,
  metricsWindow = '7d',
  latestMetrics = 5,
} = {}) => {
  if (phase === 'start') {
    return startTurn({
      sessionId,
      prompt,
      maxTokens,
      ensureSession,
      includeMetrics,
      metricsWindow,
      latestMetrics,
    });
  }

  if (phase === 'end') {
    return endTurn({
      sessionId,
      event,
      update,
      force,
      maxTokens,
      includeMetrics,
      metricsWindow,
      latestMetrics,
    });
  }

  throw new Error('Invalid phase. Valid phases: start, end');
};
