import { countTokens } from '../tokenCounter.js';
import { persistMetrics } from '../metrics.js';
import { getRepoMutationSafety, getRepoSafety } from '../repo-safety.js';
import { attachSafetyMetadata, buildMutationSafety } from '../utils/mutation-safety.js';
import { recordToolUsage } from '../usage-feedback.js';
import { recordDecision, DECISION_REASONS, EXPECTED_BENEFITS } from '../decision-explainer.js';
import { recordDevctxOperation } from '../missed-opportunities.js';
import {
  ACTIVE_SESSION_SCOPE,
  SQLITE_SCHEMA_VERSION,
  cleanupLegacyState,
  compactState,
  deriveTaskId,
  getStateStorageHealth,
  importLegacyState,
  withStateDb,
  withStateDbSnapshot,
} from '../storage/sqlite.js';

const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_TOKENS = 500;
const VALID_STATUSES = new Set(['planning', 'in_progress', 'blocked', 'completed']);
const ACTIVE_STATUSES = new Set(['planning', 'in_progress', 'blocked']);
const DEFAULT_STATUS = 'in_progress';
const AUTO_RESUME_SESSION_ID = 'auto';
const AUTO_RESUME_RECENCY_GAP_MS = 12 * 60 * 60 * 1000;
const MAX_RESUME_CANDIDATES = 5;
const DEFAULT_CHECKPOINT_EVENT = 'manual';
const CHECKPOINT_FIELD_BASE_SCORE = {
  goal: 5,
  status: 4,
  pinnedContext: 4,
  unresolvedQuestions: 2,
  currentFocus: 2,
  whyBlocked: 4,
  completed: 2,
  decisions: 4,
  blockers: 4,
  nextStep: 4,
  touchedFiles: 1,
};
const CHECKPOINT_POLICY_BY_EVENT = {
  manual: {
    persistByDefault: true,
    minScore: 1,
    requiredChangedFields: [],
    reason: 'Manual checkpoint requested.',
  },
  milestone: {
    persistByDefault: true,
    minScore: 4,
    requiredChangedFields: ['completed', 'decisions', 'nextStep', 'touchedFiles', 'currentFocus', 'pinnedContext'],
    reason: 'Milestone checkpoints should persist durable progress.',
  },
  decision: {
    persistByDefault: true,
    minScore: 4,
    requiredChangedFields: ['decisions', 'pinnedContext', 'nextStep'],
    reason: 'Decision checkpoints should preserve rationale and next actions.',
  },
  blocker: {
    persistByDefault: true,
    minScore: 4,
    requiredChangedFields: ['status', 'blockers', 'whyBlocked', 'nextStep'],
    reason: 'Blocker checkpoints should preserve blocking context.',
  },
  status_change: {
    persistByDefault: true,
    minScore: 3,
    requiredChangedFields: ['status', 'nextStep', 'whyBlocked'],
    reason: 'Status changes should be checkpointed when state actually changes.',
  },
  file_change: {
    persistByDefault: true,
    minScore: 3,
    requiredChangedFields: ['touchedFiles', 'completed', 'nextStep'],
    reason: 'File-change checkpoints should persist only when work moved forward.',
  },
  task_switch: {
    persistByDefault: true,
    minScore: 4,
    requiredChangedFields: ['goal', 'currentFocus', 'nextStep', 'pinnedContext'],
    reason: 'Task switches should preserve the handoff state.',
  },
  task_complete: {
    persistByDefault: true,
    minScore: 5,
    requiredChangedFields: ['status', 'completed', 'decisions', 'nextStep'],
    reason: 'Task completion should leave a durable summary.',
  },
  session_end: {
    persistByDefault: true,
    minScore: 3,
    requiredChangedFields: ['nextStep', 'status', 'completed', 'decisions', 'touchedFiles'],
    reason: 'Session-end checkpoints should capture the latest restart point.',
  },
  read_only: {
    persistByDefault: false,
    minScore: Infinity,
    requiredChangedFields: [],
    reason: 'Read-only exploration should not persist by default.',
  },
  heartbeat: {
    persistByDefault: false,
    minScore: Infinity,
    requiredChangedFields: [],
    reason: 'Heartbeat checkpoints are intentionally suppressed.',
  },
};
const SUMMARY_WRITE_ACTIONS = new Set(['update', 'append', 'auto_append', 'checkpoint', 'reset', 'compact']);
const getTimestamp = (value, fallback = Date.now()) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoString = (value, fallback = new Date().toISOString()) => {
  const parsed = getTimestamp(value, NaN);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

const generateSessionId = (goal) => {
  const date = new Date().toISOString().split('T')[0];
  const slug = goal
    ? goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
    : 'session';
  return `${date}-${slug}`;
};

const normalizeTaskText = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const resolveTaskIdentity = ({ taskId, goal, branchName, worktreePath }) => {
  const canonicalGoal = typeof goal === 'string' ? goal.trim() : '';
  const resolvedBranchName = typeof branchName === 'string' && branchName.trim().length > 0 ? branchName.trim() : null;
  const resolvedWorktreePath = typeof worktreePath === 'string' && worktreePath.trim().length > 0 ? worktreePath.trim() : null;

  return {
    taskId: typeof taskId === 'string' && taskId.trim().length > 0
      ? taskId.trim()
      : deriveTaskId({
          goal: canonicalGoal,
          branchName: resolvedBranchName ?? '',
          worktreePath: resolvedWorktreePath ?? '',
        }),
    canonicalGoal,
    normalizedGoal: normalizeTaskText(canonicalGoal),
    branchName: resolvedBranchName,
    worktreePath: resolvedWorktreePath,
  };
};

const truncateString = (str, maxLength) => {
  if (!str || str.length <= maxLength) return str;
  if (maxLength <= 3) return '';
  return str.slice(0, maxLength - 3) + '...';
};

const normalizeStatus = (status, fallback = DEFAULT_STATUS) =>
  VALID_STATUSES.has(status) ? status : fallback;

const isMeaningfulString = (value) => typeof value === 'string' && value.trim().length > 0;

const compactFilePath = (filePath) => {
  if (!isMeaningfulString(filePath)) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3 && normalized.length <= 60) {
    return normalized;
  }

  const tail = parts.slice(-3).join('/');
  return normalized.length <= tail.length ? normalized : `.../${tail}`;
};

const validateUpdateInput = (update) => {
  if (!update || typeof update !== 'object') {
    throw new Error('update parameter is required for update/append/auto_append actions');
  }

  if (update.status !== undefined && !VALID_STATUSES.has(update.status)) {
    throw new Error(`Invalid status: ${update.status}. Valid statuses: planning, in_progress, blocked, completed`);
  }
};

const mergeUniqueStrings = (...lists) => {
  const seen = new Set();
  const result = [];

  for (const list of lists) {
    for (const item of list || []) {
      if (!isMeaningfulString(item) || seen.has(item)) {
        continue;
      }
      seen.add(item);
      result.push(item);
    }
  }

  return result;
};

const buildComparableSessionState = (data = {}) => ({
  taskId: typeof data.taskId === 'string' ? data.taskId : '',
  agentId: typeof data.agentId === 'string' ? data.agentId : '',
  goal: typeof data.goal === 'string' ? data.goal : '',
  status: normalizeStatus(data.status),
  branchName: typeof data.branchName === 'string' ? data.branchName : '',
  worktreePath: typeof data.worktreePath === 'string' ? data.worktreePath : '',
  pinnedContext: mergeUniqueStrings(data.pinnedContext),
  unresolvedQuestions: mergeUniqueStrings(data.unresolvedQuestions),
  currentFocus: typeof data.currentFocus === 'string' ? data.currentFocus : '',
  whyBlocked: typeof data.whyBlocked === 'string' ? data.whyBlocked : '',
  completed: mergeUniqueStrings(data.completed),
  decisions: mergeUniqueStrings(data.decisions),
  blockers: mergeUniqueStrings(data.blockers),
  nextStep: typeof data.nextStep === 'string' ? data.nextStep : '',
  touchedFiles: mergeUniqueStrings(data.touchedFiles),
});

