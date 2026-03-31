import fs from 'node:fs';
import path from 'node:path';
import { getRepoMutationSafety } from '../repo-safety.js';
import {
  ACTIVE_SESSION_SCOPE,
  diagnoseStateStorage,
  getLegacyActiveSessionPath,
  getLegacyMetricsPath,
  getLegacySessionsDir,
  getMeta,
  getStateDbPath,
  withStateDbSnapshot,
} from '../storage/sqlite.js';
import { attachSafetyMetadata } from '../utils/mutation-safety.js';
import { recordToolUsage } from '../usage-feedback.js';
import { recordDecision, DECISION_REASONS, EXPECTED_BENEFITS } from '../decision-explainer.js';
import { recordDevctxOperation } from '../missed-opportunities.js';
import { countTokens } from '../tokenCounter.js';

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_KEEP_LATEST_EVENTS_PER_SESSION = 20;
const DEFAULT_KEEP_LATEST_METRICS = 1000;
const SESSION_EVENTS_WARNING_FLOOR = DEFAULT_KEEP_LATEST_EVENTS_PER_SESSION * 10;
const METRICS_WARNING_FLOOR = Math.ceil(DEFAULT_KEEP_LATEST_METRICS * 1.5);
const STATUS_RANK = {
  info: 0,
  ok: 1,
  warning: 2,
  error: 3,
};

const uniqueStrings = (items) => [...new Set(items.filter((item) => typeof item === 'string' && item.trim().length > 0))];

const compactPath = (filePath) => {
  if (!filePath) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length <= 3 ? normalized : `.../${parts.slice(-3).join('/')}`;
};

const daysSince = (isoString) => {
  const timestamp = Date.parse(isoString ?? '');
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.max(0, (Date.now() - timestamp) / (24 * 60 * 60 * 1000));
};

const buildCheck = ({ id, status, message, recommendedActions = [], details = {} }) => ({
  id,
  status,
  message,
  recommendedActions: uniqueStrings(recommendedActions),
  details,
});

const readMaintenanceSnapshot = async ({ filePath, storageHealth }) => {
  if (!storageHealth?.exists) {
    return { available: false, reason: 'missing' };
  }

  if (['locked', 'corrupted', 'unavailable', 'unknown'].includes(storageHealth.issue)) {
    return { available: false, reason: storageHealth.issue };
  }

  try {
    return await withStateDbSnapshot((db) => {
      const count = (tableName) => db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;

      return {
        available: true,
        counts: {
          sessions: count('sessions'),
          sessionEvents: count('session_events'),
          metricsEvents: count('metrics_events'),
          hookTurnState: count('hook_turn_state'),
          workflowMetrics: count('workflow_metrics'),
        },
        activeSessionId: db.prepare('SELECT session_id FROM active_session WHERE scope = ?').get(ACTIVE_SESSION_SCOPE)?.session_id ?? null,
        schemaVersion: Number(getMeta(db, 'schema_version') ?? 0),
        lastCompactedAt: getMeta(db, 'state_compacted_at'),
        retentionDays: Number(getMeta(db, 'state_compaction_retention_days') ?? DEFAULT_RETENTION_DAYS),
        legacyImport: {
          sessions: Number(getMeta(db, 'legacy_sessions_import_count') ?? 0),
          metrics: Number(getMeta(db, 'legacy_metrics_import_count') ?? 0),
        },
      };
    }, { filePath });
  } catch (error) {
    return {
      available: false,
      reason: error.storageHealth?.issue ?? 'unknown',
      error: error.message,
    };
  }
};

const inspectLegacyFiles = () => {
  const sessionsDir = getLegacySessionsDir();
  const metricsFile = getLegacyMetricsPath();
  const activeSessionFile = getLegacyActiveSessionPath();
  const sessionFiles = fs.existsSync(sessionsDir)
    ? fs.readdirSync(sessionsDir)
      .filter((fileName) => fileName.endsWith('.json') && fileName !== 'active.json')
      .map((fileName) => path.join(sessionsDir, fileName))
    : [];

  return {
    sessionsDir,
    sessionFiles,
    activeSessionFile,
    activeSessionExists: fs.existsSync(activeSessionFile),
    metricsFile,
    metricsExists: fs.existsSync(metricsFile),
  };
};

