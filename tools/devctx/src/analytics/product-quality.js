const roundPct = (value, total) =>
  total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;

export const PRODUCT_QUALITY_ANALYTICS_KIND = 'smart_turn_quality';
export const TASK_RUNNER_QUALITY_ANALYTICS_KIND = 'task_runner_quality';

const isProductQualityEntry = (entry) =>
  entry?.tool === 'smart_turn'
  && entry?.metadata?.analyticsKind === PRODUCT_QUALITY_ANALYTICS_KIND;

const isTaskRunnerQualityEntry = (entry) =>
  entry?.tool === 'task_runner'
  && entry?.metadata?.analyticsKind === TASK_RUNNER_QUALITY_ANALYTICS_KIND;

const roundAverage = (total, count) =>
  count > 0 ? Number((total / count).toFixed(1)) : 0;

const getMetricsClient = (entry) =>
  entry?.metadata?.adapterClient
  ?? entry?.metadata?.client
  ?? null;

const hasMeasuredClientAdapters = (stats) =>
  Number(stats?.clientAdapters?.clientsMeasured ?? 0) > 0;

const appendClientAdapterSignals = (lines, stats) => {
  if (!hasMeasuredClientAdapters(stats)) {
    return;
  }

  const clients = stats.clientAdapters.byClient;
  const lowestOverheadClient = clients.reduce((best, current) => {
    if (!best) {
      return current;
    }

    if (current.averageContextOverheadTokens < best.averageContextOverheadTokens) {
      return current;
    }

    if (current.averageContextOverheadTokens === best.averageContextOverheadTokens
      && current.client.localeCompare(best.client) < 0) {
      return current;
    }

    return best;
  }, null);
  const highestAutoStartClient = clients.reduce((best, current) => {
    if (!best) {
      return current;
    }

    if (current.autoStartCoveragePct > best.autoStartCoveragePct) {
      return current;
    }

    if (current.autoStartCoveragePct === best.autoStartCoveragePct
      && current.client.localeCompare(best.client) < 0) {
      return current;
    }

    return best;
  }, null);

  lines.push('Client Adapter Signals:');
  lines.push(`Clients measured:      ${stats.clientAdapters.clientsMeasured}`);
  lines.push(`Adapter events:        ${clients.reduce((total, client) => total + client.adapterEvents, 0)}`);
  lines.push(`Overhead total:        ${stats.clientAdapters.totalContextOverheadTokens} tokens`);
  if (lowestOverheadClient) {
    lines.push(`Lowest avg overhead:   ${lowestOverheadClient.client} (${lowestOverheadClient.averageContextOverheadTokens} tokens)`);
  }
  if (highestAutoStartClient) {
    lines.push(`Best auto-start rate:  ${highestAutoStartClient.client} (${highestAutoStartClient.autoStartCoveragePct}%)`);
  }
  lines.push('');

  for (const client of clients) {
    lines.push(`${client.client}:`);
    lines.push(`  Entries measured:    ${client.entriesMeasured}`);
    lines.push(`  Adapter coverage:    ${client.adapterEvents}/${client.entriesMeasured} (${client.adapterCoveragePct}%)`);
    lines.push(`  Base orchestrated:   ${client.baseOrchestratedEvents}/${client.entriesMeasured} (${client.baseOrchestratorCoveragePct}%)`);
    lines.push(`  Auto-started:        ${client.autoStartedEvents}/${client.entriesMeasured} (${client.autoStartCoveragePct}%)`);
    lines.push(`  Auto-preflighted:    ${client.autoPreflightedEvents}/${client.entriesMeasured} (${client.autoPreflightCoveragePct}%)`);
    lines.push(`  Auto-checkpointed:   ${client.autoCheckpointedEvents}/${client.entriesMeasured} (${client.autoCheckpointCoveragePct}%)`);
    lines.push(`  Context overhead:    ${client.contextOverheadTokens} tokens total (${client.averageContextOverheadTokens} avg)`);
    if (client.blockedEvents > 0) {
      lines.push(`  Blocked events:      ${client.blockedEvents}`);
    }
    lines.push('');
  }
};

