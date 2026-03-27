import { persistMetrics } from '../metrics.js';
import { countTokens } from '../tokenCounter.js';
import { smartSummary } from '../tools/smart-summary.js';
import { smartTurn } from '../tools/smart-turn.js';
import {
  deleteHookTurnState,
  getHookTurnState,
  setHookTurnState,
} from '../storage/sqlite.js';

const HOOK_CLIENT = 'claude';
const START_MAX_TOKENS = 350;
const STOP_MAX_TOKENS = 300;
const MAX_CONTEXT_LINES = 5;
const MAX_CONTEXT_CHARS = 420;
const MAX_PROMPT_PREVIEW = 160;
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const SIGNIFICANT_RESPONSE_LENGTH = 140;

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

const countPromptTerms = (value) =>
  normalizeWhitespace(value)
    .split(/[^a-z0-9_.-]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .length;

const isMeaningfulPrompt = (value) => {
  const normalized = normalizeWhitespace(value);
  return normalized.length >= 20 && countPromptTerms(normalized) >= 4;
};

const uniq = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];

const buildHookKey = ({ sessionId, agentId = null }) =>
  agentId ? `${HOOK_CLIENT}:subagent:${sessionId}:${agentId}` : `${HOOK_CLIENT}:main:${sessionId}`;

const buildAdditionalContext = ({ result, sessionStart = false }) => {
  const lines = [];
  const repoSafety = result?.repoSafety;
  const summary = result?.summary;
  const continuityState = result?.continuity?.state;

  if (result?.found && summary) {
    const label = sessionStart ? 'resume' : continuityState ?? 'resume';
    lines.push(`devctx ${label}: session ${result.sessionId}`);

    if (summary.goal) {
      lines.push(`goal: ${truncate(summary.goal, 110)}`);
    }

    if (summary.currentFocus) {
      lines.push(`focus: ${truncate(summary.currentFocus, 110)}`);
    }

    if (summary.nextStep) {
      lines.push(`next: ${truncate(summary.nextStep, 110)}`);
    }
  } else if (result?.continuity?.state === 'ambiguous_resume') {
    lines.push('devctx: multiple persisted sessions matched this prompt.');
    if (result?.recommendedSessionId) {
      lines.push(`recommended session: ${result.recommendedSessionId}`);
    }
  } else if (result?.autoCreated && summary?.goal) {
    lines.push(`devctx new task session: ${truncate(summary.goal, 110)}`);
  }

  if (repoSafety?.isTracked || repoSafety?.isStaged) {
    const reasons = [];
    if (repoSafety.isTracked) {
      reasons.push('tracked');
    }
    if (repoSafety.isStaged) {
      reasons.push('staged');
    }
    lines.push(`repo safety: .devctx/state.sqlite is ${reasons.join(' and ')}; context writes are blocked.`);
  }

  const clipped = lines.slice(0, MAX_CONTEXT_LINES).join('\n').slice(0, MAX_CONTEXT_CHARS).trim();
  return clipped || null;
};

const buildHookContextResponse = (hookEventName, additionalContext) => {
  if (!additionalContext) {
    return null;
  }

  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  };
};

const recordHookMetrics = async ({
  action,
  sessionId,
  additionalContext = '',
  blocked = false,
  autoAppended = false,
  continuityState = null,
} = {}) => {
  const overheadTokens = additionalContext ? countTokens(additionalContext) : 0;

  await persistMetrics({
    tool: 'claude_hook',
    action,
    sessionId,
    rawTokens: 0,
    compressedTokens: 0,
    savedTokens: 0,
    savingsPct: 0,
    metadata: {
      isContextOverhead: overheadTokens > 0,
      overheadTokens,
      blocked,
      autoAppended,
      continuityState,
    },
    timestamp: new Date().toISOString(),
  });
};

const isSmartTurnTool = (toolName) => /^mcp__.+__smart_turn$/i.test(toolName ?? '');
const isSmartSummaryTool = (toolName) => /^mcp__.+__smart_summary$/i.test(toolName ?? '');

