import { persistMetrics } from '../../metrics.js';
import { buildOperationalContextLines } from '../../client-contract.js';
import { getRepoMutationSafety } from '../../repo-safety.js';
import { countTokens } from '../../tokenCounter.js';
import { smartSummary } from '../../tools/smart-summary.js';
import { smartTurn } from '../../tools/smart-turn.js';
import {
  deleteHookTurnState,
  getHookTurnState,
  persistTaskHandoff,
  setHookTurnState,
  upsertAgentRun,
} from '../../storage/sqlite.js';
import { DEFAULT_START_MAX_TOKENS, resolveManagedStart } from '../base-orchestrator.js';
import { extractNextStep, normalizeWhitespace, truncate } from '../policy/event-policy.js';

export const HOOK_CLIENT = 'cursor';
export const STOP_MAX_TOKENS = 300;
export const MAX_CONTEXT_LINES = 7;
export const MAX_CONTEXT_CHARS = 420;
export const MAX_PROMPT_PREVIEW = 160;
export const MAX_TOUCHED_FILES = 12;
export const MIN_MEANINGFUL_PROMPT_LENGTH = 20;
export const MIN_PROMPT_TERMS = 4;
export const SIGNIFICANT_RESPONSE_LENGTH = 140;
export const WRITE_TOOLS = new Set(['Write', 'StrReplace', 'Delete', 'EditNotebook']);

const uniq = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];

const resolveAgentId = (input = {}) => {
  const value = input.agent_id ?? input.agentId ?? input.worker_id ?? null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'main';
};

