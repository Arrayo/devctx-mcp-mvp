#!/usr/bin/env node
import { withStateDb, insertMetricEvent } from '../src/storage/sqlite.js';
import { startWorkflow, endWorkflow, getWorkflowSummaryByType } from '../src/workflow-tracker.js';

const generateExampleData = () => {
  withStateDb((db) => {
    const sessionId = 'example-debugging-session';
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT OR REPLACE INTO sessions (
        session_id, goal, status, current_focus, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(sessionId, 'Fix TypeError in loginHandler', 'completed', 'Verified fix works', now, now);

    const workflowId = startWorkflow('debugging', sessionId, {
      autoDetected: true,
      goal: 'Fix TypeError in loginHandler',
    });

    console.log(`Started workflow ${workflowId}`);

    const tools = [
      { tool: 'smart_turn', raw: 0, compressed: 0 },
      { tool: 'smart_search', raw: 15000, compressed: 800 },
      { tool: 'smart_read', raw: 5000, compressed: 300 },
      { tool: 'smart_read', raw: 5000, compressed: 250 },
      { tool: 'smart_shell', raw: 8000, compressed: 150 },
      { tool: 'smart_shell', raw: 3000, compressed: 100 },
      { tool: 'smart_turn', raw: 0, compressed: 0 },
    ];

    for (const [index, metric] of tools.entries()) {
      insertMetricEvent(
        db,
        metric.tool,
        'workflow-example',
        sessionId,
        `step-${index + 1}`,
        metric.raw,
        metric.compressed,
        metric.raw - metric.compressed,
        metric.raw > 0 ? (((metric.raw - metric.compressed) / metric.raw) * 100).toFixed(2) : 0,
        null,
        {},
      );
    }

    // Wait 1 second to simulate workflow duration
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      // Busy wait
    }

    const summary = endWorkflow(workflowId);

    console.log('\nWorkflow Summary:');
    console.log(JSON.stringify(summary, null, 2));

    const typeSummary = getWorkflowSummaryByType();

    console.log('\nSummary by Type:');
    console.log(JSON.stringify(typeSummary, null, 2));
  });
};

generateExampleData();