const isCheckpointToolUse = ({ toolName, toolInput }) => {
  if (isSmartTurnTool(toolName)) {
    return toolInput?.phase === 'end'
      ? { matched: true, event: toolInput?.event ?? 'manual' }
      : { matched: false, event: null };
  }

  if (isSmartSummaryTool(toolName)) {
    const action = toolInput?.action;
    if (action === 'checkpoint') {
      return { matched: true, event: toolInput?.event ?? 'manual' };
    }

    if (action === 'append' || action === 'auto_append' || action === 'update') {
      return { matched: true, event: action };
    }
  }

  return { matched: false, event: null };
};

const extractTouchedFiles = ({ toolName, toolInput, toolResponse }) => {
  if (!WRITE_TOOLS.has(toolName)) {
    return [];
  }

  return uniq([
    toolInput?.file_path,
    toolInput?.filePath,
    toolResponse?.file_path,
    toolResponse?.filePath,
  ]);
};

const extractNextStep = (message) => {
  const normalized = normalizeWhitespace(message);
  if (!normalized) {
    return '';
  }

  const explicitMatch = normalized.match(/(?:next step|siguiente paso)\s*[:\-]\s*([^.;\n]{12,180})/i);
  if (explicitMatch?.[1]) {
    return truncate(explicitMatch[1], 150);
  }

  return '';
};

const buildCarryoverUpdate = (state, lastAssistantMessage) => {
  const promptPreview = truncate(state.promptPreview, 140);
  const nextStep = extractNextStep(lastAssistantMessage);
  const pinnedContext = promptPreview ? [`Uncheckpointed turn: ${promptPreview}`] : [];

  return {
    ...(promptPreview ? { currentFocus: promptPreview } : {}),
    ...(pinnedContext.length > 0 ? { pinnedContext } : {}),
    ...(state.touchedFiles.length > 0 ? { touchedFiles: state.touchedFiles } : {}),
    ...(nextStep ? { nextStep } : {}),
  };
};

const computeStopEnforcement = (state, lastAssistantMessage) => {
  const nextStep = extractNextStep(lastAssistantMessage);
  const responseLength = normalizeWhitespace(lastAssistantMessage).length;
  let score = 0;

  if (state.meaningfulWriteCount > 0) {
    score += 3;
  }

  if (state.touchedFiles.length > 0) {
    score += 1;
  }

  if (nextStep) {
    score += 2;
  }

  if (responseLength >= SIGNIFICANT_RESPONSE_LENGTH) {
    score += 1;
  }

  if (state.continuityState === 'task_switch' || state.continuityState === 'possible_shift') {
    score += 1;
  }

  return {
    shouldBlock: score >= 3,
    score,
    nextStep,
  };
};

const maybeTrackTurn = async ({
  hookKey,
  claudeSessionId,
  projectSessionId,
  prompt,
  continuityState,
}) => {
  const promptMeaningful = isMeaningfulPrompt(prompt);
  const shouldTrack = Boolean(projectSessionId) && promptMeaningful;

  if (!shouldTrack) {
    await deleteHookTurnState({ hookKey });
    return null;
  }

  return setHookTurnState({
    hookKey,
    state: {
      client: HOOK_CLIENT,
      claudeSessionId,
      projectSessionId,
      turnId: `${claudeSessionId}:${Date.now()}`,
      promptPreview: truncate(prompt),
      continuityState,
      requireCheckpoint: true,
      promptMeaningful,
      checkpointed: false,
      checkpointEvent: null,
      touchedFiles: [],
      meaningfulWriteCount: 0,
    },
  });
};

const handleSessionStart = async (input) => {
  const result = await smartTurn({
    phase: 'start',
    maxTokens: START_MAX_TOKENS,
  });
  const additionalContext = buildAdditionalContext({ result, sessionStart: true });
  await recordHookMetrics({
    action: 'SessionStart',
    sessionId: result.sessionId ?? null,
    additionalContext,
    continuityState: result.continuity?.state ?? null,
  });
  return buildHookContextResponse('SessionStart', additionalContext);
};

