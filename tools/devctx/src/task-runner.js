import { setTimeout as delay } from 'node:timers/promises';
import { persistMetrics } from './metrics.js';
import { countTokens } from './tokenCounter.js';
import { projectRoot } from './utils/paths.js';
import { TASK_RUNNER_QUALITY_ANALYTICS_KIND } from './analytics/product-quality.js';
import { runHeadlessWrapper } from './orchestration/headless-wrapper.js';
import { smartContext } from './tools/smart-context.js';
import { smartDoctor } from './tools/smart-doctor.js';
import { smartSearch } from './tools/smart-search.js';
import { smartStatus } from './tools/smart-status.js';
import { smartSummary } from './tools/smart-summary.js';
import { smartTurn } from './tools/smart-turn.js';
import {
  RUNNER_COMMANDS,
  SPECIALIZED_WORKFLOW_COMMANDS,
  WORKFLOW_COMMANDS,
  WORKFLOW_DEFINITIONS,
  buildCleanupPlan,
  buildWorkflowPolicyProfile,
  buildRunnerBlockedResult,
  buildWorkflowPrompt,
  evaluateRunnerGate,
} from './task-runner/policy.js';

const START_MAX_TOKENS = 350;
const END_MAX_TOKENS = 350;
const RUNNER_LOCK_RETRY_ATTEMPTS = 3;
const RUNNER_LOCK_RETRY_DELAY_MS = 100;

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

const asArray = (value) => Array.isArray(value) ? value : [];
const uniqueCompact = (values) => [...new Set(asArray(values).map((value) => normalizeWhitespace(value)).filter(Boolean))];
const extractContextTopFiles = (topFiles) => uniqueCompact(asArray(topFiles).map((item) => {
  if (typeof item === 'string') {
    return item;
  }

  return item?.file ?? item?.path ?? '';
})).slice(0, 3);

const extractPreflightTopFiles = (preflightResult) => {
  if (!preflightResult) {
    return [];
  }

  if (preflightResult.tool === 'smart_context') {
    return uniqueCompact(asArray(preflightResult.result?.context).map((item) => item?.file).filter(Boolean)).slice(0, 3);
  }

  if (preflightResult.tool === 'smart_search') {
    return extractContextTopFiles(preflightResult.result?.topFiles);
  }

  return [];
};

const extractPreflightHints = (preflightResult) => {
  if (!preflightResult) {
    return [];
  }

  if (preflightResult.tool === 'smart_context') {
    return uniqueCompact(preflightResult.result?.hints).slice(0, 2);
  }

  if (preflightResult.tool === 'smart_search') {
    const totalMatches = Number(preflightResult.result?.totalMatches ?? 0);
    if (totalMatches > 0) {
      return [`${totalMatches} search match(es) surfaced for the workflow target`];
    }
  }

  return [];
};

const buildPreflightSummary = (preflightResult) => {
  if (!preflightResult) {
    return null;
  }

  const topFiles = extractPreflightTopFiles(preflightResult);
  const hints = extractPreflightHints(preflightResult);

  return {
    tool: preflightResult.tool,
    topFiles,
    hints,
    totalMatches: Number(preflightResult.result?.totalMatches ?? 0),
  };
};

