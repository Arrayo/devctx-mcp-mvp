import { smartContext } from '../../tools/smart-context.js';
import { smartSearch } from '../../tools/smart-search.js';

export const SAFE_CONTINUITY_STATES = new Set(['aligned', 'resume']);

export const MAX_TOP_FILES = 3;
export const MAX_PREFLIGHT_HINTS = 2;
export const MAX_FOCUS_LENGTH = 140;
export const MAX_GOAL_LENGTH = 120;
export const MAX_NEXT_STEP_LENGTH = 150;
export const DEFAULT_TRUNCATE_LENGTH = 160;
export const MIN_NEXT_STEP_LENGTH = 12;
export const MAX_NEXT_STEP_CAPTURE_LENGTH = 180;
export const MAX_RECOMMENDED_TOOLS = 3;

export const normalizeWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const truncate = (value, maxLength = DEFAULT_TRUNCATE_LENGTH) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return '';
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const asArray = (value) => Array.isArray(value) ? value : [];

export const uniqueCompact = (values) => [...new Set(
  asArray(values)
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean),
)];

export const extractContextTopFiles = (topFiles) => uniqueCompact(asArray(topFiles).map((item) => {
  if (typeof item === 'string') {
    return item;
  }

  return item?.file ?? item?.path ?? '';
})).slice(0, MAX_TOP_FILES);

export const extractPreflightTopFiles = (preflightResult) => {
  if (!preflightResult) {
    return [];
  }

  if (preflightResult.tool === 'smart_context') {
    return uniqueCompact(asArray(preflightResult.result?.context).map((item) => item?.file).filter(Boolean)).slice(0, MAX_TOP_FILES);
  }

  if (preflightResult.tool === 'smart_search') {
    return extractContextTopFiles(preflightResult.result?.topFiles);
  }

  return [];
};

export const extractPreflightHints = (preflightResult) => {
  if (!preflightResult) {
    return [];
  }

  if (preflightResult.tool === 'smart_context') {
    return uniqueCompact(preflightResult.result?.hints).slice(0, MAX_PREFLIGHT_HINTS);
  }

  if (preflightResult.tool === 'smart_search') {
    const totalMatches = Number(preflightResult.result?.totalMatches ?? 0);
    if (totalMatches > 0) {
      return [`${totalMatches} search match(es) surfaced for the workflow target`];
    }
  }

  return [];
};

export const buildPreflightSummary = (preflightResult) => {
  if (!preflightResult) {
    return null;
  }

  return {
    tool: preflightResult.tool,
    topFiles: extractPreflightTopFiles(preflightResult),
    hints: extractPreflightHints(preflightResult),
    totalMatches: Number(preflightResult.result?.totalMatches ?? 0),
  };
};

export const buildPreflightTask = ({ workflowProfile, prompt, startResult }) => {
  if (!workflowProfile || typeof workflowProfile !== 'object') {
    return '';
  }

  const normalizedPrompt = normalizeWhitespace(prompt);
  const persistedNextStep = normalizeWhitespace(startResult?.summary?.nextStep);
  const currentFocus = normalizeWhitespace(startResult?.summary?.currentFocus);
  const refreshedTopFiles = extractContextTopFiles(startResult?.refreshedContext?.topFiles);

  if (workflowProfile.commandName === 'continue' || workflowProfile.commandName === 'resume') {
    if (persistedNextStep) {
      return persistedNextStep;
    }
    if (currentFocus) {
      return currentFocus;
    }
  }

  if (workflowProfile.commandName === 'task' && currentFocus && persistedNextStep) {
    return `${currentFocus}. ${persistedNextStep}`;
  }

  if (normalizedPrompt) {
    return normalizedPrompt;
  }

  if (refreshedTopFiles.length > 0) {
    return `Inspect ${refreshedTopFiles.join(', ')} and continue the persisted task`;
  }

  return workflowProfile.label;
};

export const runWorkflowPreflight = async ({
  workflowProfile,
  prompt,
  startResult,
  contextTool = smartContext,
  searchTool = smartSearch,
}) => {
  const preflight = workflowProfile.preflight;
  if (!preflight) {
    return null;
  }

  const preflightTask = buildPreflightTask({ workflowProfile, prompt, startResult });

  if (preflight.tool === 'smart_context') {
    const request = {
      task: preflightTask,
      detail: preflight.detail ?? 'minimal',
      include: preflight.include ?? ['hints'],
      maxTokens: preflight.maxTokens ?? 1200,
    };
    const result = await contextTool(request);
    return {
      tool: 'smart_context',
      request,
      result,
    };
  }

  if (preflight.tool === 'smart_search') {
    const request = {
      query: preflightTask,
      intent: preflight.intent ?? workflowProfile.workflowIntent,
    };
    const result = await searchTool(request);
    return {
      tool: 'smart_search',
      request,
      result,
    };
  }

  return null;
};