const analyzeClientAdapterQuality = (entries = []) => {
  const clientEntries = entries.filter((entry) => Boolean(getMetricsClient(entry)));

  const byClient = [...clientEntries.reduce((acc, entry) => {
    const client = getMetricsClient(entry);
    const current = acc.get(client) ?? {
      client,
      entriesMeasured: 0,
      adapterEvents: 0,
      wrapperEvents: 0,
      taskRunnerEvents: 0,
      baseOrchestratedEvents: 0,
      autoStartedEvents: 0,
      autoPreflightedEvents: 0,
      autoCheckpointedEvents: 0,
      blockedEvents: 0,
      contextOverheadEntries: 0,
      contextOverheadTokens: 0,
    };

    const overheadTokens = Math.max(0, Number(entry.metadata?.overheadTokens ?? 0));
    current.entriesMeasured += 1;
    current.adapterEvents += entry.metadata?.managedByClientAdapter ? 1 : 0;
    current.wrapperEvents += entry.tool === 'agent_wrapper' ? 1 : 0;
    current.taskRunnerEvents += entry.tool === 'task_runner' ? 1 : 0;
    current.baseOrchestratedEvents += entry.metadata?.managedByBaseOrchestrator ? 1 : 0;
    current.autoStartedEvents += (entry.metadata?.autoStartTriggered || entry.metadata?.autoStarted) ? 1 : 0;
    current.autoPreflightedEvents += entry.metadata?.autoPreflightTriggered ? 1 : 0;
    current.autoCheckpointedEvents += (entry.metadata?.autoCheckpointTriggered || entry.metadata?.autoAppended) ? 1 : 0;
    current.blockedEvents += entry.metadata?.blocked ? 1 : 0;
    current.contextOverheadEntries += overheadTokens > 0 ? 1 : 0;
    current.contextOverheadTokens += overheadTokens;

    acc.set(client, current);
    return acc;
  }, new Map()).values()]
    .map((entry) => ({
      ...entry,
      averageContextOverheadTokens: roundAverage(entry.contextOverheadTokens, entry.contextOverheadEntries),
      adapterCoveragePct: roundPct(entry.adapterEvents, entry.entriesMeasured),
      baseOrchestratorCoveragePct: roundPct(entry.baseOrchestratedEvents, entry.entriesMeasured),
      autoStartCoveragePct: roundPct(entry.autoStartedEvents, entry.entriesMeasured),
      autoPreflightCoveragePct: roundPct(entry.autoPreflightedEvents, entry.entriesMeasured),
      autoCheckpointCoveragePct: roundPct(entry.autoCheckpointedEvents, entry.entriesMeasured),
    }))
    .sort((a, b) => a.client.localeCompare(b.client));

  return {
    clientsMeasured: byClient.length,
    entriesMeasured: clientEntries.length,
    totalContextOverheadTokens: byClient.reduce((total, entry) => total + entry.contextOverheadTokens, 0),
    byClient,
  };
};

