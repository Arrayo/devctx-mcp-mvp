import { smartMetrics } from './smart-metrics.js';
import { smartSummary } from './smart-summary.js';

const DEFAULT_START_MAX_TOKENS = 400;
const DEFAULT_END_MAX_TOKENS = 500;
const DEFAULT_END_EVENT = 'milestone';
const MAX_PROMPT_PREVIEW = 160;
const SAFE_CONTINUITY_STATES = new Set(['aligned', 'resume']);
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

const shouldIsolateSession = ({ sessionId, ensureSession, prompt, continuity }) =>
  !sessionId
  && ensureSession
  && hasMeaningfulPrompt(prompt)
  && continuity
  && !SAFE_CONTINUITY_STATES.has(continuity.state ?? '');

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
    repoSafety: summaryResult.repoSafety ?? metrics?.repoSafety ?? null,
    sideEffectsSuppressed: Boolean(summaryResult.sideEffectsSuppressed ?? metrics?.sideEffectsSuppressed),
    ...(summaryResult.candidates ? { candidates: summaryResult.candidates } : {}),
    ...(summaryResult.recommendedSessionId ? { recommendedSessionId: summaryResult.recommendedSessionId } : {}),
    ...(metrics ? { metrics: summarizeMetrics(metrics) } : {}),
    message: summaryResult.found
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
    repoSafety: checkpoint.repoSafety ?? metrics?.repoSafety ?? null,
    sideEffectsSuppressed: Boolean(checkpoint.sideEffectsSuppressed ?? metrics?.sideEffectsSuppressed),
    ...(metrics ? { metrics: summarizeMetrics(metrics) } : {}),
    message: checkpoint.message,
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
