const normalizeWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const truncate = (value, maxLength = 120) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return '';
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

export const CLIENT_CONTRACT_RULE_LINES = [
  'Treat smart_turn as the task entry point for non-trivial work.',
  'If smart_turn returns mutationSafety.blocked = true, stop write-heavy work, surface blockedBy, and follow recommendedActions before retrying persisted steps.',
  'If smart_turn or smart_doctor reports storageHealth.issue !== "ok", pause persisted context writes and remediate local state before continuing.',
  'Use smart_doctor when repo safety or SQLite health is unhealthy or unclear.',
  'Use workflow, continuity, recommendedPath, mutationSafety, and storageHealth as the current operational state for the task.',
];

export const buildMutationSafetyActionLines = (
  mutationSafety,
  {
    prefix = 'fix',
    maxLength = 110,
    maxItems = 2,
  } = {},
) =>
  (mutationSafety?.recommendedActions ?? [])
    .slice(0, maxItems)
    .map((action) => `${prefix}: ${truncate(action, maxLength)}`);

export const buildRecommendedPathLines = (
  recommendedPath,
  {
    includePath = true,
    maxLength = 110,
    nextToolsLabel = 'next tools',
    pathLabel = 'path',
  } = {},
) => {
  if (!recommendedPath) {
    return [];
  }

  const lines = [];

  if (Array.isArray(recommendedPath.nextTools) && recommendedPath.nextTools.length > 0) {
    lines.push(`${nextToolsLabel}: ${recommendedPath.nextTools.slice(0, 3).join(' -> ')}`);
  }

  if (includePath && recommendedPath.steps?.[0]?.instruction) {
    lines.push(`${pathLabel}: ${truncate(recommendedPath.steps[0].instruction, maxLength)}`);
  }

  return lines;
};

export const buildOperationalContextLines = (
  result,
  {
    sessionStart = false,
    maxLineLength = 110,
    maxLines = 7,
    maxChars = 420,
  } = {},
) => {
  const lines = [];
  const repoSafety = result?.repoSafety;
  const mutationSafety = result?.mutationSafety;
  const summary = result?.summary;
  const continuityState = result?.continuity?.state;
  const storageIssue = result?.storageHealth?.issue;

  if (result?.found && summary) {
    const label = sessionStart ? 'resume' : continuityState ?? 'resume';
    lines.push(`devctx ${label}: session ${result.sessionId}`);

    if (summary.goal) {
      lines.push(`goal: ${truncate(summary.goal, maxLineLength)}`);
    }

    if (summary.currentFocus) {
      lines.push(`focus: ${truncate(summary.currentFocus, maxLineLength)}`);
    }

    if (!mutationSafety?.blocked) {
      lines.push(...buildRecommendedPathLines(result?.recommendedPath, {
        includePath: true,
        maxLength: maxLineLength,
      }));
    }

    if (summary.nextStep) {
      lines.push(`next: ${truncate(summary.nextStep, maxLineLength)}`);
    }
  } else if (continuityState === 'ambiguous_resume') {
    lines.push('devctx: multiple persisted sessions matched this prompt.');
    if (result?.recommendedSessionId) {
      lines.push(`recommended session: ${result.recommendedSessionId}`);
    }
  } else if (result?.autoCreated && summary?.goal) {
    lines.push(`devctx new task session: ${truncate(summary.goal, maxLineLength)}`);
  }

  if (result?.continuity?.reason) {
    lines.push(`context status: ${truncate(result.continuity.reason, maxLineLength)}`);
  }

  if (mutationSafety?.blocked) {
    const reasons = mutationSafety.blockedBy?.join(' and ') || 'blocked';
    lines.push(`repo safety: ${mutationSafety.stateDbPath} is ${reasons}; context writes are blocked.`);
    lines.push(...buildRecommendedPathLines(result?.recommendedPath, {
      includePath: false,
      maxLength: maxLineLength,
    }));
    lines.push(...buildMutationSafetyActionLines(mutationSafety, {
      prefix: 'fix',
      maxLength: maxLineLength,
    }));
  } else if (repoSafety?.isTracked || repoSafety?.isStaged) {
    const reasons = [];
    if (repoSafety.isTracked) {
      reasons.push('tracked');
    }
    if (repoSafety.isStaged) {
      reasons.push('staged');
    }
    lines.push(`repo safety: .devctx/state.sqlite is ${reasons.join(' and ')}; context writes are blocked.`);
  }

  if (storageIssue && storageIssue !== 'ok') {
    lines.push(`storage health: ${storageIssue}`);
    lines.push('doctor: run smart_doctor before retrying persisted context writes.');
  }

  if (result?.refreshedContext?.indexRefreshed) {
    lines.push('context refresh: project index was refreshed for this prompt.');
  }

  if (result?.refreshedContext?.topFiles?.length > 0) {
    lines.push(`files: ${result.refreshedContext.topFiles.map((item) => item.file).slice(0, 2).join(', ')}`);
  }

  if (result?.refreshedContext?.hints?.[0]) {
    lines.push(`hint: ${truncate(result.refreshedContext.hints[0], maxLineLength)}`);
  }

  return lines.slice(0, maxLines).join('\n').slice(0, maxChars).trim() || null;
};
