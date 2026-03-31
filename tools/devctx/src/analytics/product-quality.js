const roundPct = (value, total) =>
  total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;

export const PRODUCT_QUALITY_ANALYTICS_KIND = 'smart_turn_quality';

const isProductQualityEntry = (entry) =>
  entry?.tool === 'smart_turn'
  && entry?.metadata?.analyticsKind === PRODUCT_QUALITY_ANALYTICS_KIND;

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
  };
};

export const formatProductQualityReport = (stats) => {
  if (!stats || stats.turnsMeasured === 0) {
    return '';
  }

  const lines = [];
  lines.push('');
  lines.push('Product Quality Signals (Measured from smart_turn)');
  lines.push('');
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
  lines.push('Notes:');
  lines.push('- These are measured orchestration signals, not direct answer-quality scores.');
  lines.push('- Context refresh usefulness is proxied by whether refreshed turns surfaced top-file signals.');
  lines.push('');
  return lines.join('\n');
};
