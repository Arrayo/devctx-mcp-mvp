import { persistMetrics } from './metrics.js';
import { countTokens } from './tokenCounter.js';
import { runHeadlessWrapper } from './orchestration/headless-wrapper.js';
import { smartDoctor } from './tools/smart-doctor.js';
import { smartStatus } from './tools/smart-status.js';
import { smartSummary } from './tools/smart-summary.js';
import { smartTurn } from './tools/smart-turn.js';
import {
  RUNNER_COMMANDS,
  WORKFLOW_COMMANDS,
  WORKFLOW_DEFINITIONS,
  buildCleanupPlan,
  buildRunnerBlockedResult,
  buildWorkflowPrompt,
  evaluateRunnerGate,
} from './task-runner/policy.js';

const START_MAX_TOKENS = 350;
const END_MAX_TOKENS = 350;

const normalizeWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const recordRunnerMetrics = async ({
  commandName,
  client,
  result,
  usedWrapper = false,
  blocked = false,
  doctorIssued = false,
}) => {
  await persistMetrics({
    tool: 'task_runner',
    action: commandName,
    sessionId: result?.sessionId ?? result?.start?.sessionId ?? null,
    rawTokens: 0,
    compressedTokens: countTokens(JSON.stringify(result ?? {})),
    savedTokens: 0,
    savingsPct: 0,
    metadata: {
      client,
      usedWrapper,
      blocked,
      doctorIssued,
    },
    timestamp: new Date().toISOString(),
  });
};

const runWorkflowCommand = async ({
  commandName,
  client,
  prompt,
  sessionId,
  event,
  stdinPrompt = false,
  dryRun = false,
  streamOutput = false,
  command = '',
  args = [],
  runCommand,
  allowDegraded = false,
}) => {
  const effectivePrompt = buildWorkflowPrompt({
    commandName,
    prompt,
  });

  const start = await smartTurn({
    phase: 'start',
    sessionId,
    prompt: effectivePrompt,
    ensureSession: true,
    maxTokens: START_MAX_TOKENS,
  });

  const gate = evaluateRunnerGate({ startResult: start });
  if (gate.requiresDoctor && !allowDegraded) {
    const doctor = await smartDoctor();
    const blockedResult = buildRunnerBlockedResult({
      commandName,
      client,
      prompt: effectivePrompt,
      startResult: start,
      gate,
      doctorResult: doctor,
      allowDegraded,
    });
    await recordRunnerMetrics({
      commandName,
      client,
      result: blockedResult,
      usedWrapper: false,
      blocked: true,
      doctorIssued: true,
    });
    return blockedResult;
  }

  const wrapperResult = await runHeadlessWrapper({
    client,
    prompt: effectivePrompt,
    command,
    args,
    sessionId: start.sessionId ?? sessionId,
    event: event ?? WORKFLOW_DEFINITIONS[commandName]?.defaultEvent,
    stdinPrompt,
    dryRun,
    streamOutput,
    runCommand,
    preparedStartResult: start,
  });

  const result = {
    success: true,
    ...wrapperResult,
    command: commandName,
    client,
    prompt: effectivePrompt,
    gate,
  };

  await recordRunnerMetrics({
    commandName,
    client,
    result,
    usedWrapper: true,
    blocked: false,
    doctorIssued: false,
  });
  return result;
};

const runDoctorCommand = async ({ verifyIntegrity = true, client }) => {
  const result = await smartDoctor({ verifyIntegrity });
  await recordRunnerMetrics({
    commandName: 'doctor',
    client,
    result,
    usedWrapper: false,
    blocked: result.overall === 'error',
    doctorIssued: true,
  });
  return result;
};

const runStatusCommand = async ({ format = 'compact', maxItems = 10, client }) => {
  const result = await smartStatus({ format, maxItems });
  await recordRunnerMetrics({
    commandName: 'status',
    client,
    result,
  });
  return result;
};

const runCheckpointCommand = async ({
  client,
  sessionId,
  event = 'milestone',
  update = {},
}) => {
  const result = await smartTurn({
    phase: 'end',
    sessionId,
    event,
    update,
    maxTokens: END_MAX_TOKENS,
  });
  await recordRunnerMetrics({
    commandName: 'checkpoint',
    client,
    result,
  });
  return result;
};

const runCleanupCommand = async ({
  client,
  cleanupMode = 'compact',
  apply = false,
  retentionDays = 30,
  keepLatestEventsPerSession = 20,
  keepLatestMetrics = 1000,
  vacuum = false,
}) => {
  const plan = buildCleanupPlan({
    mode: cleanupMode,
    apply,
    retentionDays,
    keepLatestEventsPerSession,
    keepLatestMetrics,
    vacuum,
  });

  if (cleanupMode === 'legacy') {
    const result = await smartSummary({
      action: 'cleanup_legacy',
      apply,
    });
    const payload = {
      command: 'cleanup',
      cleanupMode,
      plan,
      result,
    };
    await recordRunnerMetrics({
      commandName: 'cleanup',
      client,
      result: payload,
    });
    return payload;
  }

  if (cleanupMode === 'all') {
    const compact = await smartSummary({
      action: 'compact',
      retentionDays,
      keepLatestEventsPerSession,
      keepLatestMetrics,
      vacuum,
    });
    const legacy = await smartSummary({
      action: 'cleanup_legacy',
      apply,
    });
    const payload = {
      command: 'cleanup',
      cleanupMode,
      plan,
      result: {
        compact,
        legacy,
      },
    };
    await recordRunnerMetrics({
      commandName: 'cleanup',
      client,
      result: payload,
    });
    return payload;
  }

  const result = await smartSummary({
    action: 'compact',
    retentionDays,
    keepLatestEventsPerSession,
    keepLatestMetrics,
    vacuum,
  });
  const payload = {
    command: 'cleanup',
    cleanupMode,
    plan,
    result,
  };
  await recordRunnerMetrics({
    commandName: 'cleanup',
    client,
    result: payload,
  });
  return payload;
};

export const runTaskRunner = async ({
  commandName = 'task',
  client = 'generic',
  prompt = '',
  sessionId,
  event,
  stdinPrompt = false,
  dryRun = false,
  streamOutput = false,
  command = '',
  args = [],
  runCommand,
  allowDegraded = false,
  verifyIntegrity = true,
  format = 'compact',
  maxItems = 10,
  cleanupMode = 'compact',
  apply = false,
  retentionDays = 30,
  keepLatestEventsPerSession = 20,
  keepLatestMetrics = 1000,
  vacuum = false,
  update = {},
} = {}) => {
  if (!RUNNER_COMMANDS.includes(commandName)) {
    throw new Error(`Unsupported task-runner command: ${commandName}`);
  }

  if (WORKFLOW_COMMANDS.has(commandName)) {
    return runWorkflowCommand({
      commandName,
      client,
      prompt,
      sessionId,
      event,
      stdinPrompt,
      dryRun,
      streamOutput,
      command,
      args,
      runCommand,
      allowDegraded,
    });
  }

  if (commandName === 'doctor') {
    return runDoctorCommand({ verifyIntegrity, client });
  }

  if (commandName === 'status') {
    return runStatusCommand({ format, maxItems, client });
  }

  if (commandName === 'checkpoint') {
    return runCheckpointCommand({
      client,
      sessionId,
      event,
      update,
    });
  }

  if (commandName === 'cleanup') {
    return runCleanupCommand({
      client,
      cleanupMode,
      apply,
      retentionDays,
      keepLatestEventsPerSession,
      keepLatestMetrics,
      vacuum,
    });
  }

  throw new Error(`Command not implemented: ${commandName}`);
};
