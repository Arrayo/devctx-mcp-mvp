#!/usr/bin/env node

/**
 * Report adoption metrics - measures real MCP usage in non-trivial tasks
 * 
 * Usage:
 *   npm run report:adoption
 *   npm run report:adoption -- --days 7
 *   npm run report:adoption -- --json
 */

import { withStateDb } from '../src/storage/sqlite.js';
import { WORKFLOW_DEFINITIONS } from '../src/workflow-tracker.js';

const parseArgs = (argv) => {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--days' && argv[i + 1]) {
      args.days = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === '--json') {
      args.json = true;
    }
  }
  return args;
};

const formatPct = (value) => `${value.toFixed(1)}%`;
const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);

/**
 * Classify if a session represents a non-trivial task
 */
const isNonTrivialTask = (sessionEvents, metricsEvents) => {
  // Criteria 1: Multiple operations (≥5)
  if (sessionEvents.length + metricsEvents.length >= 5) return true;

  // Criteria 2: Large file reads (any file >500 lines)
  const hasLargeFileRead = metricsEvents.some(
    (m) => m.tool === 'Read' && m.raw_tokens > 1500 // ~500 lines
  );
  if (hasLargeFileRead) return true;

  // Criteria 3: Multiple file reads (≥3)
  const fileReads = metricsEvents.filter((m) => m.tool === 'Read' || m.tool === 'smart_read');
  if (fileReads.length >= 3) return true;

  // Criteria 4: Repeated searches (≥2)
  const searches = metricsEvents.filter((m) => m.tool === 'Grep' || m.tool === 'smart_search');
  if (searches.length >= 2) return true;

  // Criteria 5: Workflow classification
  const devctxTools = metricsEvents.filter((m) =>
    ['smart_turn', 'smart_context', 'smart_search', 'smart_read', 'smart_shell'].includes(m.tool)
  );
  if (devctxTools.length > 0) return true;

  return false;
};

/**
 * Check if session used devctx tools
 */
const usedDevctx = (metricsEvents) => {
  const devctxTools = ['smart_turn', 'smart_context', 'smart_search', 'smart_read', 'smart_shell', 'smart_read_batch'];
  return metricsEvents.some((m) => devctxTools.includes(m.tool));
};

/**
 * Calculate adoption metrics
 */
const calculateAdoptionMetrics = (days = 30) => {
  return withStateDb((db) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get all sessions since cutoff
    const sessions = db
      .prepare(
        `
      SELECT session_id, snapshot_json, created_at
      FROM sessions
      WHERE created_at >= ?
      ORDER BY created_at DESC
    `
      )
      .all(cutoff);

    const results = {
      totalSessions: sessions.length,
      nonTrivialTasks: 0,
      tasksWithDevctx: 0,
      adoptionRate: 0,
      byWorkflow: {},
      toolUsage: {},
    };

    // Initialize workflow stats
    Object.keys(WORKFLOW_DEFINITIONS).forEach((type) => {
      results.byWorkflow[type] = {
        total: 0,
        withDevctx: 0,
        adoptionRate: 0,
      };
    });

    // Analyze each session
    sessions.forEach((session) => {
      const snapshot = JSON.parse(session.snapshot_json || '{}');
      const sessionId = session.session_id;

      // Get events for this session
      const sessionEvents = db
        .prepare('SELECT * FROM session_events WHERE session_id = ?')
        .all(sessionId);

      const metricsEvents = db
        .prepare('SELECT * FROM metrics_events WHERE session_id = ?')
        .all(sessionId);

      // Check if non-trivial
      if (!isNonTrivialTask(sessionEvents, metricsEvents)) {
        return;
      }

      results.nonTrivialTasks++;

      // Check if used devctx
      const hasDevctx = usedDevctx(metricsEvents);
      if (hasDevctx) {
        results.tasksWithDevctx++;
      }

      // Track tool usage
      metricsEvents.forEach((m) => {
        results.toolUsage[m.tool] = (results.toolUsage[m.tool] || 0) + 1;
      });

      // Classify by workflow if possible
      const goal = snapshot.goal || '';
      let workflowType = null;

      for (const [type, def] of Object.entries(WORKFLOW_DEFINITIONS)) {
        if (def.pattern.test(goal)) {
          workflowType = type;
          break;
        }
      }

      if (workflowType) {
        results.byWorkflow[workflowType].total++;
        if (hasDevctx) {
          results.byWorkflow[workflowType].withDevctx++;
        }
      }
    });

    // Calculate rates
    if (results.nonTrivialTasks > 0) {
      results.adoptionRate = (results.tasksWithDevctx / results.nonTrivialTasks) * 100;
    }

    Object.keys(results.byWorkflow).forEach((type) => {
      const stats = results.byWorkflow[type];
      if (stats.total > 0) {
        stats.adoptionRate = (stats.withDevctx / stats.total) * 100;
      }
    });

    return results;
  });
};

/**
 * Format and print report
 */
const printReport = (metrics, days) => {
  console.log(`\nAdoption Metrics (Last ${days} Days)`);
  console.log('='.repeat(50));
  console.log();

  console.log(`Total Sessions: ${formatNumber(metrics.totalSessions)}`);
  console.log(`Non-Trivial Tasks: ${formatNumber(metrics.nonTrivialTasks)}`);
  console.log(`Tasks with devctx: ${formatNumber(metrics.tasksWithDevctx)}`);
  console.log();

  console.log(`Overall Adoption: ${formatPct(metrics.adoptionRate)}`);
  console.log();

  console.log('By Workflow:');
  Object.entries(metrics.byWorkflow)
    .filter(([, stats]) => stats.total > 0)
    .sort((a, b) => b[1].adoptionRate - a[1].adoptionRate)
    .forEach(([type, stats]) => {
      const def = WORKFLOW_DEFINITIONS[type];
      console.log(
        `  ${def.name.padEnd(25)} ${formatPct(stats.adoptionRate).padStart(7)} (${stats.withDevctx}/${stats.total})`
      );
    });
  console.log();

  console.log('Top devctx Tools:');
  const devctxTools = ['smart_turn', 'smart_context', 'smart_search', 'smart_read', 'smart_shell'];
  Object.entries(metrics.toolUsage)
    .filter(([tool]) => devctxTools.includes(tool))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([tool, count]) => {
      console.log(`  ${tool.padEnd(20)} ${formatNumber(count)} uses`);
    });
  console.log();
};

// Main
const args = parseArgs(process.argv);
const days = args.days || 30;

try {
  const metrics = calculateAdoptionMetrics(days);

  if (args.json) {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    printReport(metrics, days);
  }
} catch (error) {
  console.error('Error calculating adoption metrics:', error.message);
  process.exit(1);
}
