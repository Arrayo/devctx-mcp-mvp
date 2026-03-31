import { spawn } from 'node:child_process';
import { persistMetrics } from '../metrics.js';
import { countTokens } from '../tokenCounter.js';
import { smartSummary } from '../tools/smart-summary.js';
import { smartTurn } from '../tools/smart-turn.js';

const DEFAULT_EVENT = 'session_end';
const START_MAX_TOKENS = 350;
const END_MAX_TOKENS = 350;
const SAFE_CONTINUITY_STATES = new Set(['aligned', 'resume']);

const normalizeWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const truncate = (value, maxLength = 160) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return '';
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const extractNextStep = (value) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }

  const explicitMatch = normalized.match(/(?:next step|siguiente paso)\s*[:\-]\s*([^.;\n]{12,180})/i);
  if (explicitMatch?.[1]) {
    return truncate(explicitMatch[1], 150);
  }

  return '';
};

const buildMutationSafetyActionLines = (mutationSafety) =>
  (mutationSafety?.recommendedActions ?? [])
    .slice(0, 2)
    .map((action) => `Fix: ${truncate(action, 120)}`);

const buildRecommendedPathLines = (recommendedPath) => {
  if (!recommendedPath) {
    return [];
  }

  const lines = [];

  if (Array.isArray(recommendedPath.nextTools) && recommendedPath.nextTools.length > 0) {
    lines.push(`Next tools: ${recommendedPath.nextTools.slice(0, 3).join(' -> ')}`);
  }

  if (recommendedPath.steps?.[0]?.instruction) {
    lines.push(`Path: ${truncate(recommendedPath.steps[0].instruction, 120)}`);
  }

  return lines;
};

const buildContextLines = (startResult) => {
  const summary = startResult?.summary ?? {};
  const lines = [];

  if (startResult?.sessionId) {
    lines.push(`Persisted devctx session: ${startResult.sessionId}`);
  }

  if (summary.goal) {
    lines.push(`Goal: ${truncate(summary.goal, 120)}`);
  }

  if (summary.currentFocus) {
    lines.push(`Focus: ${truncate(summary.currentFocus, 120)}`);
  }

  if (summary.nextStep) {
    lines.push(`Next step: ${truncate(summary.nextStep, 120)}`);
  }

  if (startResult?.continuity?.reason) {
    lines.push(`Context status: ${truncate(startResult.continuity.reason, 120)}`);
  }

  if (startResult?.mutationSafety?.blocked) {
    lines.push(`Repo safety: ${truncate(startResult.mutationSafety.message, 120)}`);
    lines.push(...buildMutationSafetyActionLines(startResult.mutationSafety));
  }

  if (startResult?.refreshedContext?.indexRefreshed) {
    lines.push('Index refreshed for this prompt.');
  }

  if (startResult?.refreshedContext?.topFiles?.length) {
    lines.push(`Relevant files: ${startResult.refreshedContext.topFiles.map((item) => item.file).slice(0, 2).join(', ')}`);
  }

  lines.push(...buildRecommendedPathLines(startResult?.recommendedPath));

  return lines.slice(0, 8);
};

export const buildWrappedPrompt = ({ prompt, startResult }) => {
  const lines = buildContextLines(startResult);
  if (lines.length === 0) {
    return prompt;
  }

  return [
    'Use the persisted devctx project context below only if it is relevant to the user request.',
    ...lines.map((line) => `- ${line}`),
    '',
    'User request:',
    prompt,
  ].join('\n');
};

const buildFreshSessionUpdate = (prompt) => {
  const preview = truncate(prompt, 140);
  return {
    goal: truncate(prompt, 120),
    status: 'planning',
    currentFocus: preview,
    pinnedContext: [preview],
    nextStep: 'Inspect the relevant code, validate task boundaries, and checkpoint the first concrete milestone.',
  };
};

const ensureIsolatedSession = async ({ prompt, sessionId, startResult }) => {
  if (sessionId || !startResult?.sessionId) {
    return {
      startResult,
      isolated: Boolean(startResult?.isolatedSession),
      previousSessionId: startResult?.previousSessionId ?? null,
    };
  }

  if (startResult?.isolatedSession) {
    return {
      startResult,
      isolated: true,
      previousSessionId: startResult.previousSessionId ?? null,
    };
  }

  if (SAFE_CONTINUITY_STATES.has(startResult.continuity?.state ?? '')) {
    return {
      startResult,
      isolated: false,
    };
  }

  const created = await smartSummary({
    action: 'update',
    update: buildFreshSessionUpdate(prompt),
    maxTokens: START_MAX_TOKENS,
  });
  const isolatedStart = await smartTurn({
    phase: 'start',
    sessionId: created.sessionId,
    prompt,
    ensureSession: false,
    maxTokens: START_MAX_TOKENS,
  });

  return {
    startResult: isolatedStart,
    isolated: true,
    previousSessionId: startResult.sessionId,
  };
};