const analyzeTaskRunnerQuality = (entries = []) => {
  const runnerEntries = entries.filter(isTaskRunnerQualityEntry);
  const workflowEntries = runnerEntries.filter((entry) => entry.metadata?.isWorkflowCommand);
  const specializedWorkflowEntries = workflowEntries.filter((entry) => entry.metadata?.specializedWorkflow);
  const specializedExecutableEntries = specializedWorkflowEntries.filter((entry) => !entry.metadata?.blocked);
  const blockedEntries = runnerEntries.filter((entry) => entry.metadata?.blocked);
  const doctorEntries = runnerEntries.filter((entry) => entry.metadata?.doctorIssued);
  const wrappedEntries = workflowEntries.filter((entry) => entry.metadata?.usedWrapper);
  const workflowPolicyEntries = workflowEntries.filter((entry) => entry.metadata?.workflowPolicyMode);
  const preflightEntries = specializedWorkflowEntries.filter((entry) => entry.metadata?.workflowPreflightTool);
  const blockedWithDoctor = blockedEntries.filter((entry) => entry.metadata?.doctorIssued);
  const checkpointEntries = runnerEntries.filter((entry) => entry.action === 'checkpoint');
  const persistedCheckpointEntries = checkpointEntries.filter((entry) => entry.metadata?.checkpointPersisted);
  const baseOrchestratedEntries = workflowEntries.filter((entry) => entry.metadata?.managedByBaseOrchestrator);
  const autoStartedEntries = workflowEntries.filter((entry) => entry.metadata?.autoStartTriggered);
  const autoPreflightEntries = workflowEntries.filter((entry) => entry.metadata?.autoPreflightTriggered);
  const autoCheckpointEntries = runnerEntries.filter((entry) => entry.metadata?.autoCheckpointTriggered);
  const isolatedWorkflowEntries = workflowEntries.filter((entry) => entry.metadata?.isolatedSession);
  const contextOverheadEntries = runnerEntries.filter((entry) => Number(entry.metadata?.contextOverheadTokens ?? 0) > 0);
  const contextOverheadTokens = runnerEntries.reduce(
    (total, entry) => total + Number(entry.metadata?.contextOverheadTokens ?? 0),
    0,
  );

  const commandBreakdown = [...runnerEntries.reduce((acc, entry) => {
    const key = entry.action ?? 'unknown';
    const current = acc.get(key) ?? {
      command: key,
      count: 0,
      blocked: 0,
      doctorIssued: 0,
      usedWrapper: 0,
      preflighted: 0,
    };
    current.count += 1;
    current.blocked += entry.metadata?.blocked ? 1 : 0;
    current.doctorIssued += entry.metadata?.doctorIssued ? 1 : 0;
    current.usedWrapper += entry.metadata?.usedWrapper ? 1 : 0;
    current.preflighted += entry.metadata?.workflowPreflightTool ? 1 : 0;
    acc.set(key, current);
    return acc;
  }, new Map()).values()].sort((a, b) => b.count - a.count || a.command.localeCompare(b.command));

  return {
    commandsMeasured: runnerEntries.length,
    workflowCommands: workflowEntries.length,
    specializedWorkflowCommands: specializedWorkflowEntries.length,
    blockedCommands: blockedEntries.length,
    doctorCommands: doctorEntries.length,
    dryRunCommands: runnerEntries.filter((entry) => entry.metadata?.dryRun).length,
    commandBreakdown,
    workflowPolicy: {
      coveredCommands: workflowPolicyEntries.length,
      preflightedCommands: preflightEntries.length,
      wrapperBackedCommands: wrappedEntries.length,
      coveragePct: roundPct(workflowPolicyEntries.length, workflowEntries.length),
      preflightCoveragePct: roundPct(preflightEntries.length, specializedWorkflowEntries.length),
      wrapperCoveragePct: roundPct(wrappedEntries.length, workflowEntries.length),
    },
    blockedState: {
      blockedCommands: blockedEntries.length,
      blockedWithDoctor: blockedWithDoctor.length,
      doctorCoveragePct: roundPct(blockedWithDoctor.length, blockedEntries.length),
    },
    checkpointing: {
      commandsMeasured: checkpointEntries.length,
      persistedCommands: persistedCheckpointEntries.length,
      persistenceRatePct: roundPct(persistedCheckpointEntries.length, checkpointEntries.length),
    },
    automaticity: {
      baseOrchestratedCommands: baseOrchestratedEntries.length,
      autoStartedCommands: autoStartedEntries.length,
      autoPreflightedCommands: autoPreflightEntries.length,
      autoCheckpointedCommands: autoCheckpointEntries.length,
      isolatedWorkflowCommands: isolatedWorkflowEntries.length,
      contextOverheadTokens,
      averageContextOverheadTokens: contextOverheadEntries.length > 0
        ? Number((contextOverheadTokens / contextOverheadEntries.length).toFixed(1))
        : 0,
      baseOrchestratorCoveragePct: roundPct(baseOrchestratedEntries.length, workflowEntries.length),
      autoStartCoveragePct: roundPct(autoStartedEntries.length, workflowEntries.length),
      autoPreflightCoveragePct: roundPct(autoPreflightEntries.length, workflowEntries.length),
    },
  };
};

