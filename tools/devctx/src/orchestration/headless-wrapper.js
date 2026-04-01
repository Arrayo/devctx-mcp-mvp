import { spawn } from 'node:child_process';
import {
  buildWrappedPrompt,
  computeContextOverhead,
  finalizeManagedRun,
  recordAgentWrapperMetric,
  resolveManagedStart,
} from './base-orchestrator.js';
import { normalizeWhitespace } from './policy/event-policy.js';

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
  preparedStartResult = null,
} = {}) => {
  if (!normalizeWhitespace(prompt)) {
    throw new Error('prompt is required');
  }

  if (!dryRun && !normalizeWhitespace(command)) {
    throw new Error('command is required unless dryRun=true');
  }

  const sessionResolution = await resolveManagedStart({
    prompt,
    sessionId,
    preparedStartResult,
    ensureSession: true,
    allowIsolation: true,
  });
  const effectiveStart = sessionResolution.startResult;
  const wrappedPrompt = buildWrappedPrompt({ prompt, startResult: effectiveStart });
  const overheadTokens = computeContextOverhead({ prompt, wrappedPrompt });

  await recordAgentWrapperMetric({
    phase: 'start',
    client,
    sessionId: effectiveStart.sessionId ?? null,
    dryRun,
    overheadTokens,
    isolatedSession: sessionResolution.isolated,
    previousSessionId: sessionResolution.previousSessionId ?? null,
    autoStarted: sessionResolution.autoStarted,
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

  const { resolvedEvent, endResult } = await finalizeManagedRun({
    prompt,
    childResult,
    sessionId: effectiveStart.sessionId ?? sessionId ?? undefined,
    requestedEvent: event,
  });

  await recordAgentWrapperMetric({
    phase: 'end',
    client,
    sessionId: effectiveStart.sessionId ?? null,
    isolatedSession: sessionResolution.isolated,
    exitCode: childResult.exitCode,
    event: resolvedEvent,
    autoStarted: sessionResolution.autoStarted,
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
    end: endResult,
    sessionId: effectiveStart.sessionId ?? sessionId ?? null,
    isolatedSession: sessionResolution.isolated,
  };
};