const handleUserPromptSubmit = async (input) => {
  const result = await smartTurn({
    phase: 'start',
    prompt: input.prompt,
    ensureSession: true,
    maxTokens: START_MAX_TOKENS,
  });

  const trackedState = await maybeTrackTurn({
    hookKey: buildHookKey({ sessionId: input.session_id }),
    claudeSessionId: input.session_id,
    projectSessionId: result.sessionId ?? null,
    prompt: input.prompt,
    continuityState: result.continuity?.state ?? '',
  });
  const additionalContext = buildAdditionalContext({ result });
  await recordHookMetrics({
    action: 'UserPromptSubmit',
    sessionId: trackedState?.projectSessionId ?? result.sessionId ?? null,
    additionalContext,
    continuityState: result.continuity?.state ?? null,
  });
  return buildHookContextResponse('UserPromptSubmit', additionalContext);
};

const handlePostToolUse = async (input) => {
  const hookKey = buildHookKey({ sessionId: input.session_id });
  const existing = await getHookTurnState({ hookKey });
  if (!existing) {
    return null;
  }

  const checkpoint = isCheckpointToolUse({
    toolName: input.tool_name,
    toolInput: input.tool_input,
  });
  const touchedFiles = extractTouchedFiles({
    toolName: input.tool_name,
    toolInput: input.tool_input,
    toolResponse: input.tool_response,
  });

  const nextState = {
    ...existing,
    checkpointed: checkpoint.matched ? true : existing.checkpointed,
    checkpointEvent: checkpoint.matched ? checkpoint.event : existing.checkpointEvent,
    touchedFiles: uniq([...existing.touchedFiles, ...touchedFiles]),
    meaningfulWriteCount: existing.meaningfulWriteCount + touchedFiles.length,
    updatedAt: new Date().toISOString(),
  };

  await setHookTurnState({ hookKey, state: nextState });
  if (checkpoint.matched || touchedFiles.length > 0) {
    await recordHookMetrics({
      action: 'PostToolUse',
      sessionId: existing.projectSessionId,
      additionalContext: '',
      continuityState: existing.continuityState,
    });
  }
  return null;
};

const handleStop = async (input) => {
  const hookKey = buildHookKey({ sessionId: input.session_id });
  const state = await getHookTurnState({ hookKey });
  if (!state) {
    return null;
  }

  const enforcement = computeStopEnforcement(state, input.last_assistant_message);
  const shouldEnforce = (state.requireCheckpoint || state.meaningfulWriteCount > 0) && enforcement.shouldBlock;
  if (!shouldEnforce || state.checkpointed) {
    await recordHookMetrics({
      action: 'Stop',
      sessionId: state.projectSessionId,
      additionalContext: '',
      blocked: false,
      continuityState: state.continuityState,
    });
    await deleteHookTurnState({ hookKey });
    return null;
  }

  if (input.stop_hook_active) {
    const update = buildCarryoverUpdate(state, input.last_assistant_message);
    if (state.projectSessionId && Object.keys(update).length > 0) {
      await smartSummary({
        action: 'auto_append',
        sessionId: state.projectSessionId,
        update,
        maxTokens: STOP_MAX_TOKENS,
      });
    }

    await recordHookMetrics({
      action: 'Stop',
      sessionId: state.projectSessionId,
      additionalContext: '',
      blocked: false,
      autoAppended: true,
      continuityState: state.continuityState,
    });
    await deleteHookTurnState({ hookKey });
    return null;
  }

  await recordHookMetrics({
    action: 'Stop',
    sessionId: state.projectSessionId,
    additionalContext: '',
    blocked: true,
    continuityState: state.continuityState,
  });
  return {
    decision: 'block',
    reason: `Persist this turn with mcp__devctx__smart_turn phase=end before stopping.${state.touchedFiles.length > 0 ? ' Include touchedFiles and the nextStep.' : ' Include the nextStep.'}`,
  };
};

export const handleClaudeHookEvent = async (input = {}) => {
  const eventName = input.hook_event_name;

  if (eventName === 'SessionStart') {
    return handleSessionStart(input);
  }

  if (eventName === 'UserPromptSubmit') {
    return handleUserPromptSubmit(input);
  }

  if (eventName === 'PostToolUse') {
    return handlePostToolUse(input);
  }

  if (eventName === 'Stop') {
    return handleStop(input);
  }

  return null;
};