const runChildProcess = ({ command, args, env, stdinText, streamOutput }) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    if (streamOutput) {
      process.stdout.write(text);
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    if (streamOutput) {
      process.stderr.write(text);
    }
  });

  child.on('error', reject);
  child.on('close', (exitCode, signal) => resolve({ exitCode: exitCode ?? 0, signal, stdout, stderr }));

  if (stdinText) {
    child.stdin.end(stdinText);
  } else {
    child.stdin.end();
  }
});

const buildEndUpdate = ({ prompt, childResult }) => {
  const combinedOutput = [childResult.stdout, childResult.stderr].filter(Boolean).join('\n');
  const nextStep = extractNextStep(combinedOutput);
  const update = {
    currentFocus: truncate(prompt, 140),
  };

  if (nextStep) {
    update.nextStep = nextStep;
  } else if (childResult.exitCode === 0) {
    update.nextStep = 'Review the latest headless agent output and checkpoint any concrete file changes before continuing.';
  } else {
    update.status = 'blocked';
    update.whyBlocked = `Headless agent command exited with code ${childResult.exitCode}.`;
    update.nextStep = 'Review the headless agent stderr/output and rerun the command once the issue is fixed.';
  }

  return update;
};

const inferEndEvent = ({ requestedEvent, childResult }) => {
  if (requestedEvent) {
    return requestedEvent;
  }

  return childResult.exitCode === 0 ? DEFAULT_EVENT : 'blocker';
};

export const runHeadlessWrapper = async ({
  client = 'generic',
  prompt,
  command,
  args = [],
  sessionId,
  event,
  stdinPrompt = false,
  dryRun = false,
  streamOutput = false,
  runCommand = runChildProcess,
} = {}) => {
  if (!normalizeWhitespace(prompt)) {
    throw new Error('prompt is required');
  }

  if (!dryRun && !normalizeWhitespace(command)) {
    throw new Error('command is required unless dryRun=true');
  }

  const start = await smartTurn({
    phase: 'start',
    sessionId,
    prompt,
    ensureSession: true,
    maxTokens: START_MAX_TOKENS,
  });
  const sessionResolution = await ensureIsolatedSession({ prompt, sessionId, startResult: start });
  const effectiveStart = sessionResolution.startResult;
  const wrappedPrompt = buildWrappedPrompt({ prompt, startResult: effectiveStart });
  const overheadTokens = Math.max(0, countTokens(wrappedPrompt) - countTokens(prompt));

  await persistMetrics({
    tool: 'agent_wrapper',
    action: `${client}:start`,
    sessionId: effectiveStart.sessionId ?? null,
    rawTokens: 0,
    compressedTokens: 0,
    savedTokens: 0,
    savingsPct: 0,
    metadata: {
      isContextOverhead: overheadTokens > 0,
      overheadTokens,
      client,
      dryRun,
      isolatedSession: sessionResolution.isolated,
      previousSessionId: sessionResolution.previousSessionId ?? null,
    },
    timestamp: new Date().toISOString(),
  });

  const finalArgs = stdinPrompt ? [...args] : [...args, wrappedPrompt];
  if (dryRun) {
    return {
      client,
      dryRun: true,
      command,
      args: finalArgs,
      wrappedPrompt,
      overheadTokens,
      start: effectiveStart,
      sessionId: effectiveStart.sessionId ?? sessionId ?? null,
      isolatedSession: sessionResolution.isolated,
    };
  }

  const childResult = await runCommand({
    command,
    args: finalArgs,
    env: {
      ...process.env,
      DEVCTX_TURN_SESSION_ID: effectiveStart.sessionId ?? '',
      DEVCTX_TURN_CONTINUITY_STATE: effectiveStart.continuity?.state ?? '',
      DEVCTX_TURN_CONTEXT: wrappedPrompt,
    },
    stdinText: stdinPrompt ? wrappedPrompt : '',
    streamOutput,
  });

  const resolvedEvent = inferEndEvent({ requestedEvent: event, childResult });
  const end = await smartTurn({
    phase: 'end',
    sessionId: effectiveStart.sessionId ?? sessionId ?? undefined,
    event: resolvedEvent,
    update: buildEndUpdate({ prompt, childResult }),
    maxTokens: END_MAX_TOKENS,
  });

  await persistMetrics({
    tool: 'agent_wrapper',
    action: `${client}:end`,
    sessionId: effectiveStart.sessionId ?? null,
    rawTokens: 0,
    compressedTokens: 0,
    savedTokens: 0,
    savingsPct: 0,
    metadata: {
      client,
      exitCode: childResult.exitCode,
      event: resolvedEvent,
      isContextOverhead: false,
      overheadTokens: 0,
      isolatedSession: sessionResolution.isolated,
    },
    timestamp: new Date().toISOString(),
  });

  return {
    client,
    command,
    args: finalArgs,
    wrappedPrompt,
    overheadTokens,
    exitCode: childResult.exitCode,
    signal: childResult.signal,
    stdout: childResult.stdout,
    stderr: childResult.stderr,
    start: effectiveStart,
    end,
    sessionId: effectiveStart.sessionId ?? sessionId ?? null,
    isolatedSession: sessionResolution.isolated,
  };
};