export const buildContinuityGuidance = ({ startResult }) => {
  const continuityState = startResult?.continuity?.state ?? 'unknown';
  const lines = [`- Continuity: ${continuityState}`];
  const nextStep = normalizeWhitespace(startResult?.summary?.nextStep);
  const currentFocus = normalizeWhitespace(startResult?.summary?.currentFocus);
  const refreshedTopFiles = extractContextTopFiles(startResult?.refreshedContext?.topFiles);
  const recommendedNextTools = asArray(startResult?.recommendedPath?.nextTools)
    .map((tool) => normalizeWhitespace(tool))
    .filter(Boolean)
    .slice(0, MAX_RECOMMENDED_TOOLS);

  if (currentFocus) {
    lines.push(`- Persisted focus: ${truncate(currentFocus, MAX_FOCUS_LENGTH)}`);
  }

  if (nextStep) {
    lines.push(`- Persisted next step: ${truncate(nextStep, MAX_FOCUS_LENGTH)}`);
  }

  if (refreshedTopFiles.length > 0) {
    lines.push(`- Refreshed top files: ${refreshedTopFiles.join(', ')}`);
  }

  if (recommendedNextTools.length > 0) {
    lines.push(`- smart_turn suggested: ${recommendedNextTools.join(' -> ')}`);
  }

  if (startResult?.isolatedSession) {
    lines.push('- Session handling: smart_turn already isolated this work from the previous session; revalidate before assuming old focus.');
  } else if (continuityState === 'aligned' || continuityState === 'resume') {
    lines.push('- Session handling: reuse the active session context and stay close to the persisted next step unless the task proves otherwise.');
  } else if (continuityState === 'possible_shift' || continuityState === 'context_mismatch') {
    lines.push('- Session handling: treat this as a shifted slice, validate the working set early, and avoid silent context reuse.');
  }

  return lines;
};

export const buildWorkflowPromptWithPolicy = ({
  prompt,
  workflowProfile,
  preflightSummary,
  startResult,
}) => {
  const lines = [
    prompt,
    '',
    'Workflow policy:',
    `- Mode: ${workflowProfile.policyMode}`,
    `- Intent: ${workflowProfile.workflowIntent}`,
    `- Prefer this tool order: ${workflowProfile.nextTools.join(' -> ')}`,
  ];

  if (workflowProfile.checkpointStrategy) {
    lines.push(`- Checkpoint rule: ${workflowProfile.checkpointStrategy}`);
  }

  lines.push(...buildContinuityGuidance({ startResult }));

  if (preflightSummary?.tool) {
    lines.push(`- Preflight: ${preflightSummary.tool}`);
  }

  if (preflightSummary?.topFiles?.length) {
    lines.push(`- Focus files: ${preflightSummary.topFiles.join(', ')}`);
  }

  if (preflightSummary?.hints?.length) {
    lines.push(`- Signals: ${preflightSummary.hints.map((hint) => truncate(hint, 120)).join(' | ')}`);
  }

  return lines.join('\n');
};

export const buildWorkflowPolicyPayload = ({ commandName, workflowProfile, preflightSummary }) => ({
  commandName,
  label: workflowProfile.label,
  policyMode: workflowProfile.policyMode,
  intent: workflowProfile.workflowIntent,
  specialized: workflowProfile.specialized,
  nextTools: [...workflowProfile.nextTools],
  checkpointStrategy: workflowProfile.checkpointStrategy,
  preflight: preflightSummary,
});

export const extractNextStep = (value) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }

  const explicitMatch = normalized.match(new RegExp(
    `(?:next step|siguiente paso)\\s*[:\\-]\\s*([^.;\\n]{${MIN_NEXT_STEP_LENGTH},${MAX_NEXT_STEP_CAPTURE_LENGTH}})`,
    'i',
  ));
  if (explicitMatch?.[1]) {
    return truncate(explicitMatch[1], MAX_NEXT_STEP_LENGTH);
  }

  return '';
};

export const buildTaskRunnerAutomaticity = ({
  isWorkflowCommand = false,
  startResult = null,
  endResult = null,
  workflowPolicy = null,
  usedWrapper = false,
  overheadTokens = 0,
  managedByBaseOrchestrator = false,
}) => {
  const safeOverheadTokens = Number.isFinite(overheadTokens) ? Math.max(0, overheadTokens) : 0;
  const checkpointPersisted = Boolean(endResult && !endResult.checkpoint?.skipped && !endResult.checkpoint?.blocked);

  return {
    managedByBaseOrchestrator,
    autoStartTriggered: isWorkflowCommand && Boolean(startResult),
    autoPreflightTriggered: isWorkflowCommand && Boolean(workflowPolicy?.preflight?.tool),
    autoCheckpointTriggered: checkpointPersisted,
    autoWrappedPrompt: usedWrapper && safeOverheadTokens > 0,
    isolatedSession: Boolean(startResult?.isolatedSession),
    contextOverheadTokens: safeOverheadTokens,
  };
};