const buildRepoSafetyCheck = (mutationSafety) => {
  const repoSafety = mutationSafety.repoSafety;

  if (!repoSafety?.available) {
    return buildCheck({
      id: 'repoSafety',
      status: 'info',
      message: 'Repository safety checks are unavailable because this project is not inside a git repository.',
      recommendedActions: [],
      details: {
        available: false,
      },
    });
  }

  if (mutationSafety.shouldBlock) {
    return buildCheck({
      id: 'repoSafety',
      status: 'error',
      message: 'Git hygiene is actively blocking persisted devctx writes for project-local state.',
      recommendedActions: repoSafety.recommendedActions,
      details: {
        blockedBy: mutationSafety.reasons,
        stateDbPath: repoSafety.stateDbPath,
        warnings: repoSafety.warnings,
      },
    });
  }

  if (repoSafety.riskLevel === 'warning') {
    return buildCheck({
      id: 'repoSafety',
      status: 'warning',
      message: 'Repository safety is degraded: local devctx state is not fully protected against accidental commits.',
      recommendedActions: repoSafety.recommendedActions,
      details: {
        stateDbPath: repoSafety.stateDbPath,
        warnings: repoSafety.warnings,
      },
    });
  }

  return buildCheck({
    id: 'repoSafety',
    status: 'ok',
    message: 'Repository safety checks are healthy for project-local devctx state.',
    recommendedActions: [],
    details: {
      stateDbPath: repoSafety.stateDbPath,
      projectGitignorePath: repoSafety.projectGitignorePath,
    },
  });
};

const buildStorageCheck = (storageHealth) => {
  const status = storageHealth.status === 'error'
    ? 'error'
    : storageHealth.status === 'warning'
      ? 'warning'
      : 'ok';

  return buildCheck({
    id: 'storageHealth',
    status,
    message: storageHealth.message,
    recommendedActions: storageHealth.recommendedActions,
    details: {
      issue: storageHealth.issue,
      filePath: compactPath(storageHealth.filePath),
      relativePath: storageHealth.relativePath,
      sizeBytes: storageHealth.sizeBytes,
      softMaxBytes: storageHealth.softMaxBytes,
      integrity: storageHealth.integrity ?? null,
    },
  });
};

const buildCompactionCheck = ({ storageHealth, maintenance }) => {
  if (!storageHealth.exists) {
    return buildCheck({
      id: 'compaction',
      status: 'info',
      message: 'Compaction checks are not applicable until project-local SQLite state exists.',
      recommendedActions: [],
      details: {
        available: false,
        reason: 'missing',
      },
    });
  }

  if (!maintenance?.available) {
    return buildCheck({
      id: 'compaction',
      status: storageHealth.status === 'error' ? 'warning' : 'info',
      message: 'Compaction hygiene could not be inspected until SQLite storage health is repaired.',
      recommendedActions: storageHealth.recommendedActions,
      details: {
        available: false,
        reason: maintenance?.reason ?? storageHealth.issue,
      },
    });
  }

  const {
    counts,
    lastCompactedAt,
    retentionDays,
    schemaVersion,
    activeSessionId,
  } = maintenance;
  const daysSinceCompaction = daysSince(lastCompactedAt);
  const sessionEventThreshold = Math.max(SESSION_EVENTS_WARNING_FLOOR, counts.sessions * DEFAULT_KEEP_LATEST_EVENTS_PER_SESSION * 5);
  const needsCompaction = [];

  if (storageHealth.issue === 'oversized') {
    needsCompaction.push('database_size');
  }

  if (!lastCompactedAt && (counts.sessionEvents > sessionEventThreshold || counts.metricsEvents > METRICS_WARNING_FLOOR)) {
    needsCompaction.push('never_compacted');
  }

  if (
    daysSinceCompaction !== null
    && daysSinceCompaction > retentionDays
    && (counts.sessionEvents > sessionEventThreshold || counts.metricsEvents > DEFAULT_KEEP_LATEST_METRICS)
  ) {
    needsCompaction.push('stale_compaction');
  }

  if (needsCompaction.length > 0) {
    return buildCheck({
      id: 'compaction',
      status: 'warning',
      message: 'SQLite retention/compaction hygiene should be refreshed before the local state grows further.',
      recommendedActions: [
        'Run smart_summary with action="compact" to prune old events and metrics.',
        'Use vacuum=true if you expect large deletions and want to reclaim file size immediately.',
      ],
      details: {
        available: true,
        recommended: true,
        reasons: needsCompaction,
        schemaVersion,
        activeSessionId,
        counts,
        lastCompactedAt,
        daysSinceCompaction,
        retentionDays,
      },
    });
  }

  return buildCheck({
    id: 'compaction',
    status: 'ok',
    message: 'SQLite retention and compaction hygiene look healthy for the current local state volume.',
    recommendedActions: [],
    details: {
      available: true,
      recommended: false,
      schemaVersion,
      activeSessionId,
      counts,
      lastCompactedAt,
      daysSinceCompaction,
      retentionDays,
    },
  });
};