const buildAppendData = (existingData, update) => {
  const completed = mergeUniqueStrings(existingData.completed, update.completed);
  const decisions = mergeUniqueStrings(existingData.decisions, update.decisions);
  const touchedFiles = mergeUniqueStrings(existingData.touchedFiles, update.touchedFiles);

  return {
    taskId: update.taskId || existingData.taskId || resolveTaskIdentity({
      goal: update.goal || existingData.goal || 'Untitled session',
      branchName: update.branchName || existingData.branchName,
      worktreePath: update.worktreePath || existingData.worktreePath,
    }).taskId,
    agentId: update.agentId || existingData.agentId || null,
    goal: update.goal || existingData.goal || 'Untitled session',
    status: normalizeStatus(update.status, normalizeStatus(existingData.status)),
    branchName: update.branchName || existingData.branchName || null,
    worktreePath: update.worktreePath || existingData.worktreePath || null,
    pinnedContext: mergeUniqueStrings(existingData.pinnedContext, update.pinnedContext),
    unresolvedQuestions: mergeUniqueStrings(existingData.unresolvedQuestions, update.unresolvedQuestions),
    currentFocus: update.currentFocus || existingData.currentFocus || '',
    whyBlocked: update.whyBlocked || existingData.whyBlocked || '',
    completed,
    decisions,
    blockers: update.blockers !== undefined ? mergeUniqueStrings(update.blockers) : (existingData.blockers || []),
    nextStep: update.nextStep || existingData.nextStep || '',
    touchedFiles,
    completedCount: completed.length,
    decisionsCount: decisions.length,
    touchedFilesCount: touchedFiles.length,
  };
};

const buildReplaceData = (update) => {
  const completed = mergeUniqueStrings(update.completed);
  const decisions = mergeUniqueStrings(update.decisions);
  const touchedFiles = mergeUniqueStrings(update.touchedFiles);

  return {
    taskId: update.taskId || resolveTaskIdentity({
      goal: update.goal || 'Untitled session',
      branchName: update.branchName,
      worktreePath: update.worktreePath,
    }).taskId,
    agentId: update.agentId || null,
    goal: update.goal || 'Untitled session',
    status: normalizeStatus(update.status),
    branchName: update.branchName ?? null,
    worktreePath: update.worktreePath ?? null,
    pinnedContext: mergeUniqueStrings(update.pinnedContext),
    unresolvedQuestions: mergeUniqueStrings(update.unresolvedQuestions),
    currentFocus: update.currentFocus ?? '',
    whyBlocked: update.whyBlocked ?? '',
    completed,
    decisions,
    blockers: mergeUniqueStrings(update.blockers),
    nextStep: update.nextStep ?? '',
    touchedFiles,
    completedCount: completed.length,
    decisionsCount: decisions.length,
    touchedFilesCount: touchedFiles.length,
  };
};

const diffUniqueStrings = (before, after) => {
  const seen = new Set(mergeUniqueStrings(before));
  return mergeUniqueStrings(after).filter((item) => !seen.has(item));
};

const getAutoAppendChanges = (existingData, mergedData) => {
  if (!existingData || Object.keys(existingData).length === 0) {
    return ['create_session'];
  }

  const comparableBefore = buildComparableSessionState(existingData);
  const comparableAfter = buildComparableSessionState(mergedData);
  const changes = [];

  if (comparableAfter.taskId !== comparableBefore.taskId) changes.push('taskId');
  if (comparableAfter.agentId !== comparableBefore.agentId) changes.push('agentId');
  if (comparableAfter.goal !== comparableBefore.goal) changes.push('goal');
  if (comparableAfter.status !== comparableBefore.status) changes.push('status');
  if (comparableAfter.branchName !== comparableBefore.branchName) changes.push('branchName');
  if (comparableAfter.worktreePath !== comparableBefore.worktreePath) changes.push('worktreePath');
  if (comparableAfter.currentFocus !== comparableBefore.currentFocus) changes.push('currentFocus');
  if (comparableAfter.whyBlocked !== comparableBefore.whyBlocked) changes.push('whyBlocked');
  if (comparableAfter.nextStep !== comparableBefore.nextStep) changes.push('nextStep');
  if (diffUniqueStrings(comparableBefore.pinnedContext, comparableAfter.pinnedContext).length > 0) changes.push('pinnedContext');
  if (diffUniqueStrings(comparableBefore.unresolvedQuestions, comparableAfter.unresolvedQuestions).length > 0) changes.push('unresolvedQuestions');
  if (diffUniqueStrings(comparableBefore.completed, comparableAfter.completed).length > 0) changes.push('completed');
  if (diffUniqueStrings(comparableBefore.decisions, comparableAfter.decisions).length > 0) changes.push('decisions');
  if (JSON.stringify(comparableAfter.blockers) !== JSON.stringify(comparableBefore.blockers)) changes.push('blockers');
  if (diffUniqueStrings(comparableBefore.touchedFiles, comparableAfter.touchedFiles).length > 0) changes.push('touchedFiles');

  return changes;
};

const analyzeCheckpointChanges = (existingData, mergedData) => {
  const changedFields = getAutoAppendChanges(existingData, mergedData);
  const comparableBefore = buildComparableSessionState(existingData);
  const comparableAfter = buildComparableSessionState(mergedData);
  const fieldStats = {};
  const scoreByField = {};
  let score = 0;

  const assignFieldScore = (field, nextScore) => {
    if (!changedFields.includes(field) || nextScore <= 0) {
      return;
    }

    scoreByField[field] = nextScore;
    score += nextScore;
  };

  if (changedFields.includes('goal')) {
    fieldStats.goal = {
      before: comparableBefore.goal,
      after: comparableAfter.goal,
    };
    assignFieldScore('goal', CHECKPOINT_FIELD_BASE_SCORE.goal);
  }

  if (changedFields.includes('status')) {
    const before = comparableBefore.status;
    const after = comparableAfter.status;
    const transitionBonus = (after === 'blocked' || after === 'completed' || before === 'blocked') ? 2 : 0;
    fieldStats.status = { before, after };
    assignFieldScore('status', CHECKPOINT_FIELD_BASE_SCORE.status + transitionBonus);
  }

  if (changedFields.includes('currentFocus')) {
    fieldStats.currentFocus = {
      before: comparableBefore.currentFocus,
      after: comparableAfter.currentFocus,
    };
    assignFieldScore('currentFocus', CHECKPOINT_FIELD_BASE_SCORE.currentFocus);
  }

  if (changedFields.includes('whyBlocked')) {
    fieldStats.whyBlocked = {
      before: comparableBefore.whyBlocked,
      after: comparableAfter.whyBlocked,
    };
    assignFieldScore('whyBlocked', CHECKPOINT_FIELD_BASE_SCORE.whyBlocked);
  }

  if (changedFields.includes('nextStep')) {
    fieldStats.nextStep = {
      before: comparableBefore.nextStep,
      after: comparableAfter.nextStep,
    };
    assignFieldScore('nextStep', CHECKPOINT_FIELD_BASE_SCORE.nextStep);
  }

  const arrayFields = [
    'pinnedContext',
    'unresolvedQuestions',
    'completed',
    'decisions',
    'blockers',
    'touchedFiles',
  ];

  for (const field of arrayFields) {
    if (!changedFields.includes(field)) {
      continue;
    }

    const added = diffUniqueStrings(comparableBefore[field], comparableAfter[field]);
    const removed = diffUniqueStrings(comparableAfter[field], comparableBefore[field]);
    fieldStats[field] = {
      added,
      addedCount: added.length,
      removedCount: removed.length,
    };

    let nextScore = CHECKPOINT_FIELD_BASE_SCORE[field] ?? 0;
    if (field === 'completed') nextScore += Math.min(2, Math.max(0, added.length - 1));
    if (field === 'decisions') nextScore += Math.min(2, Math.max(0, added.length - 1));
    if (field === 'pinnedContext') nextScore += Math.min(2, Math.max(0, added.length - 1));
    if (field === 'blockers') nextScore += Math.min(2, Math.max(0, added.length - 1));
    if (field === 'touchedFiles') nextScore = added.length >= 3 ? 3 : added.length >= 1 ? 1 : 0;
    if (field === 'unresolvedQuestions') nextScore += Math.min(1, Math.max(0, added.length - 1));

    assignFieldScore(field, nextScore);
  }

  return {
    changedFields,
    fieldStats,
    score,
    scoreByField,
  };
};

