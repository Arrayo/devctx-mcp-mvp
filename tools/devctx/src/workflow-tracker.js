import { withStateDb } from './storage/sqlite.js';

const WORKFLOW_TRACKING_ENABLED_RE = /^(1|true|yes|on)$/i;

export const isWorkflowTrackingEnabled = () =>
  WORKFLOW_TRACKING_ENABLED_RE.test(process.env.DEVCTX_WORKFLOW_TRACKING ?? '');

const isWorkflowTrackingAvailable = () => {
  try {
    return withStateDb((db) => workflowTableExists(db));
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
    return withStateDb((db) => {
      if (!workflowTableExists(db)) {
        return null;
      }

    // Get workflow start time and session
    const workflow = db
      .prepare(
        `
      SELECT workflow_type, session_id, start_time, baseline_tokens
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

    // Get all metrics for this session since workflow start
    const metrics = db
      .prepare(
        `
      SELECT tool, raw_tokens, compressed_tokens, saved_tokens
      FROM metrics_events
      WHERE session_id = ? AND created_at >= ?
      ORDER BY created_at ASC
    `,
      )
      .all(workflow.session_id, workflow.start_time);

    // Calculate totals
    const rawTokens = metrics.reduce((sum, m) => sum + (m.raw_tokens || 0), 0);
    const compressedTokens = metrics.reduce((sum, m) => sum + (m.compressed_tokens || 0), 0);
    const savedTokens = metrics.reduce((sum, m) => sum + (m.saved_tokens || 0), 0);
    const savingsPct = rawTokens > 0 ? ((savedTokens / rawTokens) * 100).toFixed(2) : 0;

    // Calculate vs baseline
    const baselineTokens = workflow.baseline_tokens || 0;
    const vsBaselinePct = baselineTokens > 0 ? (((baselineTokens - compressedTokens) / baselineTokens) * 100).toFixed(2) : 0;

    // Get unique tools used
    const toolsUsed = [...new Set(metrics.map((m) => m.tool))];

    // Update workflow
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
          vs_baseline_pct = ?
      WHERE workflow_id = ?
    `);

    stmt.run(now, durationMs, JSON.stringify(toolsUsed), metrics.length, rawTokens, compressedTokens, savedTokens, savingsPct, vsBaselinePct, workflowId);

      return {
        workflowId,
        workflowType: workflow.workflow_type,
        durationMs,
        toolsUsed,
        stepsCount: metrics.length,
        rawTokens,
        compressedTokens,
        savedTokens,
        savingsPct: Number(savingsPct),
        baselineTokens,
        vsBaselinePct: Number(vsBaselinePct),
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
    return withStateDb((db) => {
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
        toolsUsed: JSON.parse(w.tools_used_json || '[]'),
        metadata: JSON.parse(w.metadata_json || '{}'),
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
    return withStateDb((db) => {
      if (!workflowTableExists(db)) {
        return [];
      }
      const summary = db
      .prepare(
        `
      SELECT 
        workflow_type,
        COUNT(*) as count,
        SUM(raw_tokens) as total_raw_tokens,
        SUM(compressed_tokens) as total_compressed_tokens,
        SUM(saved_tokens) as total_saved_tokens,
        AVG(savings_pct) as avg_savings_pct,
        SUM(baseline_tokens) as total_baseline_tokens,
        AVG(vs_baseline_pct) as avg_vs_baseline_pct,
        AVG(duration_ms) as avg_duration_ms,
        AVG(steps_count) as avg_steps_count
      FROM workflow_metrics
      WHERE end_time IS NOT NULL
      GROUP BY workflow_type
      ORDER BY count DESC
    `,
      )
      .all();

      return summary.map((s) => ({
        ...s,
        avgSavingsPct: Number(s.avg_savings_pct?.toFixed(2) || 0),
        avgVsBaselinePct: Number(s.avg_vs_baseline_pct?.toFixed(2) || 0),
        avgDurationMs: Math.round(s.avg_duration_ms || 0),
        avgStepsCount: Math.round(s.avg_steps_count || 0),
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
    return withStateDb((db) => {
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
        toolsUsed: JSON.parse(workflow.tools_used_json || '[]'),
        metadata: JSON.parse(workflow.metadata_json || '{}'),
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
  if (!isWorkflowTrackingEnabled()) {
    return null;
  }

  try {
    return withStateDb((db) => {
      // Check if table exists (migration v5)
      if (!workflowTableExists(db)) {
        return null;
      }

    // Check if workflow already tracked for this session
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

    // Get tools used so far in this session
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

      // Start tracking
      return startWorkflow(workflowType, sessionId, { autoDetected: true, goal: sessionGoal });
    });
  } catch {
    return null;
  }
};

export { WORKFLOW_DEFINITIONS };
