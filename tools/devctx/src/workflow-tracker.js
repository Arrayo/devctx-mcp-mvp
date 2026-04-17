import { getRepoMutationSafety } from './repo-safety.js';
import { withStateDb, withStateDbSnapshot } from './storage/sqlite.js';
import { getNetSavedTokens } from './metrics.js';

const WORKFLOW_TRACKING_ENABLED_RE = /^(1|true|yes|on)$/i;
const EMPTY_OBJECT = Object.freeze({});

const parseJson = (value, fallback = EMPTY_OBJECT) => {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const toRoundedPct = (covered, total) => (total > 0 ? Number(((covered / total) * 100).toFixed(2)) : 0);

const buildWorkflowNetMetricsCoverage = ({ source, hasNetMetrics }) => ({
  available: hasNetMetrics,
  source: hasNetMetrics ? source : 'none',
});

const buildSummaryNetMetricsCoverage = ({ coveredWorkflows, totalWorkflows }) => ({
  coveredWorkflows,
  totalWorkflows,
  uncoveredWorkflows: Math.max(0, totalWorkflows - coveredWorkflows),
  coveragePct: toRoundedPct(coveredWorkflows, totalWorkflows),
  complete: totalWorkflows > 0 && coveredWorkflows === totalWorkflows,
});

const getWorkflowMutationSafety = () => getRepoMutationSafety();

const withWorkflowReadDb = (callback) => {
  const safety = getWorkflowMutationSafety();
  const reader = safety.shouldBlock ? withStateDbSnapshot : withStateDb;
  return reader(callback);
};

export const isWorkflowTrackingEnabled = () =>
  WORKFLOW_TRACKING_ENABLED_RE.test(process.env.DEVCTX_WORKFLOW_TRACKING ?? '');

const isWorkflowTrackingAvailable = () => {
  try {
    return withWorkflowReadDb((db) => workflowTableExists(db));
  } catch {
    return false;
  }
};

// Workflow definitions with typical tool sequences and baselines
const WORKFLOW_DEFINITIONS = {
  debugging: {
    name: 'Debugging',
    description: 'Error-first, symbol-focused debugging workflow',
    typicalTools: ['smart_turn', 'smart_search', 'smart_read', 'smart_shell'],
    minTools: 3,
    baselineTokens: 150000, // Typical: read 10 full files, grep output, test logs
    pattern: /debug|error|bug|fix|fail/i,
  },
  'code-review': {
    name: 'Code Review',
    description: 'Diff-aware, API-focused code review workflow',
    typicalTools: ['smart_turn', 'smart_context', 'smart_read', 'git_blame', 'smart_shell'],
    minTools: 3,
    baselineTokens: 200000, // Typical: read 15 full files, diff output, test logs
    pattern: /review|pr|pull.?request|approve/i,
  },
  refactoring: {
    name: 'Refactoring',
    description: 'Graph-aware, test-verified refactoring workflow',
    typicalTools: ['smart_turn', 'smart_context', 'smart_read', 'git_blame', 'smart_shell'],
    minTools: 3,
    baselineTokens: 180000, // Typical: read 12 full files, dependency graph, test logs
    pattern: /refactor|extract|rename|move|restructure/i,
  },
  testing: {
    name: 'Testing',
    description: 'Coverage-aware, TDD-friendly testing workflow',
    typicalTools: ['smart_turn', 'smart_search', 'smart_read', 'smart_context', 'smart_shell'],
    minTools: 3,
    baselineTokens: 120000, // Typical: read 8 full files, test patterns, test logs
    pattern: /test|spec|coverage|tdd/i,
  },
  architecture: {
    name: 'Architecture Exploration',
    description: 'Index-first, minimal-detail architecture exploration',
    typicalTools: ['smart_turn', 'smart_context', 'smart_search', 'smart_read', 'cross_project'],
    minTools: 3,
    baselineTokens: 300000, // Typical: read 20 full files, explore structure
    pattern: /architect|explore|understand|structure|design/i,
  },
};

/**
 * Detect workflow type based on session goal, tools used, and patterns
 */
export const detectWorkflowType = (sessionGoal, toolsUsed) => {
  if (!sessionGoal && toolsUsed.length === 0) {
    return null;
  }

  // Try to match based on session goal
  if (sessionGoal) {
    for (const [type, def] of Object.entries(WORKFLOW_DEFINITIONS)) {
      if (def.pattern.test(sessionGoal)) {
        return type;
      }
    }
  }

  // Try to match based on tools used
  for (const [type, def] of Object.entries(WORKFLOW_DEFINITIONS)) {
    const matchingTools = toolsUsed.filter((tool) => def.typicalTools.includes(tool));
    if (matchingTools.length >= def.minTools) {
      return type;
    }
  }

  return null;
};

/**
 * Calculate baseline tokens for a workflow type
 */
export const getWorkflowBaseline = (workflowType) => {
  const def = WORKFLOW_DEFINITIONS[workflowType];
  return def ? def.baselineTokens : 0;
};

/**
 * Start tracking a workflow
 */
export const startWorkflow = (workflowType, sessionId, metadata = {}) => {
  try {
    if (getWorkflowMutationSafety().shouldBlock) {
      return null;
    }

    return withStateDb((db) => {
      if (!workflowTableExists(db)) {
        return null;
      }

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO workflow_metrics (
        workflow_type,
        session_id,
        start_time,
        baseline_tokens,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      workflowType,
      sessionId,
      now,
      getWorkflowBaseline(workflowType),
      JSON.stringify(metadata),
      now,
    );

      return result.lastInsertRowid;
    });
  } catch {
    return null;
  }
};

/**
 * End tracking a workflow and calculate metrics
 */
export const endWorkflow = (workflowId) => {
  try {
    if (getWorkflowMutationSafety().shouldBlock) {
      return null;
    }

    return withStateDb((db) => {
      if (!workflowTableExists(db)) {
        return null;
      }

    const workflow = db
      .prepare(
        `
      SELECT workflow_type, session_id, start_time, baseline_tokens, metadata_json
      FROM workflow_metrics
      WHERE workflow_id = ?
    `,
      )
      .get(workflowId);

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const now = new Date().toISOString();
    const startTime = new Date(workflow.start_time);
    const endTime = new Date(now);
    const durationMs = endTime - startTime;

    const metrics = db
      .prepare(
        `
      SELECT tool, raw_tokens, compressed_tokens, saved_tokens, metadata_json
      FROM metrics_events
      WHERE session_id = ? AND created_at >= ?
      ORDER BY created_at ASC
    `,
      )
      .all(workflow.session_id, workflow.start_time);

    const rawTokens = metrics.reduce((sum, m) => sum + (m.raw_tokens || 0), 0);
    const compressedTokens = metrics.reduce((sum, m) => sum + (m.compressed_tokens || 0), 0);
    const savedTokens = metrics.reduce((sum, m) => sum + (m.saved_tokens || 0), 0);
    const overheadTokens = metrics.reduce((sum, metric) => {
      try {
        const metadata = JSON.parse(metric.metadata_json || '{}');
        return sum + Math.max(0, Number(metadata.overheadTokens ?? 0));
      } catch {
        return sum;
      }
    }, 0);
    const netSavedTokens = getNetSavedTokens(savedTokens, overheadTokens);
    const savingsPct = rawTokens > 0 ? ((savedTokens / rawTokens) * 100).toFixed(2) : 0;
    const netSavingsPct = rawTokens > 0 ? ((netSavedTokens / rawTokens) * 100).toFixed(2) : 0;

    const baselineTokens = workflow.baseline_tokens || 0;
    const vsBaselinePct = baselineTokens > 0 ? (((baselineTokens - compressedTokens) / baselineTokens) * 100).toFixed(2) : 0;
    const vsBaselineNetPct = baselineTokens > 0 ? (((baselineTokens - (compressedTokens + overheadTokens)) / baselineTokens) * 100).toFixed(2) : 0;
    const persistedMetadata = parseJson(workflow.metadata_json);
    const metadata = {
      ...persistedMetadata,
      summary: {
        ...(persistedMetadata.summary ?? {}),
        overheadTokens,
        netSavedTokens,
        netSavingsPct: Number(netSavingsPct),
        vsBaselineNetPct: Number(vsBaselineNetPct),
      },
    };

    const toolsUsed = [...new Set(metrics.map((m) => m.tool))];
    const stmt = db.prepare(`
      UPDATE workflow_metrics
      SET end_time = ?,
          duration_ms = ?,
          tools_used_json = ?,
          steps_count = ?,
          raw_tokens = ?,
          compressed_tokens = ?,
          saved_tokens = ?,
          savings_pct = ?,
          vs_baseline_pct = ?,
          metadata_json = ?
      WHERE workflow_id = ?
    `);

    stmt.run(
      now,
      durationMs,
      JSON.stringify(toolsUsed),
      metrics.length,
      rawTokens,
      compressedTokens,
      savedTokens,
      savingsPct,
      vsBaselinePct,
      JSON.stringify(metadata),
      workflowId,
    );

      return {
        workflowId,
        workflowType: workflow.workflow_type,
        durationMs,
        toolsUsed,
        stepsCount: metrics.length,
        rawTokens,
        compressedTokens,
        savedTokens,
        overheadTokens,
        netSavedTokens,
        savingsPct: Number(savingsPct),
        netSavingsPct: Number(netSavingsPct),
        baselineTokens,
        vsBaselinePct: Number(vsBaselinePct),
        vsBaselineNetPct: Number(vsBaselineNetPct),
      };
    });
  } catch {
    return null;
  }
};

/**
 * Get workflow metrics summary
 */
export const getWorkflowMetrics = (options = {}) => {
  try {
    return withWorkflowReadDb((db) => {
      if (!workflowTableExists(db)) {
        return [];
      }
    let query = `
      SELECT 
        workflow_id,
        workflow_type,
        session_id,
        start_time,
        end_time,
        duration_ms,
        tools_used_json,
        steps_count,
        raw_tokens,
        compressed_tokens,
        saved_tokens,
        savings_pct,
        baseline_tokens,
        vs_baseline_pct,
        metadata_json,
        created_at
      FROM workflow_metrics
      WHERE 1=1
    `;

    const params = [];

    if (options.workflowType) {
      query += ' AND workflow_type = ?';
      params.push(options.workflowType);
    }

    if (options.sessionId) {
      query += ' AND session_id = ?';
      params.push(options.sessionId);
    }

    if (options.completed !== undefined) {
      if (options.completed) {
        query += ' AND end_time IS NOT NULL';
      } else {
        query += ' AND end_time IS NULL';
      }
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const workflows = db.prepare(query).all(...params);

      return workflows.map((w) => ({
        ...w,
        ...(() => {
          const metadata = parseJson(w.metadata_json);
          const summary = metadata.summary ?? EMPTY_OBJECT;
          const overheadTokens = Number(summary.overheadTokens ?? metadata.overheadTokens);
          const hasOverhead = Number.isFinite(overheadTokens);
          const hasPersistedNetMetrics = Number.isFinite(Number(summary.netSavedTokens));
          const derivedNetSavedTokens = hasOverhead
            ? getNetSavedTokens(w.saved_tokens, overheadTokens)
            : undefined;
          const hasNetMetrics = hasPersistedNetMetrics || hasOverhead;

          return {
            toolsUsed: parseJson(w.tools_used_json, []),
            metadata,
            overheadTokens: hasOverhead ? overheadTokens : undefined,
            netSavedTokens: summary.netSavedTokens ?? derivedNetSavedTokens,
            netSavingsPct: summary.netSavingsPct,
            vsBaselineNetPct: summary.vsBaselineNetPct,
            netMetricsCoverage: buildWorkflowNetMetricsCoverage({
              source: hasPersistedNetMetrics ? 'persisted' : 'derived',
              hasNetMetrics,
            }),
          };
        })(),
      }));
    });
  } catch {
    return [];
  }
};

/**
 * Get workflow summary by type
 */
export const getWorkflowSummaryByType = () => {
  try {
    return withWorkflowReadDb((db) => {
      if (!workflowTableExists(db)) {
        return [];
      }
      const workflows = db
        .prepare(
          `
        SELECT
          workflow_type,
          raw_tokens,
          compressed_tokens,
          saved_tokens,
          savings_pct,
          baseline_tokens,
          vs_baseline_pct,
          duration_ms,
          steps_count,
          metadata_json
        FROM workflow_metrics
        WHERE end_time IS NOT NULL
      `,
        )
        .all();

      const grouped = new Map();

      for (const workflow of workflows) {
        const existing = grouped.get(workflow.workflow_type) ?? {
          workflow_type: workflow.workflow_type,
          count: 0,
          total_raw_tokens: 0,
          total_compressed_tokens: 0,
          total_saved_tokens: 0,
          total_overhead_tokens: 0,
          total_net_saved_tokens: 0,
          net_metrics_count: 0,
          total_baseline_tokens: 0,
          savingsPctSum: 0,
          vsBaselinePctSum: 0,
          durationMsSum: 0,
          stepsCountSum: 0,
        };

        const metadata = parseJson(workflow.metadata_json);
        const summary = metadata.summary ?? EMPTY_OBJECT;
        const overheadTokens = Number(summary.overheadTokens);
        const netSavedTokens = Number(summary.netSavedTokens);
        const hasNetMetrics = Number.isFinite(overheadTokens) && Number.isFinite(netSavedTokens);

        existing.count += 1;
        existing.total_raw_tokens += workflow.raw_tokens || 0;
        existing.total_compressed_tokens += workflow.compressed_tokens || 0;
        existing.total_saved_tokens += workflow.saved_tokens || 0;
        existing.total_baseline_tokens += workflow.baseline_tokens || 0;
        existing.savingsPctSum += workflow.savings_pct || 0;
        existing.vsBaselinePctSum += workflow.vs_baseline_pct || 0;
        existing.durationMsSum += workflow.duration_ms || 0;
        existing.stepsCountSum += workflow.steps_count || 0;

        if (hasNetMetrics) {
          existing.total_overhead_tokens += overheadTokens;
          existing.total_net_saved_tokens += netSavedTokens;
          existing.net_metrics_count += 1;
        }

        grouped.set(workflow.workflow_type, existing);
      }

      return [...grouped.values()]
        .sort((left, right) => right.count - left.count)
        .map((item) => ({
          workflow_type: item.workflow_type,
          count: item.count,
          total_raw_tokens: item.total_raw_tokens,
          total_compressed_tokens: item.total_compressed_tokens,
          total_saved_tokens: item.total_saved_tokens,
          total_overhead_tokens: item.total_overhead_tokens,
          total_net_saved_tokens: item.total_net_saved_tokens,
          net_metrics_count: item.net_metrics_count,
          netMetricsCoverage: buildSummaryNetMetricsCoverage({
            coveredWorkflows: item.net_metrics_count,
            totalWorkflows: item.count,
          }),
          total_baseline_tokens: item.total_baseline_tokens,
          avgSavingsPct: Number((item.savingsPctSum / item.count || 0).toFixed(2)),
          avgVsBaselinePct: Number((item.vsBaselinePctSum / item.count || 0).toFixed(2)),
          avgDurationMs: Math.round(item.durationMsSum / item.count || 0),
          avgStepsCount: Math.round(item.stepsCountSum / item.count || 0),
        }));
    });
  } catch {
    return [];
  }
};

/**
 * Check if workflow_metrics table exists
 */
const workflowTableExists = (db) => {
  try {
    const result = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='workflow_metrics'
    `,
      )
      .get();
    return Boolean(result);
  } catch {
    return false;
  }
};

export const getActiveWorkflowForSession = (sessionId) => {
  try {
    return withWorkflowReadDb((db) => {
      if (!workflowTableExists(db)) {
        return null;
      }

      const workflow = db
        .prepare(
          `
        SELECT
          workflow_id,
          workflow_type,
          session_id,
          start_time,
          end_time,
          duration_ms,
          tools_used_json,
          steps_count,
          raw_tokens,
          compressed_tokens,
          saved_tokens,
          savings_pct,
          baseline_tokens,
          vs_baseline_pct,
          metadata_json,
          created_at
        FROM workflow_metrics
        WHERE session_id = ? AND end_time IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
        )
        .get(sessionId);

      if (!workflow) {
        return null;
      }

      return {
        ...workflow,
        toolsUsed: parseJson(workflow.tools_used_json, []),
        metadata: parseJson(workflow.metadata_json),
      };
    });
  } catch {
    return null;
  }
};

/**
 * Auto-detect and track workflow from session
 */
export const autoTrackWorkflow = (sessionId, sessionGoal) => {
  if (!sessionId || !isWorkflowTrackingEnabled()) {
    return null;
  }

  if (getWorkflowMutationSafety().shouldBlock) {
    return null;
  }

  try {
    return withStateDb((db) => {
      // Check if table exists (migration v5)
      if (!workflowTableExists(db)) {
        return null;
      }

    const existing = db
      .prepare(
        `
      SELECT workflow_id
      FROM workflow_metrics
      WHERE session_id = ? AND end_time IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
      )
      .get(sessionId);

    if (existing) {
      return existing.workflow_id;
    }

    const metrics = db
      .prepare(
        `
      SELECT DISTINCT tool
      FROM metrics_events
      WHERE session_id = ?
    `,
      )
      .all(sessionId);

    const toolsUsed = metrics.map((m) => m.tool);

    // Detect workflow type
    const workflowType = detectWorkflowType(sessionGoal, toolsUsed);

    if (!workflowType) {
      return null;
    }

      return startWorkflow(workflowType, sessionId, { autoDetected: true, goal: sessionGoal });
    });
  } catch {
    return null;
  }
};

export { WORKFLOW_DEFINITIONS };