const hasMeaningfulAutoAppendInput = (update = {}) =>
  update.status !== undefined
  || Object.values(pruneEmptyFields(update)).some((value) =>
    (typeof value === 'string' && value.trim().length > 0)
    || (Array.isArray(value) && value.length > 0),
  );

const normalizeCheckpointEvent = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CHECKPOINT_POLICY_BY_EVENT[normalized] ? normalized : DEFAULT_CHECKPOINT_EVENT;
};

const resolveCheckpointDecision = ({ event, force = false, existingData, mergedData }) => {
  const normalizedEvent = normalizeCheckpointEvent(event);
  const policy = CHECKPOINT_POLICY_BY_EVENT[normalizedEvent];
  const analysis = analyzeCheckpointChanges(existingData, mergedData);
  const { changedFields, fieldStats, score, scoreByField } = analysis;

  if (force) {
    return {
      event: normalizedEvent,
      changedFields,
      fieldStats,
      score,
      scoreByField,
      threshold: policy.minScore,
      shouldPersist: true,
      reason: 'Checkpoint forced by caller.',
      policy,
    };
  }

  if (!policy.persistByDefault) {
    return {
      event: normalizedEvent,
      changedFields,
      fieldStats,
      score,
      scoreByField,
      threshold: policy.minScore,
      shouldPersist: false,
      reason: policy.reason,
      policy,
    };
  }

  if (changedFields.length === 0) {
    return {
      event: normalizedEvent,
      changedFields,
      fieldStats,
      score,
      scoreByField,
      threshold: policy.minScore,
      shouldPersist: false,
      reason: 'Checkpoint skipped because no meaningful context changed.',
      policy,
    };
  }

  if (policy.requiredChangedFields.length > 0) {
    const relevantChange = policy.requiredChangedFields.some((field) => changedFields.includes(field));
    if (!relevantChange) {
      return {
        event: normalizedEvent,
        changedFields,
        fieldStats,
        score,
        scoreByField,
        threshold: policy.minScore,
        shouldPersist: false,
        reason: `Checkpoint event "${normalizedEvent}" requires one of: ${policy.requiredChangedFields.join(', ')}.`,
        policy,
      };
    }
  }

  if (normalizedEvent === 'file_change' && changedFields.length === 1 && changedFields[0] === 'touchedFiles') {
    const addedFiles = fieldStats.touchedFiles?.addedCount ?? 0;
    if (addedFiles < 2) {
      return {
        event: normalizedEvent,
        changedFields,
        fieldStats,
        score,
        scoreByField,
        threshold: policy.minScore,
        shouldPersist: false,
        reason: 'Checkpoint skipped because a single touched file without progress is not significant enough.',
        policy,
      };
    }
  }

  if (normalizedEvent === 'task_complete') {
    const completedStateReached = mergedData.status === 'completed';
    if (!completedStateReached && !changedFields.includes('completed')) {
      return {
        event: normalizedEvent,
        changedFields,
        fieldStats,
        score,
        scoreByField,
        threshold: policy.minScore,
        shouldPersist: false,
        reason: 'Task completion checkpoints require completed work or a completed status.',
        policy,
      };
    }
  }

  if (score < policy.minScore) {
    return {
      event: normalizedEvent,
      changedFields,
      fieldStats,
      score,
      scoreByField,
      threshold: policy.minScore,
      shouldPersist: false,
      reason: `Checkpoint skipped because significance score ${score} is below threshold ${policy.minScore}.`,
      policy,
    };
  }

  return {
    event: normalizedEvent,
    changedFields,
    fieldStats,
    score,
    scoreByField,
    threshold: policy.minScore,
    shouldPersist: true,
    reason: policy.reason,
    policy,
  };
};

const uniqueTail = (items, limit) => mergeUniqueStrings(items || []).slice(-limit);
const uniqueHead = (items, limit) => mergeUniqueStrings(items || []).slice(0, limit);

const buildSummaryMetrics = (rawTokens, finalTokens) => ({
  rawTokens,
  finalTokens,
  compressedTokens: finalTokens,
  savedTokens: Math.max(0, rawTokens - finalTokens),
});

const pruneEmptyFields = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null || item === '') {
        return false;
      }
      if (Array.isArray(item) && item.length === 0) {
        return false;
      }
      return true;
    }),
  );

const parseJsonText = (value, fallback) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getSessionRow = (db, sessionId) => db.prepare(`
  SELECT
    session_id,
    goal,
    status,
    current_focus,
    why_blocked,
    next_step,
    task_id,
    agent_id,
    branch_name,
    worktree_path,
    pinned_context_json,
    unresolved_questions_json,
    blockers_json,
    snapshot_json,
    completed_count,
    decisions_count,
    touched_files_count,
    created_at,
    updated_at
  FROM sessions
  WHERE session_id = ?
`).get(sessionId);

const getActiveSessionId = (db) =>
  db.prepare(`
    SELECT session_id
    FROM active_session
    WHERE scope = ?
  `).get(ACTIVE_SESSION_SCOPE)?.session_id ?? null;

const getTaskRow = (db, taskId) => db.prepare(`
  SELECT
    task_id,
    project_scope,
    canonical_goal,
    normalized_goal,
    status,
    branch_name,
    worktree_path,
    last_session_id,
    created_at,
    updated_at
  FROM tasks
  WHERE task_id = ?
`).get(taskId);

const getTaskRowForSession = (db, sessionId) => db.prepare(`
  SELECT
    t.task_id,
    t.project_scope,
    t.canonical_goal,
    t.normalized_goal,
    t.status,
    t.branch_name,
    t.worktree_path,
    t.last_session_id,
    t.created_at,
    t.updated_at
  FROM tasks t
  JOIN sessions s ON s.task_id = t.task_id
  WHERE s.session_id = ?
`).get(sessionId);

const normalizeTaskRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    taskId: row.task_id,
    projectScope: row.project_scope,
    canonicalGoal: row.canonical_goal,
    normalizedGoal: row.normalized_goal,
    status: row.status,
    branchName: row.branch_name ?? null,
    worktreePath: row.worktree_path ?? null,
    lastSessionId: row.last_session_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const upsertTask = (db, {
  taskId,
  goal,
  status,
  branchName = null,
  worktreePath = null,
  lastSessionId = null,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
} = {}) => {
  const task = resolveTaskIdentity({ taskId, goal, branchName, worktreePath });
  db.prepare(`
    INSERT INTO tasks(
      task_id,
      project_scope,
      canonical_goal,
      normalized_goal,
      status,
      branch_name,
      worktree_path,
      last_session_id,
      created_at,
      updated_at
    )
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      canonical_goal = excluded.canonical_goal,
      normalized_goal = excluded.normalized_goal,
      status = excluded.status,
      branch_name = excluded.branch_name,
      worktree_path = excluded.worktree_path,
      last_session_id = excluded.last_session_id,
      updated_at = excluded.updated_at,
      created_at = tasks.created_at
  `).run(
    task.taskId,
    'project',
    task.canonicalGoal,
    task.normalizedGoal,
    normalizeStatus(status, 'planning'),
    task.branchName,
    task.worktreePath,
    lastSessionId,
    createdAt,
    updatedAt,
  );

  return normalizeTaskRow(getTaskRow(db, task.taskId));
};

const getLatestTaskHandoffRow = (db, taskId) => db.prepare(`
  SELECT
    handoff_id,
    task_id,
    session_id,
    from_agent_id,
    to_agent_id,
    trigger,
    summary_json,
    created_at
  FROM task_handoffs
  WHERE task_id = ?
  ORDER BY datetime(created_at) DESC, handoff_id DESC
  LIMIT 1
`).get(taskId);

const normalizeTaskHandoff = (row) => {
  if (!row) {
    return null;
  }

  return {
    handoffId: Number(row.handoff_id),
    taskId: row.task_id,
    sessionId: row.session_id ?? null,
    fromAgentId: row.from_agent_id ?? null,
    toAgentId: row.to_agent_id ?? null,
    trigger: row.trigger,
    summary: parseJsonText(row.summary_json, {}),
    createdAt: row.created_at,
  };
};