const buildPreflightTask = ({ workflowProfile, prompt, startResult }) => {
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

const runWorkflowPreflight = async ({ workflowProfile, prompt, startResult }) => {
  const preflight = workflowProfile.preflight;
  if (!preflight) {
    return null;
  }

  const preflightTask = buildPreflightTask({ workflowProfile, prompt, startResult });

  if (preflight.tool === 'smart_context') {
    const result = await smartContext({
      task: preflightTask,
      detail: preflight.detail ?? 'minimal',
      include: preflight.include ?? ['hints'],
      maxTokens: preflight.maxTokens ?? 1200,
    });
    return {
      tool: 'smart_context',
      request: {
        task: preflightTask,
        detail: preflight.detail ?? 'minimal',
        include: preflight.include ?? ['hints'],
        maxTokens: preflight.maxTokens ?? 1200,
      },
      result,
    };
  }

  if (preflight.tool === 'smart_search') {
    const result = await smartSearch({
      query: preflightTask,
      intent: preflight.intent ?? workflowProfile.workflowIntent,
    });
    return {
      tool: 'smart_search',
      request: {
        query: preflightTask,
        intent: preflight.intent ?? workflowProfile.workflowIntent,
      },
      result,
    };
  }

  return null;
};

const buildContinuityGuidance = ({ startResult }) => {
  const continuityState = startResult?.continuity?.state ?? 'unknown';
  const lines = [
    `- Continuity: ${continuityState}`,
  ];
  const nextStep = normalizeWhitespace(startResult?.summary?.nextStep);
  const currentFocus = normalizeWhitespace(startResult?.summary?.currentFocus);
  const refreshedTopFiles = extractContextTopFiles(startResult?.refreshedContext?.topFiles);
  const recommendedNextTools = asArray(startResult?.recommendedPath?.nextTools)
    .map((tool) => normalizeWhitespace(tool))
    .filter(Boolean)
    .slice(0, 3);

  if (currentFocus) {
    lines.push(`- Persisted focus: ${truncate(currentFocus, 140)}`);
  }

  if (nextStep) {
    lines.push(`- Persisted next step: ${truncate(nextStep, 140)}`);
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

const buildWorkflowPromptWithPolicy = ({ prompt, workflowProfile, preflightSummary, startResult }) => {
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

const buildWorkflowPolicyPayload = ({ commandName, workflowProfile, preflightSummary }) => ({
  commandName,
  label: workflowProfile.label,
  policyMode: workflowProfile.policyMode,
  intent: workflowProfile.workflowIntent,
  specialized: workflowProfile.specialized,
  nextTools: [...workflowProfile.nextTools],
  checkpointStrategy: workflowProfile.checkpointStrategy,
  preflight: preflightSummary,
});

const isRetriableLockError = (error) => {
  const issue = error?.storageHealth?.issue ?? error?.cause?.storageHealth?.issue ?? null;
  const retriable = error?.storageHealth?.retriable ?? error?.cause?.storageHealth?.retriable ?? false;
  const message = String(error?.message ?? error?.cause?.message ?? error ?? '');
  return retriable || issue === 'locked' || /database is locked|database table is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(message);
};

const withRunnerLockRetry = async (operation) => {
  for (let attempt = 1; attempt <= RUNNER_LOCK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetriableLockError(error) || attempt === RUNNER_LOCK_RETRY_ATTEMPTS) {
        throw error;
      }

      await delay(RUNNER_LOCK_RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error('Task runner lock retry exhausted unexpectedly.');
};

const recordRunnerMetrics = async ({
  commandName,
  client,
  result,
  usedWrapper = false,
  blocked = false,
  doctorIssued = false,
}) => {
  const startResult = result?.start ?? result?.startResult ?? null;
  const endResult = result?.end ?? (result?.phase === 'end' ? result : null);
  const workflowPolicy = result?.workflowPolicy ?? null;
  const preflight = workflowPolicy?.preflight ?? null;
  const mutationBlocked = Boolean(result?.mutationSafety?.blocked ?? startResult?.mutationSafety?.blocked ?? endResult?.mutationSafety?.blocked);
  const storageIssue = result?.storageHealth?.issue ?? startResult?.storageHealth?.issue ?? endResult?.storageHealth?.issue ?? 'ok';
  const recommendedPathMode = result?.recommendedPath?.mode
    ?? startResult?.recommendedPath?.mode
    ?? endResult?.recommendedPath?.mode
    ?? null;
  const checkpointPersisted = Boolean(endResult && !endResult.checkpoint?.skipped && !endResult.checkpoint?.blocked);
  const checkpointSkipped = Boolean(endResult?.checkpoint?.skipped);

  await persistMetrics({
    tool: 'task_runner',
    action: commandName,
    sessionId: result?.sessionId ?? result?.start?.sessionId ?? null,
    rawTokens: 0,
    compressedTokens: countTokens(JSON.stringify(result ?? {})),
    savedTokens: 0,
    savingsPct: 0,
    metadata: {
      analyticsKind: TASK_RUNNER_QUALITY_ANALYTICS_KIND,
      client,
      usedWrapper,
      blocked,
      doctorIssued,
      dryRun: Boolean(result?.dryRun),
      allowDegraded: Boolean(result?.allowDegraded),
      isWorkflowCommand: WORKFLOW_COMMANDS.has(commandName),
      specializedWorkflow: SPECIALIZED_WORKFLOW_COMMANDS.has(commandName),
      workflowIntent: workflowPolicy?.intent ?? null,
      workflowPolicyMode: workflowPolicy?.policyMode ?? null,
      workflowNextToolsCount: workflowPolicy?.nextTools?.length ?? 0,
      workflowHasCheckpointRule: Boolean(workflowPolicy?.checkpointStrategy),
      workflowPreflightTool: preflight?.tool ?? null,
      workflowPreflightTopFiles: preflight?.topFiles?.length ?? 0,
      workflowPreflightHints: preflight?.hints?.length ?? 0,
      continuityState: startResult?.continuity?.state ?? null,
      mutationBlocked,
      storageIssue,
      recommendedPathMode,
      checkpointPersisted,
      checkpointSkipped,
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
  const requestedPrompt = buildWorkflowPrompt({
    commandName,
    prompt,
  });
  const workflowProfile = buildWorkflowPolicyProfile({ commandName });

  const start = await withRunnerLockRetry(() => smartTurn({
    phase: 'start',
    sessionId,
    prompt: requestedPrompt,
    ensureSession: true,
    maxTokens: START_MAX_TOKENS,
  }));

  const gate = evaluateRunnerGate({ startResult: start });
  let preflightSummary = null;

  if (!gate.requiresDoctor || allowDegraded) {
    const preflightResult = await runWorkflowPreflight({
      workflowProfile,
      prompt: requestedPrompt,
      startResult: start,
    });
    preflightSummary = buildPreflightSummary(preflightResult);
  }

  const workflowPolicy = buildWorkflowPolicyPayload({
    commandName,
    workflowProfile,
    preflightSummary,
  });
  const effectivePrompt = buildWorkflowPromptWithPolicy({
    prompt: requestedPrompt,
    workflowProfile,
    preflightSummary,
    startResult: start,
  });

  if (gate.requiresDoctor && !allowDegraded) {
    const doctor = await withRunnerLockRetry(() => smartDoctor());
    const blockedResult = buildRunnerBlockedResult({
      commandName,
      client,
      prompt: effectivePrompt,
      startResult: start,
      gate,
      doctorResult: doctor,
      allowDegraded,
      workflowPolicy,
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
    usedWrapper: true,
    ...wrapperResult,
    command: commandName,
    client,
    prompt: effectivePrompt,
    requestedPrompt,
    gate,
    workflowPolicy,
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
  const result = await withRunnerLockRetry(() => smartDoctor({ verifyIntegrity }));
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
  const result = await withRunnerLockRetry(() => smartStatus({ format, maxItems }));
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
  const result = await withRunnerLockRetry(() => smartTurn({
    phase: 'end',
    sessionId,
    event,
    update,
    maxTokens: END_MAX_TOKENS,
  }));
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
    const dryRun = await smartSummary({
      action: 'cleanup_legacy',
      apply: false,
    });

    if (!apply) {
      const eligibleFiles = [];

      if (dryRun.sessions?.candidates) {
        for (const session of dryRun.sessions.candidates) {
          if (session.deletable) {
            eligibleFiles.push({
              relativePath: session.relativePath || session.path,
              sizeBytes: session.sizeBytes || 0,
            });
          }
        }
      }

      if (dryRun.metrics?.eligible && dryRun.metrics?.path) {
        eligibleFiles.push({
          relativePath: dryRun.metrics.path.replace(projectRoot + '/', ''),
          sizeBytes: dryRun.metrics.sizeBytes || 0,
        });
      }

      if (dryRun.activeSession?.eligible && dryRun.activeSession?.path) {
        eligibleFiles.push({
          relativePath: dryRun.activeSession.path.replace(projectRoot + '/', ''),
          sizeBytes: dryRun.activeSession.sizeBytes || 0,
        });
      }

      if (eligibleFiles.length > 0) {
        console.log('\n📋 Legacy files eligible for cleanup:\n');
        console.log('File                                      Size');
        console.log('─'.repeat(60));
        for (const file of eligibleFiles) {
          const sizeKB = file.sizeBytes ? `${(file.sizeBytes / 1024).toFixed(1)}KB` : 'N/A';
          console.log(`${file.relativePath.padEnd(42)} ${sizeKB}`);
        }
        const totalKB = eligibleFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0) / 1024;
        console.log('─'.repeat(60));
        console.log(`Total: ${eligibleFiles.length} files, ${totalKB.toFixed(1)}KB\n`);
        console.log('💡 To apply cleanup, run: smart-context-task cleanup --cleanup-mode legacy --apply\n');
      } else {
        console.log('\n✅ No legacy files eligible for cleanup.\n');
      }
    }

    const result = apply ? await smartSummary({ action: 'cleanup_legacy', apply: true }) : dryRun;
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