const buildLegacyCheck = ({ legacyFiles, maintenance }) => {
  const totalArtifacts = legacyFiles.sessionFiles.length + (legacyFiles.activeSessionExists ? 1 : 0) + (legacyFiles.metricsExists ? 1 : 0);

  if (totalArtifacts === 0) {
    return buildCheck({
      id: 'legacyState',
      status: 'ok',
      message: 'No legacy JSON/JSONL state artifacts were detected alongside SQLite state.',
      recommendedActions: [],
      details: {
        present: false,
        sessionFiles: 0,
        metricsExists: false,
        activeSessionExists: false,
      },
    });
  }

  const importedSessions = maintenance?.available ? maintenance.legacyImport.sessions : null;
  const importedMetrics = maintenance?.available ? maintenance.legacyImport.metrics : null;

  return buildCheck({
    id: 'legacyState',
    status: 'warning',
    message: 'Legacy JSON/JSONL state artifacts are still present and should be reviewed for cleanup.',
    recommendedActions: [
      'Run smart_summary with action="cleanup_legacy" to inspect removable legacy files.',
      importedSessions || importedMetrics
        ? 'If the SQLite import is already validated, rerun smart_summary cleanup_legacy with apply=true to remove eligible files.'
        : 'Validate that legacy state has been imported before deleting old JSON/JSONL files.',
    ],
    details: {
      present: true,
      sessionFiles: legacyFiles.sessionFiles.length,
      sampleSessionFiles: legacyFiles.sessionFiles.slice(0, 3).map(compactPath),
      metricsExists: legacyFiles.metricsExists,
      activeSessionExists: legacyFiles.activeSessionExists,
      importedSessions,
      importedMetrics,
    },
  });
};

const summarizeOverall = (checks) => {
  const highest = checks.reduce((max, check) => Math.max(max, STATUS_RANK[check.status] ?? 0), 0);
  if (highest >= STATUS_RANK.error) {
    return 'error';
  }
  if (highest >= STATUS_RANK.warning) {
    return 'warning';
  }
  return 'ok';
};

const buildSummaryMessage = (overall) => {
  if (overall === 'error') {
    return 'devctx doctor found blocking operational issues in local state or repo hygiene.';
  }
  if (overall === 'warning') {
    return 'devctx doctor found non-blocking issues that should be cleaned up before they accumulate.';
  }
  return 'devctx doctor found the local state setup healthy for normal use.';
};

export const smartDoctor = async ({ verifyIntegrity = true } = {}) => {
  recordDecision({
    tool: 'smart_doctor',
    reason: DECISION_REASONS.CONTEXT_VISIBILITY,
    benefit: EXPECTED_BENEFITS.TRANSPARENCY,
  });
  recordDevctxOperation('smart_doctor');

  const mutationSafety = getRepoMutationSafety();
  const storageHealth = await diagnoseStateStorage({
    filePath: getStateDbPath(),
    verifyIntegrity,
  });
  const maintenance = await readMaintenanceSnapshot({
    filePath: getStateDbPath(),
    storageHealth,
  });
  const legacyFiles = inspectLegacyFiles();

  const checks = [
    buildRepoSafetyCheck(mutationSafety),
    buildStorageCheck(storageHealth),
    buildCompactionCheck({ storageHealth, maintenance }),
    buildLegacyCheck({ legacyFiles, maintenance }),
  ];

  const overall = summarizeOverall(checks);
  const recommendedActions = uniqueStrings(checks.flatMap((check) => check.recommendedActions));
  const result = attachSafetyMetadata({
    success: overall !== 'error',
    overall,
    message: buildSummaryMessage(overall),
    checks,
    recommendedActions,
    storageHealth,
    maintenance: maintenance?.available ? maintenance : null,
    legacyState: {
      sessionsDir: compactPath(legacyFiles.sessionsDir),
      metricsFile: compactPath(legacyFiles.metricsFile),
      activeSessionFile: compactPath(legacyFiles.activeSessionFile),
      sessionFiles: legacyFiles.sessionFiles.length,
      activeSessionExists: legacyFiles.activeSessionExists,
      metricsExists: legacyFiles.metricsExists,
    },
  }, {
    repoSafety: mutationSafety.repoSafety,
    sideEffectsSuppressed: mutationSafety.shouldBlock,
    subject: 'Project-local context writes',
    degradedReason: 'repo_safety_blocked',
    degradedMode: 'read_only_snapshot',
    degradedImpact: 'Persistent writes remain blocked while repo safety is unhealthy.',
  });

  recordToolUsage({
    tool: 'smart_doctor',
    rawTokens: 0,
    compressedTokens: countTokens(JSON.stringify(result)),
    savedTokens: 0,
    savingsPct: 0,
  });

  return result;
};