const hydrateSession = (row) => {
  if (!row) {
    return null;
  }

  const snapshot = parseJsonText(row.snapshot_json, {});
  const completed = mergeUniqueStrings(snapshot.completed);
  const decisions = mergeUniqueStrings(snapshot.decisions);
  const touchedFiles = mergeUniqueStrings(snapshot.touchedFiles);
  const pinnedContext = mergeUniqueStrings(parseJsonText(row.pinned_context_json, []), snapshot.pinnedContext);
  const unresolvedQuestions = mergeUniqueStrings(parseJsonText(row.unresolved_questions_json, []), snapshot.unresolvedQuestions);
  const blockers = mergeUniqueStrings(parseJsonText(row.blockers_json, []), snapshot.blockers);

  return {
    ...snapshot,
    schemaVersion: Number(snapshot.schemaVersion ?? 1),
    sessionId: row.session_id,
    taskId: row.task_id ?? snapshot.taskId ?? null,
    agentId: row.agent_id ?? snapshot.agentId ?? null,
    goal: typeof row.goal === 'string' ? row.goal : (snapshot.goal ?? ''),
    status: normalizeStatus(row.status, normalizeStatus(snapshot.status)),
    branchName: row.branch_name ?? snapshot.branchName ?? null,
    worktreePath: row.worktree_path ?? snapshot.worktreePath ?? null,
    currentFocus: typeof row.current_focus === 'string' ? row.current_focus : (snapshot.currentFocus ?? ''),
    whyBlocked: typeof row.why_blocked === 'string' ? row.why_blocked : (snapshot.whyBlocked ?? ''),
    nextStep: typeof row.next_step === 'string' ? row.next_step : (snapshot.nextStep ?? ''),
    pinnedContext,
    unresolvedQuestions,
    blockers,
    completed,
    decisions,
    touchedFiles,
    completedCount: Number.isInteger(row.completed_count) ? row.completed_count : completed.length,
    decisionsCount: Number.isInteger(row.decisions_count) ? row.decisions_count : decisions.length,
    touchedFilesCount: Number.isInteger(row.touched_files_count) ? row.touched_files_count : touchedFiles.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const buildSessionSummary = (session) => {
  const status = normalizeStatus(session.status);
  const whyBlocked = status === 'blocked'
    ? (isMeaningfulString(session.whyBlocked) ? session.whyBlocked : (session.blockers || []).find(isMeaningfulString))
    : undefined;
  const completed = mergeUniqueStrings(session.completed);
  const decisions = mergeUniqueStrings(session.decisions);
  const touchedFiles = mergeUniqueStrings(session.touchedFiles);

  return pruneEmptyFields({
    status,
    nextStep: isMeaningfulString(session.nextStep) ? session.nextStep : undefined,
    pinnedContext: uniqueHead(session.pinnedContext, 3),
    unresolvedQuestions: uniqueHead(session.unresolvedQuestions, 3),
    currentFocus: isMeaningfulString(session.currentFocus) ? session.currentFocus : undefined,
    whyBlocked,
    goal: isMeaningfulString(session.goal) ? session.goal : undefined,
    recentCompleted: uniqueTail(completed, 3),
    keyDecisions: uniqueTail(decisions, 2),
    hotFiles: uniqueTail(touchedFiles.map(compactFilePath), 5),
    completedCount: session.completedCount ?? completed.length,
    decisionsCount: session.decisionsCount ?? decisions.length,
    touchedFilesCount: session.touchedFilesCount ?? touchedFiles.length,
  });
};

const compressSummary = (data, maxTokens) => {
  const baseSummary = buildSessionSummary(data);
  let compressed = baseSummary;
  let summary = JSON.stringify(compressed, null, 2);
  let tokens = countTokens(summary);

  if (tokens <= maxTokens) {
    return { compressed, tokens, truncated: false, omitted: [], compressionLevel: 'none' };
  }

  const recomputeTokens = () => {
    compressed = pruneEmptyFields(compressed);
    summary = JSON.stringify(compressed, null, 2);
    tokens = countTokens(summary);
  };

  const shrinkScalarField = (field, { removable = true } = {}) => {
    const value = compressed[field];
    if (!isMeaningfulString(value)) {
      return false;
    }

    if (value.length <= 12) {
      if (!removable) {
        return false;
      }
      delete compressed[field];
      return true;
    }

    const next = truncateString(value, Math.max(4, Math.floor(value.length * 0.6)));
    if (!next || next === value) {
      if (!removable) {
        return false;
      }
      delete compressed[field];
      return true;
    }

    compressed[field] = next;
    return true;
  };

  const shrinkArrayField = (field) => {
    const value = compressed[field];
    if (!Array.isArray(value) || value.length === 0) {
      return false;
    }

    if (value.length > 1) {
      compressed[field] = value.slice(-1);
      return true;
    }

    const [item] = value;
    if (!isMeaningfulString(item)) {
      delete compressed[field];
      return true;
    }

    if (item.length <= 12) {
      delete compressed[field];
      return true;
    }

    compressed[field] = [truncateString(item, Math.max(4, Math.floor(item.length * 0.6)))];
    return true;
  };

  const reductionSteps = [
    () => shrinkArrayField('hotFiles'),
    () => shrinkArrayField('keyDecisions'),
    () => shrinkArrayField('recentCompleted'),
    () => shrinkArrayField('unresolvedQuestions'),
    () => shrinkScalarField('currentFocus'),
    () => shrinkScalarField('goal'),
    () => shrinkScalarField('whyBlocked'),
    () => shrinkArrayField('pinnedContext'),
    () => shrinkScalarField('nextStep', { removable: false }),
  ];

  let madeProgress = true;

  while (tokens > maxTokens && madeProgress) {
    madeProgress = false;

    for (const reduce of reductionSteps) {
      if (!reduce()) {
        continue;
      }

      recomputeTokens();
      madeProgress = true;

      if (tokens <= maxTokens) {
        break;
      }
    }
  }

  if (tokens > maxTokens && isMeaningfulString(compressed.nextStep)) {
    while (tokens > maxTokens && shrinkScalarField('nextStep')) {
      recomputeTokens();
    }
  }

  if (tokens > maxTokens) {
    compressed = pruneEmptyFields({
      status: normalizeStatus(data.status),
      nextStep: isMeaningfulString(data.nextStep) ? data.nextStep : undefined,
      pinnedContext: uniqueHead(data.pinnedContext, 1),
      completedCount: data.completedCount ?? mergeUniqueStrings(data.completed).length,
      decisionsCount: data.decisionsCount ?? mergeUniqueStrings(data.decisions).length,
      touchedFilesCount: data.touchedFilesCount ?? mergeUniqueStrings(data.touchedFiles).length,
    });
    recomputeTokens();

    while (tokens > maxTokens && isMeaningfulString(compressed.nextStep) && shrinkScalarField('nextStep')) {
      recomputeTokens();
    }
  }

  if (tokens > maxTokens) {
    compressed = { status: normalizeStatus(data.status) };
    recomputeTokens();
  }

  const omitted = Object.keys(baseSummary).filter((key) => !(key in compressed));
  const compressionLevel = Object.keys(compressed).length === 1 && compressed.status
    ? 'status_only'
    : omitted.length > 0
      ? 'reduced'
      : 'trimmed';

  return { compressed, tokens, truncated: true, omitted, compressionLevel };
};

const cacheSummary = (db, sessionId, { taskId = null, compressed, tokens, compressionLevel, omitted, updatedAt }) => {
  db.prepare(`
    INSERT INTO summary_cache(
      session_id,
      task_id,
      summary_json,
      tokens,
      compression_level,
      omitted_json,
      updated_at
    )
    VALUES(?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      task_id = excluded.task_id,
      summary_json = excluded.summary_json,
      tokens = excluded.tokens,
      compression_level = excluded.compression_level,
      omitted_json = excluded.omitted_json,
      updated_at = excluded.updated_at
  `).run(
    sessionId,
    taskId,
    JSON.stringify(compressed),
    tokens,
    compressionLevel,
    JSON.stringify(omitted),
    updatedAt,
  );
};

const writeActiveSession = (db, sessionId, updatedAt) => {
  db.prepare(`
    INSERT INTO active_session(scope, session_id, updated_at)
    VALUES(?, ?, ?)
    ON CONFLICT(scope) DO UPDATE SET
      session_id = excluded.session_id,
      updated_at = excluded.updated_at
  `).run(ACTIVE_SESSION_SCOPE, sessionId, updatedAt);
};

const saveSession = (db, sessionId, data, { action, eventPayload } = {}) => {
  const existing = hydrateSession(getSessionRow(db, sessionId));
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const task = resolveTaskIdentity({
    taskId: data.taskId ?? existing?.taskId ?? null,
    goal: data.goal ?? existing?.goal ?? '',
    branchName: data.branchName ?? existing?.branchName ?? null,
    worktreePath: data.worktreePath ?? existing?.worktreePath ?? null,
  });
  const completed = mergeUniqueStrings(data.completed);
  const decisions = mergeUniqueStrings(data.decisions);
  const touchedFiles = mergeUniqueStrings(data.touchedFiles);
  const pinnedContext = mergeUniqueStrings(data.pinnedContext);
  const unresolvedQuestions = mergeUniqueStrings(data.unresolvedQuestions);
  const blockers = mergeUniqueStrings(data.blockers);

  const snapshot = {
    taskId: task.taskId,
    agentId: data.agentId ?? existing?.agentId ?? null,
    goal: typeof data.goal === 'string' ? data.goal : '',
    status: normalizeStatus(data.status),
    branchName: task.branchName,
    worktreePath: task.worktreePath,
    pinnedContext,
    unresolvedQuestions,
    currentFocus: data.currentFocus ?? '',
    whyBlocked: data.whyBlocked ?? '',
    completed,
    decisions,
    blockers,
    nextStep: data.nextStep ?? '',
    touchedFiles,
    completedCount: completed.length,
    decisionsCount: decisions.length,
    touchedFilesCount: touchedFiles.length,
    schemaVersion: SQLITE_SCHEMA_VERSION,
    sessionId,
    createdAt,
    updatedAt,
  };

  db.prepare(`
    INSERT INTO sessions(
      session_id,
      goal,
      status,
      current_focus,
      why_blocked,
      next_step,
      task_id,
      agent_id,
      branch_name,
      worktree_path,
      pinned_context_json,
      unresolved_questions_json,
      blockers_json,
      snapshot_json,
      completed_count,
      decisions_count,
      touched_files_count,
      created_at,
      updated_at
    )
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      goal = excluded.goal,
      status = excluded.status,
      current_focus = excluded.current_focus,
      why_blocked = excluded.why_blocked,
      next_step = excluded.next_step,
      task_id = excluded.task_id,
      agent_id = excluded.agent_id,
      branch_name = excluded.branch_name,
      worktree_path = excluded.worktree_path,
      pinned_context_json = excluded.pinned_context_json,
      unresolved_questions_json = excluded.unresolved_questions_json,
      blockers_json = excluded.blockers_json,
      snapshot_json = excluded.snapshot_json,
      completed_count = excluded.completed_count,
      decisions_count = excluded.decisions_count,
      touched_files_count = excluded.touched_files_count,
      updated_at = excluded.updated_at,
      created_at = sessions.created_at
  `).run(
    sessionId,
    snapshot.goal,
    snapshot.status,
    snapshot.currentFocus,
    snapshot.whyBlocked,
    snapshot.nextStep,
    snapshot.taskId,
    snapshot.agentId,
    snapshot.branchName,
    snapshot.worktreePath,
    JSON.stringify(pinnedContext),
    JSON.stringify(unresolvedQuestions),
    JSON.stringify(blockers),
    JSON.stringify(snapshot),
    snapshot.completedCount,
    snapshot.decisionsCount,
    snapshot.touchedFilesCount,
    snapshot.createdAt,
    snapshot.updatedAt,
  );

  writeActiveSession(db, sessionId, updatedAt);
  upsertTask(db, {
    taskId: snapshot.taskId,
    goal: snapshot.goal,
    status: snapshot.status,
    branchName: snapshot.branchName,
    worktreePath: snapshot.worktreePath,
    lastSessionId: sessionId,
    createdAt,
    updatedAt,
  });

  if (action) {
    db.prepare(`
      INSERT INTO session_events(
        session_id,
        event_type,
        task_id,
        agent_id,
        event_kind,
        payload_json,
        token_cost,
        created_at
      )
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      action,
      snapshot.taskId,
      snapshot.agentId,
      action,
      JSON.stringify(pruneEmptyFields(eventPayload ?? {})),
      0,
      updatedAt,
    );
  }

  return snapshot;
};

const cleanupStaleSessions = (db) => {
  const activeSessionId = getActiveSessionId(db);
  const rows = db.prepare(`
    SELECT session_id, updated_at
    FROM sessions
  `).all();

  const now = Date.now();
  let cleaned = 0;

  for (const row of rows) {
    if (row.session_id === activeSessionId) {
      continue;
    }

    const ageMs = now - getTimestamp(row.updated_at, now);
    if (ageMs <= MAX_SESSION_AGE_MS) {
      continue;
    }

    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(row.session_id);
    cleaned += 1;
  }

  return cleaned;
};

const listSessions = (db, { cleanup = true } = {}) => {
  if (cleanup) {
    cleanupStaleSessions(db);
  }

  const now = Date.now();

  return db.prepare(`
    SELECT session_id, goal, status, updated_at
    FROM sessions
    ORDER BY datetime(updated_at) DESC, session_id ASC
  `).all().map((row) => {
    const ageMs = now - getTimestamp(row.updated_at, now);
    return {
      sessionId: row.session_id,
      goal: row.goal,
      status: row.status,
      updatedAt: row.updated_at,
      ageMs,
      isStale: ageMs > MAX_SESSION_AGE_MS,
    };
  });
};

const getLatestSessionIdForTask = (db, taskId) =>
  db.prepare(`
    SELECT session_id
    FROM sessions
    WHERE task_id = ?
    ORDER BY datetime(updated_at) DESC, session_id ASC
    LIMIT 1
  `).get(taskId)?.session_id ?? null;

const buildResumeCandidates = (sessions) =>
  sessions.slice(0, MAX_RESUME_CANDIDATES).map((session) => ({
    sessionId: session.sessionId,
    goal: session.goal,
    status: session.status,
    updatedAt: session.updatedAt,
    ageMs: session.ageMs,
    isStale: session.isStale,
  }));

const addRepoSafety = (result, repoSafety = getRepoSafety(), sideEffectsSuppressed = false) =>
  attachSafetyMetadata({
    ...result,
    storageHealth: getStateStorageHealth(),
  }, {
    repoSafety,
    sideEffectsSuppressed,
    subject: 'Project-local context writes',
    degradedReason: 'repo_safety_blocked',
    degradedMode: 'read_only_snapshot',
    degradedImpact: 'Checkpoint maintenance side effects are paused while git hygiene is blocked.',
  });

const getMutationSafetyPolicy = () => {
  return getRepoMutationSafety();
};

const buildMutationBlockedMessage = (reasons, stateDbPath = '.devctx/state.sqlite') => {
  if (reasons.includes('tracked') && reasons.includes('staged')) {
    return `Refused to mutate project-local context because ${stateDbPath} is tracked and staged by git. Fix git hygiene first.`;
  }

  if (reasons.includes('tracked')) {
    return `Refused to mutate project-local context because ${stateDbPath} is tracked by git. Untrack it before continuing.`;
  }

  if (reasons.includes('staged')) {
    return `Refused to mutate project-local context because ${stateDbPath} is staged for commit. Unstage it before continuing.`;
  }

  return `Refused to mutate project-local context because ${stateDbPath} failed runtime safety checks.`;
};

const buildMutationBlockedResponse = ({ action, sessionId, repoSafety, reasons }) => {
  const mutationSafety = buildMutationSafety(repoSafety, {
    subject: 'Project-local context writes',
  });

  return addRepoSafety({
    action,
    sessionId: sessionId ?? null,
    blocked: true,
    mutationBlocked: true,
    blockedBy: mutationSafety?.blockedBy ?? reasons,
    message: buildMutationBlockedMessage(reasons, repoSafety.stateDbPath ?? '.devctx/state.sqlite'),
  }, repoSafety);
};

const resolveAutoResumeTarget = (db, { forceRecommended = false, cleanup = true } = {}) => {
  const sessions = listSessions(db, { cleanup });
  const candidates = buildResumeCandidates(sessions);

  if (sessions.length === 0) {
    return {
      found: false,
      ambiguous: false,
      candidates,
      recommendedSessionId: null,
      message: 'No saved sessions found. Use action=update to create one.',
    };
  }

  if (sessions.length === 1) {
    return {
      found: true,
      sessionId: sessions[0].sessionId,
      autoResumed: true,
      resumeSource: 'latest_only',
      candidates,
      recommendedSessionId: sessions[0].sessionId,
      ambiguous: false,
    };
  }

  const openSessions = sessions.filter((session) => ACTIVE_STATUSES.has(normalizeStatus(session.status)));
  if (openSessions.length === 1) {
    return {
      found: true,
      sessionId: openSessions[0].sessionId,
      autoResumed: true,
      resumeSource: 'only_open_session',
      candidates,
      recommendedSessionId: openSessions[0].sessionId,
      ambiguous: false,
    };
  }

  const [latest, secondLatest] = sessions;
  const recencyGapMs = getTimestamp(latest?.updatedAt, 0) - getTimestamp(secondLatest?.updatedAt, 0);

  if (Number.isFinite(recencyGapMs) && recencyGapMs >= AUTO_RESUME_RECENCY_GAP_MS) {
    return {
      found: true,
      sessionId: latest.sessionId,
      autoResumed: true,
      resumeSource: 'latest_by_recency',
      candidates,
      recommendedSessionId: latest.sessionId,
      ambiguous: false,
    };
  }

  const recommended = openSessions[0] || latest;
  if (forceRecommended && recommended) {
    return {
      found: true,
      sessionId: recommended.sessionId,
      autoResumed: true,
      resumeSource: openSessions[0] ? 'recommended_open_session' : 'recommended_latest',
      candidates,
      recommendedSessionId: recommended.sessionId,
      ambiguous: true,
    };
  }

  return {
    found: false,
    ambiguous: true,
    candidates,
    recommendedSessionId: recommended?.sessionId ?? null,
    message: 'Multiple recent sessions found. Specify sessionId or use sessionId="auto" to accept the recommendation.',
  };
};

export const smartSummary = async ({
  action,
  sessionId,
  taskId,
  update,
  maxTokens = DEFAULT_MAX_TOKENS,
  event,
  force,
  retentionDays,
  keepLatestEventsPerSession,
  keepLatestMetrics,
  vacuum,
  apply,
  goal,
  status,
  nextStep,
  currentFocus,
  whyBlocked,
  agentId,
  branchName,
  worktreePath,
  pinnedContext,
  unresolvedQuestions,
  blockers,
  completed,
  decisions,
  touchedFiles,
} = {}) => {
  const startTime = Date.now();
  
  if (!update && (goal || status || nextStep || currentFocus || whyBlocked ||
      taskId || agentId || branchName || worktreePath ||
      pinnedContext || unresolvedQuestions || blockers || completed || decisions || touchedFiles)) {
    update = {
      goal,
      taskId,
      status,
      nextStep,
      currentFocus,
      whyBlocked,
      agentId,
      branchName,
      worktreePath,
      pinnedContext,
      unresolvedQuestions,
      blockers,
      completed,
      decisions,
      touchedFiles,
    };
  }
  
  const mutationSafety = getMutationSafetyPolicy();
  const shouldBlockWrites = SUMMARY_WRITE_ACTIONS.has(action) && mutationSafety.shouldBlock;
  const allowReadSideEffects = !mutationSafety.shouldBlock;
  const shouldImportLegacy = allowReadSideEffects;

  if (shouldImportLegacy) {
    await importLegacyState();
  }

  if (action === 'list_sessions') {
    const reader = allowReadSideEffects ? withStateDb : withStateDbSnapshot;
    return reader((db) => {
      const sessions = listSessions(db, { cleanup: allowReadSideEffects });
      const activeSessionId = getActiveSessionId(db);

      return addRepoSafety({
        action: 'list_sessions',
        sessions,
        activeSessionId,
        totalSessions: sessions.length,
        staleSessions: sessions.filter((session) => session.isStale).length,
      }, mutationSafety.repoSafety, !allowReadSideEffects);
    }, allowReadSideEffects ? undefined : {});
  }

  if (action === 'get') {
    const reader = allowReadSideEffects ? withStateDb : withStateDbSnapshot;
    return reader(async (db) => {
      const suppressReadSideEffects = !allowReadSideEffects;
      const activeSessionId = getActiveSessionId(db);
      const wantsAutoResume = sessionId === undefined || sessionId === AUTO_RESUME_SESSION_ID;
      let targetSessionId = sessionId && sessionId !== AUTO_RESUME_SESSION_ID
        ? sessionId
        : activeSessionId;
      let resumeMeta = activeSessionId
        ? {
            autoResumed: false,
            resumeSource: 'active',
            recommendedSessionId: activeSessionId,
          }
        : null;

      if (!targetSessionId && typeof taskId === 'string' && taskId.trim().length > 0) {
        targetSessionId = getLatestSessionIdForTask(db, taskId.trim());
        if (targetSessionId) {
          resumeMeta = {
            autoResumed: false,
            resumeSource: 'task_id',
            recommendedSessionId: targetSessionId,
          };
        }
      }

      if (!targetSessionId && wantsAutoResume) {
        const resolution = resolveAutoResumeTarget(db, {
          forceRecommended: sessionId === AUTO_RESUME_SESSION_ID,
          cleanup: allowReadSideEffects,
        });
        if (!resolution.found) {
          return addRepoSafety({
            action: 'get',
            sessionId: null,
            found: false,
            autoResumed: false,
            ambiguous: resolution.ambiguous,
            candidates: resolution.candidates,
            recommendedSessionId: resolution.recommendedSessionId,
            message: resolution.message,
          }, mutationSafety.repoSafety, suppressReadSideEffects);
        }

        targetSessionId = resolution.sessionId;
        resumeMeta = resolution;
      }

      if (!targetSessionId) {
        return addRepoSafety({
          action: 'get',
          sessionId: null,
          found: false,
          message: 'No active session found. Use action=update to create one.',
        }, mutationSafety.repoSafety, suppressReadSideEffects);
      }

      const session = hydrateSession(getSessionRow(db, targetSessionId));
      if (!session) {
        return addRepoSafety({
          action: 'get',
          sessionId: targetSessionId,
          found: false,
          message: 'Session not found.',
        }, mutationSafety.repoSafety, suppressReadSideEffects);
      }

      if (resumeMeta?.autoResumed && allowReadSideEffects) {
        writeActiveSession(db, targetSessionId, session.updatedAt);
      }

      const taskRecord = normalizeTaskRow(
        (session.taskId ? getTaskRow(db, session.taskId) : null) ?? getTaskRowForSession(db, targetSessionId),
      );
      const latestHandoff = taskRecord?.taskId
        ? normalizeTaskHandoff(getLatestTaskHandoffRow(db, taskRecord.taskId))
        : null;

      const { compressed, tokens, truncated, omitted, compressionLevel } = compressSummary(session, maxTokens);
      const rawTokens = countTokens(JSON.stringify(session));
      const summaryMetrics = buildSummaryMetrics(rawTokens, tokens);

      if (allowReadSideEffects) {
        cacheSummary(db, targetSessionId, {
          taskId: session.taskId ?? taskRecord?.taskId ?? null,
          compressed,
          tokens,
          compressionLevel,
          omitted,
          updatedAt: session.updatedAt,
        });

        persistMetrics({
          tool: 'smart_summary',
          action: 'get',
          sessionId: targetSessionId,
          ...summaryMetrics,
          latencyMs: Date.now() - startTime,
        });
        
        recordToolUsage({
          tool: 'smart_summary',
          savedTokens: summaryMetrics.savedTokens || 0,
          target: targetSessionId,
        });
        
        recordDevctxOperation();
        
        recordDecision({
          tool: 'smart_summary',
          action: `get checkpoint "${targetSessionId}"`,
          reason: DECISION_REASONS.RESUME,
          alternative: 'Start from scratch (lose context)',
          expectedBenefit: EXPECTED_BENEFITS.SESSION_RECOVERY,
          context: `Recovered ${compressed.goal ? 'goal' : 'state'}, ${compressed.status || 'unknown'} status`,
        });
      }

      return addRepoSafety({
        action: 'get',
        sessionId: targetSessionId,
        found: true,
        summary: compressed,
        tokens,
        truncated,
        omitted,
        compressionLevel,
        autoResumed: resumeMeta?.autoResumed ?? false,
        resumeSource: resumeMeta?.resumeSource ?? 'direct',
        ambiguous: resumeMeta?.ambiguous ?? false,
        recommendedSessionId: resumeMeta?.recommendedSessionId ?? targetSessionId,
        ...(taskRecord ? {
          task: {
            taskId: taskRecord.taskId,
            status: taskRecord.status,
            canonicalGoal: taskRecord.canonicalGoal,
            branchName: taskRecord.branchName,
            worktreePath: taskRecord.worktreePath,
            resolution: resumeMeta?.resumeSource === 'task_id' ? 'exact' : (resumeMeta?.autoResumed ? 'ranked' : 'active'),
          },
        } : {}),
        ...(latestHandoff ? { handoff: latestHandoff } : {}),
        ...(resumeMeta?.candidates ? { candidates: resumeMeta.candidates } : {}),
        schemaVersion: session.schemaVersion ?? 1,
        updatedAt: session.updatedAt,
      }, mutationSafety.repoSafety, suppressReadSideEffects);
    }, allowReadSideEffects ? undefined : {});
  }

  if (action === 'reset') {
    if (shouldBlockWrites) {
      return buildMutationBlockedResponse({
        action,
        sessionId,
        repoSafety: mutationSafety.repoSafety,
        reasons: mutationSafety.reasons,
      });
    }

    return withStateDb((db) => {
      const targetSessionId = sessionId || getActiveSessionId(db);
      if (!targetSessionId) {
        return addRepoSafety({
          action: 'reset',
          sessionId: null,
          message: 'No session to reset.',
        });
      }

      const isActiveSession = getActiveSessionId(db) === targetSessionId;
      const session = hydrateSession(getSessionRow(db, targetSessionId));

      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM sessions WHERE session_id = ?').run(targetSessionId);
        if (isActiveSession) {
          db.prepare('DELETE FROM active_session WHERE scope = ?').run(ACTIVE_SESSION_SCOPE);
        }
        db.prepare('DELETE FROM summary_cache WHERE session_id = ?').run(targetSessionId);
        if (session?.taskId) {
          const remaining = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE task_id = ?').get(session.taskId).count;
          if (remaining === 0) {
            db.prepare('DELETE FROM tasks WHERE task_id = ?').run(session.taskId);
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return addRepoSafety({
        action: 'reset',
        sessionId: targetSessionId,
        message: 'Session cleared.',
      });
    });
  }

  if (action === 'compact') {
    if (shouldBlockWrites) {
      return buildMutationBlockedResponse({
        action,
        sessionId,
        repoSafety: mutationSafety.repoSafety,
        reasons: mutationSafety.reasons,
      });
    }

    return compactState({
      retentionDays,
      keepLatestEventsPerSession,
      keepLatestMetrics,
      vacuum,
    });
  }

  if (action === 'cleanup_legacy') {
    return cleanupLegacyState({ apply });
  }

  if (action === 'update' || action === 'append' || action === 'auto_append' || action === 'checkpoint') {
    validateUpdateInput(update);

    if (shouldBlockWrites) {
      return buildMutationBlockedResponse({
        action,
        sessionId,
        repoSafety: mutationSafety.repoSafety,
        reasons: mutationSafety.reasons,
      });
    }

    return withStateDb(async (db) => {
      let targetSessionId = sessionId;
      let existingData = {};

      if (!targetSessionId && typeof taskId === 'string' && taskId.trim().length > 0) {
        targetSessionId = getLatestSessionIdForTask(db, taskId.trim());
        if (targetSessionId) {
          existingData = hydrateSession(getSessionRow(db, targetSessionId)) ?? {};
        }
      }

      if (!targetSessionId || targetSessionId === 'new') {
        if (action === 'append' || action === 'auto_append' || action === 'checkpoint') {
          const activeSessionId = getActiveSessionId(db);
          if (activeSessionId) {
            targetSessionId = activeSessionId;
            existingData = hydrateSession(getSessionRow(db, activeSessionId)) ?? {};
          } else {
            if ((action === 'auto_append' || action === 'checkpoint') && !hasMeaningfulAutoAppendInput(update)) {
              return addRepoSafety({
                action,
                sessionId: null,
                skipped: true,
                changedFields: [],
                message: 'Skipped auto-append because the update had no meaningful content.',
              });
            }
            targetSessionId = generateSessionId(update.goal);
          }
        } else {
          targetSessionId = generateSessionId(update.goal);
        }
      } else {
        existingData = hydrateSession(getSessionRow(db, targetSessionId)) ?? {};
      }

      const mergedData = action === 'append' || action === 'auto_append' || action === 'checkpoint'
        ? buildAppendData(existingData, update)
        : buildReplaceData(update);
      const checkpointDecision = action === 'checkpoint'
        ? resolveCheckpointDecision({ event, force, existingData, mergedData })
        : null;
      const changedFields = action === 'auto_append'
        ? getAutoAppendChanges(existingData, mergedData)
        : checkpointDecision?.changedFields ?? [];

      if (action === 'auto_append' && changedFields.length === 0) {
        const currentSession = hydrateSession(getSessionRow(db, targetSessionId)) ?? mergedData;
        const currentTask = currentSession.taskId ? normalizeTaskRow(getTaskRow(db, currentSession.taskId)) : null;
        const { compressed, tokens, truncated, omitted, compressionLevel } = compressSummary(currentSession, maxTokens);
        const rawTokens = countTokens(JSON.stringify(currentSession));

        const metrics = buildSummaryMetrics(rawTokens, tokens);
        persistMetrics({
          tool: 'smart_summary',
          action,
          sessionId: targetSessionId,
          ...metrics,
          latencyMs: Date.now() - startTime,
          skipped: true,
        });
        
        recordToolUsage({
          tool: 'smart_summary',
          savedTokens: metrics.savedTokens || 0,
          target: targetSessionId,
        });

        return addRepoSafety({
          action,
          sessionId: targetSessionId,
          skipped: true,
          changedFields,
          summary: compressed,
          tokens,
          truncated,
          omitted,
          compressionLevel,
          ...(currentTask ? { task: currentTask } : {}),
          schemaVersion: currentSession.schemaVersion ?? SQLITE_SCHEMA_VERSION,
          updatedAt: currentSession.updatedAt,
          message: 'Skipped auto-append because no meaningful context changed.',
        });
      }

      if (action === 'checkpoint' && !checkpointDecision.shouldPersist) {
        const currentSession = hydrateSession(getSessionRow(db, targetSessionId)) ?? mergedData;
        const currentTask = currentSession.taskId ? normalizeTaskRow(getTaskRow(db, currentSession.taskId)) : null;
        const { compressed, tokens, truncated, omitted, compressionLevel } = compressSummary(currentSession, maxTokens);
        const rawTokens = countTokens(JSON.stringify(currentSession));

        const metrics2 = buildSummaryMetrics(rawTokens, tokens);
        persistMetrics({
          tool: 'smart_summary',
          action,
          sessionId: targetSessionId,
          ...metrics2,
          latencyMs: Date.now() - startTime,
          skipped: true,
          checkpointEvent: checkpointDecision.event,
        });
        
        recordToolUsage({
          tool: 'smart_summary',
          savedTokens: metrics2.savedTokens || 0,
          target: targetSessionId,
        });
        
        recordDevctxOperation();

        return addRepoSafety({
          action,
          sessionId: targetSessionId,
          skipped: true,
          changedFields,
          checkpoint: {
            event: checkpointDecision.event,
            shouldPersist: false,
            reason: checkpointDecision.reason,
            score: checkpointDecision.score,
            threshold: checkpointDecision.threshold,
            scoreByField: checkpointDecision.scoreByField,
          },
          summary: compressed,
          tokens,
          truncated,
          omitted,
          compressionLevel,
          ...(currentTask ? { task: currentTask } : {}),
          schemaVersion: currentSession.schemaVersion ?? SQLITE_SCHEMA_VERSION,
          updatedAt: currentSession.updatedAt,
          message: checkpointDecision.reason,
        });
      }

      const savedData = saveSession(db, targetSessionId, mergedData, {
        action,
        eventPayload: action === 'auto_append' || action === 'checkpoint'
          ? {
              ...update,
              changedFields,
              ...(action === 'checkpoint'
                ? {
                    checkpointEvent: checkpointDecision.event,
                    checkpointReason: checkpointDecision.reason,
                  }
                : {}),
            }
          : update,
      });
      const { compressed, tokens, truncated, omitted, compressionLevel } = compressSummary(savedData, maxTokens);
      const rawTokens = countTokens(JSON.stringify(savedData));
      const summaryMetrics = buildSummaryMetrics(rawTokens, tokens);

      cacheSummary(db, targetSessionId, {
        taskId: savedData.taskId ?? null,
        compressed,
        tokens,
        compressionLevel,
        omitted,
        updatedAt: savedData.updatedAt,
      });

      persistMetrics({
        tool: 'smart_summary',
        action,
        sessionId: targetSessionId,
        ...summaryMetrics,
        latencyMs: Date.now() - startTime,
        ...(action === 'checkpoint' ? { checkpointEvent: checkpointDecision.event } : {}),
      });
      
      recordToolUsage({
        tool: 'smart_summary',
        savedTokens: summaryMetrics.savedTokens || 0,
        target: targetSessionId,
      });
      
      recordDevctxOperation();

      return addRepoSafety({
        action,
        sessionId: targetSessionId,
        ...(savedData.taskId ? {
          task: normalizeTaskRow(getTaskRow(db, savedData.taskId)),
        } : {}),
        skipped: false,
        ...(action === 'auto_append' || action === 'checkpoint' ? { changedFields } : {}),
        ...(action === 'checkpoint'
          ? {
              checkpoint: {
                event: checkpointDecision.event,
                shouldPersist: true,
                reason: checkpointDecision.reason,
                score: checkpointDecision.score,
                threshold: checkpointDecision.threshold,
                scoreByField: checkpointDecision.scoreByField,
              },
            }
          : {}),
        summary: compressed,
        tokens,
        truncated,
        omitted,
        compressionLevel,
        schemaVersion: savedData.schemaVersion,
        updatedAt: savedData.updatedAt,
        message: action === 'append' || action === 'auto_append' || action === 'checkpoint'
          ? 'Session updated incrementally.'
          : 'Session saved.',
      });
    });
  }

  throw new Error(`Invalid action: ${action}. Valid actions: get, update, append, auto_append, checkpoint, reset, list_sessions, compact, cleanup_legacy`);
};
