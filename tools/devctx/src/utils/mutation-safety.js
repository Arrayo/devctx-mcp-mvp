import { HARD_BLOCK_REPO_SAFETY_REASONS } from '../repo-safety.js';

export const buildMutationSafety = (
  repoSafety,
  {
    subject = 'Project-local context writes',
  } = {},
) => {
  if (!repoSafety || repoSafety.available === false) {
    return null;
  }

  const blockedBy = HARD_BLOCK_REPO_SAFETY_REASONS
    .filter(([, field]) => repoSafety[field])
    .map(([reason]) => reason);
  const blocked = blockedBy.length > 0;
  const stateDbPath = repoSafety.stateDbPath ?? '.devctx/state.sqlite';

  return {
    blocked,
    blockedBy,
    stateDbPath,
    recommendedActions: repoSafety.recommendedActions ?? [],
    message: blocked
      ? `${subject} are blocked until git hygiene is fixed for ${stateDbPath}.`
      : `${subject} are allowed for ${stateDbPath}.`,
  };
};

export const buildDegradedMode = (
  {
    sideEffectsSuppressed = false,
    repoSafety,
    reason = 'repo_safety_blocked',
    mode = 'read_only_snapshot',
    impact = 'Write-side effects are paused while git hygiene is blocked.',
  } = {},
) => {
  if (!sideEffectsSuppressed) {
    return null;
  }

  const mutationSafety = buildMutationSafety(repoSafety);

  return {
    active: true,
    reason,
    mode,
    impact,
    blockedBy: mutationSafety?.blockedBy ?? [],
    recommendedActions: mutationSafety?.recommendedActions ?? repoSafety?.recommendedActions ?? [],
    message: mutationSafety?.blocked
      ? `${impact} Reads continue in degraded mode until repo safety is fixed.`
      : `${impact} Reads continue in degraded mode.`,
  };
};

export const attachSafetyMetadata = (
  result,
  {
    repoSafety = null,
    sideEffectsSuppressed = false,
    subject,
    degradedReason,
    degradedMode,
    degradedImpact,
  } = {},
) => {
  const mutationSafety = buildMutationSafety(repoSafety, { subject });
  const degraded = buildDegradedMode({
    sideEffectsSuppressed,
    repoSafety,
    reason: degradedReason,
    mode: degradedMode,
    impact: degradedImpact,
  });

  return {
    ...result,
    ...(mutationSafety ? { mutationSafety } : {}),
    repoSafety,
    sideEffectsSuppressed: Boolean(sideEffectsSuppressed),
    ...(degraded ? { degradedMode: degraded } : {}),
  };
};