export const analyzeProductQuality = (entries = []) => {
  const qualityEntries = entries.filter(isProductQualityEntry);
  const startEntries = qualityEntries.filter((entry) => entry.metadata?.phase === 'start');
  const endEntries = qualityEntries.filter((entry) => entry.metadata?.phase === 'end');

  const alignedStarts = startEntries.filter((entry) => entry.metadata?.continuityState === 'aligned').length;
  const reusableStarts = startEntries.filter((entry) => entry.metadata?.shouldReuseContext).length;
  const isolatedStarts = startEntries.filter((entry) => entry.metadata?.isolatedSession).length;
  const ambiguousStarts = startEntries.filter((entry) => entry.metadata?.continuityState === 'ambiguous_resume').length;
  const coldStarts = startEntries.filter((entry) => entry.metadata?.continuityState === 'cold_start').length;

  const blockedTurns = qualityEntries.filter((entry) => entry.metadata?.mutationBlocked).length;
  const blockedWithActions = qualityEntries.filter((entry) =>
    entry.metadata?.mutationBlocked && Number(entry.metadata?.recommendedActionsCount ?? 0) > 0
  ).length;

  const refreshedStarts = startEntries.filter((entry) => entry.metadata?.refreshedContext).length;
  const refreshedWithTopFiles = startEntries.filter((entry) => Number(entry.metadata?.refreshedTopFiles ?? 0) > 0).length;
  const indexRefreshedStarts = startEntries.filter((entry) => entry.metadata?.indexRefreshed).length;

  const persistedEnds = endEntries.filter((entry) => entry.metadata?.checkpointPersisted).length;
  const skippedEnds = endEntries.filter((entry) => entry.metadata?.checkpointSkipped).length;
  const blockedEnds = endEntries.filter((entry) => entry.metadata?.mutationBlocked).length;

  return {
    turnsMeasured: qualityEntries.length,
    startsMeasured: startEntries.length,
    endsMeasured: endEntries.length,
    continuityRecovery: {
      startsMeasured: startEntries.length,
      alignedStarts,
      reusableStarts,
      isolatedStarts,
      ambiguousStarts,
      coldStarts,
      alignmentRatePct: roundPct(alignedStarts, startEntries.length),
      reusableRatePct: roundPct(reusableStarts, startEntries.length),
    },
    blockedState: {
      turnsBlocked: blockedTurns,
      blockedStarts: qualityEntries.filter((entry) => entry.metadata?.phase === 'start' && entry.metadata?.mutationBlocked).length,
      blockedEnds,
      blockedWithRecommendedActions: blockedWithActions,
      remediationCoveragePct: roundPct(blockedWithActions, blockedTurns),
    },
    contextRefresh: {
      refreshedStarts,
      refreshedWithTopFiles,
      indexRefreshedStarts,
      topFileSignalRatePct: roundPct(refreshedWithTopFiles, refreshedStarts),
    },
    checkpointing: {
      endsMeasured: endEntries.length,
      persistedEnds,
      skippedEnds,
      blockedEnds,
      persistenceRatePct: roundPct(persistedEnds, endEntries.length),
    },
    clientAdapters: analyzeClientAdapterQuality(entries),
    taskRunner: analyzeTaskRunnerQuality(entries),
  };
};

export const hasProductQualitySignals = (stats) =>
  Boolean(stats)
  && (
    Number(stats.turnsMeasured ?? 0) > 0
    || Number(stats?.taskRunner?.commandsMeasured ?? 0) > 0
    || hasMeasuredClientAdapters(stats)
  );

