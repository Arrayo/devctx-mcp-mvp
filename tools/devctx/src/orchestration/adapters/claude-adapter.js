import { persistMetrics } from '../../metrics.js';
import { buildOperationalContextLines } from '../../client-contract.js';
import { getRepoMutationSafety } from '../../repo-safety.js';
import { countTokens } from '../../tokenCounter.js';
import { smartSummary } from '../../tools/smart-summary.js';
import { smartTurn } from '../../tools/smart-turn.js';
import {
  deleteHookTurnState,
  getHookTurnState,
  setHookTurnState,
} from '../../storage/sqlite.js';
import { DEFAULT_START_MAX_TOKENS, resolveManagedStart } from '../base-orchestrator.js';
import { extractNextStep, normalizeWhitespace, truncate } from '../policy/event-policy.js';

export const HOOK_CLIENT = 'claude';
export const STOP_MAX_TOKENS = 300;
export const MAX_CONTEXT_LINES = 7;
export const MAX_CONTEXT_CHARS = 420;
export const MAX_PROMPT_PREVIEW = 160;
export const MAX_TOUCHED_FILES = 12;
export const MIN_MEANINGFUL_PROMPT_LENGTH = 20;
export const MIN_PROMPT_TERMS = 4;
export const SIGNIFICANT_RESPONSE_LENGTH = 140;
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

const uniq = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];

export const buildClaudeHookKey = ({ sessionId, agentId = null }) =>
  agentId ? `${HOOK_CLIENT}:subagent:${sessionId}:${agentId}` : `${HOOK_CLIENT}:main:${sessionId}`;

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

export const buildClaudeAdditionalContext = ({ result, sessionStart = false }) =>
  buildOperationalContextLines(result, {
    sessionStart,
    maxLineLength: 110,
    maxLines: MAX_CONTEXT_LINES,
    maxChars: MAX_CONTEXT_CHARS,
  });

export const buildClaudeHookContextResponse = (hookEventName, additionalContext) => {
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
    toolInput?.file_path,
    toolInput?.filePath,
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

export const createClaudeAdapter = ({
  startTurn = smartTurn,
  summaryTool = smartSummary,
  resolveStart = resolveManagedStart,
  persistMetric = persistMetrics,
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
    const autoStartTriggered = action === 'SessionStart' || action === 'UserPromptSubmit';
    const autoCheckpointTriggered = action === 'Stop' && autoAppended;

    await persistMetric({
      tool: 'claude_hook',
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
    claudeSessionId,
    projectSessionId,
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
        claudeSessionId,
        projectSessionId,
        turnId: `${claudeSessionId}:${Date.now()}`,
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

  const handleSessionStart = async () => {
    const result = await startTurn({
      phase: 'start',
      maxTokens: DEFAULT_START_MAX_TOKENS,
    });
    const additionalContext = buildClaudeAdditionalContext({ result, sessionStart: true });
    await recordHookMetrics({
      action: 'SessionStart',
      sessionId: result.sessionId ?? null,
      additionalContext,
      continuityState: result.continuity?.state ?? null,
    });
    return buildClaudeHookContextResponse('SessionStart', additionalContext);
  };

  const handleUserPromptSubmit = async (input) => {
    const startResolution = await resolveStart({
      prompt: input.prompt,
      ensureSession: true,
      allowIsolation: false,
      startTurn,
      summaryTool,
      startMaxTokens: DEFAULT_START_MAX_TOKENS,
    });
    const result = startResolution.startResult;

    const trackedState = await maybeTrackTurn({
      hookKey: buildClaudeHookKey({ sessionId: input.session_id }),
      claudeSessionId: input.session_id,
      projectSessionId: result.sessionId ?? null,
      prompt: input.prompt,
      continuityState: result.continuity?.state ?? '',
    });

    const additionalContext = buildClaudeAdditionalContext({ result });
    await recordHookMetrics({
      action: 'UserPromptSubmit',
      sessionId: trackedState?.projectSessionId ?? result.sessionId ?? null,
      additionalContext,
      continuityState: result.continuity?.state ?? null,
    });
    return buildClaudeHookContextResponse('UserPromptSubmit', additionalContext);
  };

  const handlePostToolUse = async (input) => {
    const hookKey = buildClaudeHookKey({ sessionId: input.session_id });
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

  const handleStop = async (input) => {
    const hookKey = buildClaudeHookKey({ sessionId: input.session_id });
    const state = await readTrackedState(hookKey);
    if (!state) {
      return null;
    }

    if (getMutationSafety().shouldBlock) {
      await recordHookMetrics({
        action: 'Stop',
        sessionId: state.projectSessionId,
        additionalContext: '',
        blocked: false,
        continuityState: state.continuityState,
      });
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
      await maybeDeleteTrackedTurnState({ hookKey });
      return null;
    }

    if (input.stop_hook_active) {
      const update = buildCarryoverUpdate(state, input.last_assistant_message);
      if (state.projectSessionId && Object.keys(update).length > 0) {
        await summaryTool({
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
      await maybeDeleteTrackedTurnState({ hookKey });
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

  const handleEvent = async (input = {}) => {
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

  return {
    handleEvent,
  };
};

export const handleClaudeHookEvent = createClaudeAdapter().handleEvent;