const resolveParentAgentId = (input = {}) => {
  const value = input.parent_agent_id ?? input.parentAgentId ?? null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

export const buildCursorHookKey = ({ conversationId, agentId = null }) =>
  agentId && agentId !== 'main'
    ? `${HOOK_CLIENT}:subagent:${conversationId}:${agentId}`
    : `${HOOK_CLIENT}:main:${conversationId}`;

const countPromptTerms = (value) =>
  normalizeWhitespace(value)
    .split(/[^a-z0-9_.-]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .length;

export const isMeaningfulPrompt = (value) => {
  const normalized = normalizeWhitespace(value);
  return normalized.length >= MIN_MEANINGFUL_PROMPT_LENGTH && countPromptTerms(normalized) >= MIN_PROMPT_TERMS;
};

export const buildCursorAdditionalContext = ({ result, sessionStart = false }) =>
  buildOperationalContextLines(result, {
    sessionStart,
    maxLineLength: 110,
    maxLines: MAX_CONTEXT_LINES,
    maxChars: MAX_CONTEXT_CHARS,
  });

export const buildCursorHookContextResponse = (hookEventName, additionalContext) => {
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

const isSmartTurnTool = (toolName) => /^mcp__.+__smart_turn$/i.test(toolName ?? '');
const isSmartSummaryTool = (toolName) => /^mcp__.+__smart_summary$/i.test(toolName ?? '');

export const isCheckpointToolUse = ({ toolName, toolInput }) => {
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

export const extractTouchedFilesFromToolUse = ({ toolName, toolInput, toolResponse }) => {
  if (!WRITE_TOOLS.has(toolName)) {
    return [];
  }

  return uniq([
    toolInput?.path,
    toolInput?.file_path,
    toolInput?.filePath,
    toolInput?.target_notebook,
    toolResponse?.path,
    toolResponse?.file_path,
    toolResponse?.filePath,
  ]).slice(0, MAX_TOUCHED_FILES);
};

export const buildCarryoverUpdate = (state, lastAssistantMessage) => {
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

export const computeStopEnforcement = (state, lastAssistantMessage) => {
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

export const createCursorAdapter = ({
  startTurn = smartTurn,
  summaryTool = smartSummary,
  resolveStart = resolveManagedStart,
  persistMetric = persistMetrics,
  writeAgentRun = upsertAgentRun,
  writeTaskHandoff = persistTaskHandoff,
  getMutationSafety = getRepoMutationSafety,
  readHookState = null,
  writeHookState = ({ hookKey, state }) => setHookTurnState({ hookKey, state }),
  removeHookState = ({ hookKey }) => deleteHookTurnState({ hookKey }),
} = {}) => {
  const readTrackedHookState = async (hookKey) => getHookTurnState({
    hookKey,
    readOnly: getMutationSafety().shouldBlock,
  });

  const readTrackedState = readHookState ?? readTrackedHookState;

  const maybeSetTrackedTurnState = async ({ hookKey, state }) => {
    if (getMutationSafety().shouldBlock) {
      return null;
    }

    return writeHookState({ hookKey, state });
  };

  const maybeDeleteTrackedTurnState = async ({ hookKey }) => {
    if (getMutationSafety().shouldBlock) {
      return null;
    }

    return removeHookState({ hookKey });
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
    const autoStartTriggered = action === 'ConversationStart' || action === 'UserMessageSubmit';
    const autoCheckpointTriggered = action === 'ConversationEnd' && autoAppended;

    await persistMetric({
      tool: 'cursor_hook',
      action,
      sessionId,
      rawTokens: 0,
      compressedTokens: 0,
      savedTokens: 0,
      savingsPct: 0,
      metadata: {
        client: HOOK_CLIENT,
        adapterClient: HOOK_CLIENT,
        managedByClientAdapter: true,
        autoStartTriggered,
        autoCheckpointTriggered,
        isContextOverhead: overheadTokens > 0,
        overheadTokens,
        blocked,
        autoAppended,
        continuityState,
      },
      timestamp: new Date().toISOString(),
    });
  };

  const maybeTrackTurn = async ({
    hookKey,
    cursorConversationId,
    conversationId,
    projectSessionId,
    taskId,
    agentId,
    parentAgentId,
    prompt,
    continuityState,
  }) => {
    const promptMeaningful = isMeaningfulPrompt(prompt);
    const shouldTrack = Boolean(projectSessionId) && promptMeaningful;

    if (!shouldTrack) {
      await maybeDeleteTrackedTurnState({ hookKey });
      return null;
    }

    return maybeSetTrackedTurnState({
      hookKey,
      state: {
        client: HOOK_CLIENT,
        cursorConversationId,
        conversationId,
        projectSessionId,
        taskId,
        agentId,
        parentAgentId,
        turnId: `${cursorConversationId}:${Date.now()}`,
        promptPreview: truncate(prompt, MAX_PROMPT_PREVIEW),
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

  const handleConversationStart = async () => {
    const result = await startTurn({
      phase: 'start',
      maxTokens: DEFAULT_START_MAX_TOKENS,
    });
    const additionalContext = buildCursorAdditionalContext({ result, sessionStart: true });
    await recordHookMetrics({
      action: 'ConversationStart',
      sessionId: result.sessionId ?? null,
      additionalContext,
      continuityState: result.continuity?.state ?? null,
    });
    return buildCursorHookContextResponse('ConversationStart', additionalContext);
  };

  const handleUserMessageSubmit = async (input) => {
    const agentId = resolveAgentId(input);
    const parentAgentId = resolveParentAgentId(input);
    const startResolution = await resolveStart({
      prompt: input.user_message,
      ensureSession: true,
      allowIsolation: false,
      startTurn,
      summaryTool,
      startMaxTokens: DEFAULT_START_MAX_TOKENS,
    });
    const result = startResolution.startResult;

    if (!getMutationSafety().shouldBlock) {
      await writeAgentRun({
        runId: buildCursorHookKey({ conversationId: input.conversation_id, agentId }),
        taskId: result.task?.taskId ?? null,
        agentId,
        parentAgentId,
        client: HOOK_CLIENT,
        conversationId: input.conversation_id,
        sessionId: result.sessionId ?? null,
        role: agentId === 'main' ? 'main' : 'subagent',
      });
    }

    const trackedState = await maybeTrackTurn({
      hookKey: buildCursorHookKey({ conversationId: input.conversation_id, agentId }),
      cursorConversationId: input.conversation_id,
      conversationId: input.conversation_id,
      projectSessionId: result.sessionId ?? null,
      taskId: result.task?.taskId ?? null,
      agentId,
      parentAgentId,
      prompt: input.user_message,
      continuityState: result.continuity?.state ?? '',
    });

    const additionalContext = buildCursorAdditionalContext({ result });
    await recordHookMetrics({
      action: 'UserMessageSubmit',
      sessionId: trackedState?.projectSessionId ?? result.sessionId ?? null,
      additionalContext,
      continuityState: result.continuity?.state ?? null,
    });
    return buildCursorHookContextResponse('UserMessageSubmit', additionalContext);
  };

  const handlePostToolUse = async (input) => {
    const hookKey = buildCursorHookKey({ conversationId: input.conversation_id, agentId: resolveAgentId(input) });
    const existing = await readTrackedState(hookKey);
    if (!existing) {
      return null;
    }

    const checkpoint = isCheckpointToolUse({
      toolName: input.tool_name,
      toolInput: input.tool_input,
    });
    const touchedFiles = extractTouchedFilesFromToolUse({
      toolName: input.tool_name,
      toolInput: input.tool_input,
      toolResponse: input.tool_response,
    });

    const nextState = {
      ...existing,
      checkpointed: checkpoint.matched ? true : existing.checkpointed,
      checkpointEvent: checkpoint.matched ? checkpoint.event : existing.checkpointEvent,
      touchedFiles: uniq([...existing.touchedFiles, ...touchedFiles]).slice(0, MAX_TOUCHED_FILES),
      meaningfulWriteCount: existing.meaningfulWriteCount + touchedFiles.length,
      updatedAt: new Date().toISOString(),
    };

    await maybeSetTrackedTurnState({ hookKey, state: nextState });
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

  const handleConversationEnd = async (input) => {
    const hookKey = buildCursorHookKey({ conversationId: input.conversation_id, agentId: resolveAgentId(input) });
    const state = await readTrackedState(hookKey);
    if (!state) {
      return null;
    }

    if (getMutationSafety().shouldBlock) {
      await recordHookMetrics({
        action: 'ConversationEnd',
        sessionId: state.projectSessionId,
        additionalContext: '',
        blocked: false,
        continuityState: state.continuityState,
      });
      return null;
    }

    const enforcement = computeStopEnforcement(state, input.last_assistant_message ?? '');
    const shouldEnforce = (state.requireCheckpoint || state.meaningfulWriteCount > 0) && enforcement.shouldBlock;
    if (!shouldEnforce || state.checkpointed) {
      await recordHookMetrics({
        action: 'ConversationEnd',
        sessionId: state.projectSessionId,
        additionalContext: '',
        blocked: false,
        continuityState: state.continuityState,
      });
      await maybeDeleteTrackedTurnState({ hookKey });
      return null;
    }

    if (input.end_hook_active) {
      const update = buildCarryoverUpdate(state, input.last_assistant_message ?? '');
      if (state.projectSessionId && Object.keys(update).length > 0) {
        await summaryTool({
          action: 'auto_append',
          sessionId: state.projectSessionId,
          update,
          maxTokens: STOP_MAX_TOKENS,
        });
      }

      if (state.taskId) {
        await writeTaskHandoff({
          taskId: state.taskId,
          sessionId: state.projectSessionId,
          fromAgentId: state.agentId ?? null,
          toAgentId: null,
          trigger: state.agentId && state.agentId !== 'main' ? 'subagent_delegate' : 'session_end',
          summary: {
            currentFocus: update.currentFocus ?? state.promptPreview,
            touchedFiles: state.touchedFiles,
            pending: update.nextStep ? [update.nextStep] : [],
            nextStep: update.nextStep ?? null,
            evidence: state.touchedFiles.length > 0 ? [`Touched files: ${state.touchedFiles.join(', ')}`] : [],
          },
        });
      }

      await recordHookMetrics({
        action: 'ConversationEnd',
        sessionId: state.projectSessionId,
        additionalContext: '',
        blocked: false,
        autoAppended: true,
        continuityState: state.continuityState,
      });
      await maybeDeleteTrackedTurnState({ hookKey });
      return null;
    }

    await recordHookMetrics({
      action: 'ConversationEnd',
      sessionId: state.projectSessionId,
      additionalContext: '',
      blocked: true,
      continuityState: state.continuityState,
    });
    return {
      decision: 'block',
      reason: `Persist this turn with mcp__devctx__smart_turn phase=end before ending conversation.${state.touchedFiles.length > 0 ? ' Include touchedFiles and the nextStep.' : ' Include the nextStep.'}`,
    };
  };

  const handleEvent = async (input = {}) => {
    const eventName = input.hook_event_name;

    if (eventName === 'ConversationStart') {
      return handleConversationStart(input);
    }

    if (eventName === 'UserMessageSubmit') {
      return handleUserMessageSubmit(input);
    }

    if (eventName === 'PostToolUse') {
      return handlePostToolUse(input);
    }

    if (eventName === 'ConversationEnd') {
      return handleConversationEnd(input);
    }

    return null;
  };

  return {
    handleEvent,
  };
};

export const handleCursorHookEvent = createCursorAdapter().handleEvent;