export const formatProductQualityReport = (stats) => {
  const hasSmartTurn = Number(stats?.turnsMeasured ?? 0) > 0;
  const hasTaskRunner = Number(stats?.taskRunner?.commandsMeasured ?? 0) > 0;

  if (!hasProductQualitySignals(stats)) {
    return '';
  }

  const lines = [];
  lines.push('');
  lines.push('Product Quality Signals');
  lines.push('');

  if (hasSmartTurn) {
    lines.push('smart_turn orchestration:');
    lines.push(`Turns measured:        ${stats.turnsMeasured}`);
    lines.push(`Start turns:           ${stats.startsMeasured}`);
    lines.push(`End turns:             ${stats.endsMeasured}`);
    lines.push('');
    lines.push('Continuity Recovery:');
    lines.push(`Aligned starts:        ${stats.continuityRecovery.alignedStarts}/${stats.continuityRecovery.startsMeasured} (${stats.continuityRecovery.alignmentRatePct}%)`);
    lines.push(`Reusable starts:       ${stats.continuityRecovery.reusableStarts}/${stats.continuityRecovery.startsMeasured} (${stats.continuityRecovery.reusableRatePct}%)`);
    lines.push(`Isolated starts:       ${stats.continuityRecovery.isolatedStarts}`);
    lines.push(`Ambiguous resumes:     ${stats.continuityRecovery.ambiguousStarts}`);
    lines.push('');
    lines.push('Blocked-State Handling:');
    lines.push(`Blocked turns:         ${stats.blockedState.turnsBlocked}`);
    lines.push(`With remediation:      ${stats.blockedState.blockedWithRecommendedActions}/${stats.blockedState.turnsBlocked} (${stats.blockedState.remediationCoveragePct}%)`);
    lines.push('');
    lines.push('Context Refresh Signals:');
    lines.push(`Refreshed starts:      ${stats.contextRefresh.refreshedStarts}`);
    lines.push(`With top-file signal:  ${stats.contextRefresh.refreshedWithTopFiles}/${stats.contextRefresh.refreshedStarts} (${stats.contextRefresh.topFileSignalRatePct}%)`);
    lines.push(`Index refreshes:       ${stats.contextRefresh.indexRefreshedStarts}`);
    lines.push('');
    lines.push('Checkpointing:');
    lines.push(`Persisted ends:        ${stats.checkpointing.persistedEnds}/${stats.checkpointing.endsMeasured} (${stats.checkpointing.persistenceRatePct}%)`);
    lines.push(`Skipped ends:          ${stats.checkpointing.skippedEnds}`);
    lines.push(`Blocked ends:          ${stats.checkpointing.blockedEnds}`);
    lines.push('');
  }

  if (hasTaskRunner) {
    lines.push('task_runner workflows:');
    lines.push(`Commands measured:     ${stats.taskRunner.commandsMeasured}`);
    lines.push(`Workflow commands:     ${stats.taskRunner.workflowCommands}`);
    lines.push(`Specialized commands:  ${stats.taskRunner.specializedWorkflowCommands}`);
    lines.push(`Blocked commands:      ${stats.taskRunner.blockedCommands}`);
    lines.push(`Doctor commands:       ${stats.taskRunner.doctorCommands}`);
    lines.push('');
    lines.push('Workflow Policy Coverage:');
    lines.push(`Policy-backed:         ${stats.taskRunner.workflowPolicy.coveredCommands}/${stats.taskRunner.workflowCommands} (${stats.taskRunner.workflowPolicy.coveragePct}%)`);
    lines.push(`Preflighted:           ${stats.taskRunner.workflowPolicy.preflightedCommands}/${stats.taskRunner.specializedWorkflowCommands} (${stats.taskRunner.workflowPolicy.preflightCoveragePct}%)`);
    lines.push(`Wrapper-backed:        ${stats.taskRunner.workflowPolicy.wrapperBackedCommands}/${stats.taskRunner.workflowCommands} (${stats.taskRunner.workflowPolicy.wrapperCoveragePct}%)`);
    lines.push('');
    lines.push('Blocked-State Routing:');
    lines.push(`Blocked with doctor:   ${stats.taskRunner.blockedState.blockedWithDoctor}/${stats.taskRunner.blockedState.blockedCommands} (${stats.taskRunner.blockedState.doctorCoveragePct}%)`);
    lines.push('');
    lines.push('Automaticity:');
    lines.push(`Base orchestrated:     ${stats.taskRunner.automaticity.baseOrchestratedCommands}/${stats.taskRunner.workflowCommands} (${stats.taskRunner.automaticity.baseOrchestratorCoveragePct}%)`);
    lines.push(`Auto-started:          ${stats.taskRunner.automaticity.autoStartedCommands}/${stats.taskRunner.workflowCommands} (${stats.taskRunner.automaticity.autoStartCoveragePct}%)`);
    lines.push(`Auto-preflighted:      ${stats.taskRunner.automaticity.autoPreflightedCommands}/${stats.taskRunner.workflowCommands} (${stats.taskRunner.automaticity.autoPreflightCoveragePct}%)`);
    lines.push(`Auto-checkpointed:     ${stats.taskRunner.automaticity.autoCheckpointedCommands}`);
    lines.push(`Context overhead:      ${stats.taskRunner.automaticity.contextOverheadTokens} tokens total (${stats.taskRunner.automaticity.averageContextOverheadTokens} avg)`);
    lines.push('');
    lines.push('Checkpoint Commands:');
    lines.push(`Persisted checkpoints: ${stats.taskRunner.checkpointing.persistedCommands}/${stats.taskRunner.checkpointing.commandsMeasured} (${stats.taskRunner.checkpointing.persistenceRatePct}%)`);
    lines.push('');
  }

  appendClientAdapterSignals(lines, stats);

  lines.push('Notes:');
  lines.push('- These are measured orchestration signals, not direct answer-quality scores.');
  lines.push('- Context refresh usefulness is proxied by whether refreshed turns surfaced top-file signals.');
  lines.push('');
  return lines.join('\n');
};
