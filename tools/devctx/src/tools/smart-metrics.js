import fs from 'node:fs';
import { getRepoMutationSafety, getRepoSafety } from '../repo-safety.js';
import {
  ACTIVE_SESSION_SCOPE,
  diagnoseStateStorage,
  getStateStorageHealth,
  importLegacyState,
  withStateDb,
  withStateDbSnapshot,
} from '../storage/sqlite.js';
import {
  aggregateMetrics,
  getCompressedTokens,
  getEntrySavingsPct,
  getSavedTokens,
  readMetricsEntries,
  resolveMetricsInput,
} from '../metrics.js';
import { analyzeAdoption } from '../analytics/adoption.js';
import { analyzeProductQuality } from '../analytics/product-quality.js';
import { attachSafetyMetadata } from '../utils/mutation-safety.js';

const WINDOW_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

const toTimestamp = (entry) => {
  const timestamp = Date.parse(entry.timestamp ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const applyWindowFilter = (entries, window) => {
  if (window === 'all') {
    return entries;
  }

  const windowMs = WINDOW_MS[window] ?? WINDOW_MS['7d'];
  const cutoff = Date.now() - windowMs;
  return entries.filter((entry) => toTimestamp(entry) >= cutoff);
};

const buildLatestEntries = (entries, limit) =>
  entries
    .slice()
    .sort((a, b) => toTimestamp(b) - toTimestamp(a))
    .slice(0, limit)
    .map((entry) => {
      const compressedTokens = getCompressedTokens(entry);
      const savedTokens = getSavedTokens(entry, compressedTokens);
      return {
        tool: entry.tool ?? 'unknown',
        action: entry.action ?? null,
        target: entry.target ?? null,
        sessionId: entry.sessionId ?? null,
        rawTokens: Number(entry.rawTokens ?? 0),
        compressedTokens,
        savedTokens,
        savingsPct: getEntrySavingsPct(entry, compressedTokens, savedTokens),
        overheadTokens: Math.max(0, Number(entry.metadata?.overheadTokens ?? 0)),
        timestamp: entry.timestamp ?? null,
      };
    });

const getActiveSessionId = (db) =>
  db.prepare('SELECT session_id FROM active_session WHERE scope = ?').get(ACTIVE_SESSION_SCOPE)?.session_id ?? null;
const getSqliteSafetyPolicy = () => {
  return getRepoMutationSafety();
};

const resolveSessionId = (sessionId, activeSessionId) => {
  if (!sessionId) {
    return null;
  }

  if (sessionId === 'active') {
    return activeSessionId;
  }

  return sessionId;
};

const readSqliteMetricsEntries = async ({ tool, sessionId, window }) => {
  const safety = getSqliteSafetyPolicy();
  const resolved = resolveMetricsInput({});
  const reader = safety.shouldBlock ? withStateDbSnapshot : withStateDb;

  if (safety.shouldBlock && !fs.existsSync(resolved.storagePath)) {
    return {
      entries: [],
      activeSessionId: null,
      resolvedSessionId: resolveSessionId(sessionId, null),
      invalidLines: [],
      repoSafety: safety.repoSafety,
      sideEffectsSuppressed: true,
    };
  }

  if (!safety.shouldBlock) {
    await importLegacyState();
  }

  return reader((db) => {
    const activeSessionId = getActiveSessionId(db);
    const resolvedSessionId = resolveSessionId(sessionId, activeSessionId);
    const windowMs = WINDOW_MS[window] ?? WINDOW_MS['7d'];
    const cutoff = window === 'all' ? null : new Date(Date.now() - windowMs).toISOString();

    const clauses = [];
    const values = [];

    if (tool) {
      clauses.push('tool = ?');
      values.push(tool);
    }

    if (resolvedSessionId) {
      clauses.push('session_id = ?');
      values.push(resolvedSessionId);
    }

    if (cutoff) {
      clauses.push('created_at >= ?');
      values.push(cutoff);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT
        tool,
        action,
        session_id,
        target,
        raw_tokens,
        compressed_tokens,
        saved_tokens,
        savings_pct,
        metadata_json,
        created_at
      FROM metrics_events
      ${whereClause}
      ORDER BY datetime(created_at) DESC, metric_id DESC
    `).all(...values);

    return {
      entries: rows.map((row) => ({
        tool: row.tool,
        action: row.action,
        sessionId: row.session_id,
        target: row.target,
        rawTokens: row.raw_tokens,
        compressedTokens: row.compressed_tokens,
        savedTokens: row.saved_tokens,
        savingsPct: row.savings_pct,
        metadata: (() => {
          try {
            return JSON.parse(row.metadata_json ?? '{}');
          } catch {
            return {};
          }
        })(),
        timestamp: row.created_at,
      })),
      activeSessionId,
      resolvedSessionId,
      invalidLines: [],
      repoSafety: safety.shouldBlock ? safety.repoSafety : getRepoSafety(),
      sideEffectsSuppressed: safety.shouldBlock,
    };
  }, safety.shouldBlock ? { filePath: resolved.storagePath } : undefined);
};

export const smartMetrics = async ({
  file,
  tool,
  sessionId,
  window = '7d',
  latest = 10,
}) => {
  const resolved = resolveMetricsInput({ file });
  const preflightStorageHealth = resolved.kind === 'sqlite' ? getStateStorageHealth({ filePath: resolved.storagePath }) : null;

  if (resolved.kind === 'file') {
    const { entries, invalidLines } = readMetricsEntries(resolved.storagePath);
    const resolvedSessionId = resolveSessionId(sessionId, null);
    const filteredEntries = applyWindowFilter(entries, window)
      .filter((entry) => (tool ? entry.tool === tool : true))
      .filter((entry) => (resolvedSessionId ? entry.sessionId === resolvedSessionId : true));

    const adoption = analyzeAdoption(filteredEntries);
    
    return attachSafetyMetadata({
      filePath: resolved.storagePath,
      storagePath: resolved.storagePath,
      source: resolved.source,
      activeSessionId: null,
      filters: {
        tool: tool ?? null,
        sessionId: resolvedSessionId,
        window,
        latest,
      },
      invalidLines,
      summary: aggregateMetrics(filteredEntries),
      adoption,
      productQuality: analyzeProductQuality(filteredEntries),
      latestEntries: buildLatestEntries(filteredEntries, latest),
    }, {
      repoSafety: null,
      sideEffectsSuppressed: false,
      subject: 'Project-local metrics writes',
    });
  }

  const sqliteResult = await (async () => {
    try {
      return await readSqliteMetricsEntries({
        tool,
        sessionId,
        window,
      });
    } catch (error) {
      const storageHealth = error.storageHealth ?? await diagnoseStateStorage({ filePath: resolved.storagePath });
      return {
        entries: [],
        activeSessionId: null,
        resolvedSessionId: resolveSessionId(sessionId, null),
        invalidLines: [],
        repoSafety: getRepoSafety(),
        sideEffectsSuppressed: false,
        error,
        storageHealth,
      };
    }
  })();

  const {
    entries,
    activeSessionId,
    resolvedSessionId,
    invalidLines,
    repoSafety,
    sideEffectsSuppressed,
    error,
    storageHealth,
  } = sqliteResult;

  const adoption = analyzeAdoption(entries);

  return attachSafetyMetadata({
    filePath: resolved.storagePath,
    storagePath: resolved.storagePath,
    source: resolved.source,
    activeSessionId,
    filters: {
      tool: tool ?? null,
      sessionId: resolvedSessionId,
      window,
      latest,
    },
    invalidLines,
    summary: aggregateMetrics(entries),
    adoption,
    productQuality: analyzeProductQuality(entries),
    latestEntries: buildLatestEntries(entries, latest),
    storageHealth: storageHealth ?? (sideEffectsSuppressed
      ? await diagnoseStateStorage({ filePath: resolved.storagePath })
      : (preflightStorageHealth ?? null)),
    ...(error ? { error: error.message } : {}),
  }, {
    repoSafety,
    sideEffectsSuppressed,
    subject: 'Project-local metrics writes',
    degradedReason: 'repo_safety_blocked',
    degradedMode: 'snapshot_metrics_read',
    degradedImpact: 'Metrics writes and maintenance side effects are paused while git hygiene is blocked.',
  });
};
