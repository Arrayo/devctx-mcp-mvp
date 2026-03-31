#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dynamic import to handle SQLite availability
let workflowTracker;
try {
  workflowTracker = await import('../src/workflow-tracker.js');
} catch {
  workflowTracker = await import('../src/workflow-tracker-stub.js');
}

const { getWorkflowMetrics, getWorkflowSummaryByType, WORKFLOW_DEFINITIONS } = workflowTracker;

const parseArgs = (argv) => {
  const options = {
    type: null,
    sessionId: null,
    limit: 10,
    json: false,
    summary: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--type') {
      options.type = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--session') {
      options.sessionId = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--limit') {
      options.limit = parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (token === '--json') {
      options.json = true;
      continue;
    }

    if (token === '--summary') {
      options.summary = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      console.log(`
Usage: report-workflow-metrics [options]

Options:
  --type <type>       Filter by workflow type (debugging, code-review, refactoring, testing, architecture)
  --session <id>      Filter by session ID
  --limit <n>         Limit number of workflows (default: 10)
  --summary           Show summary by workflow type
  --json              Output as JSON
  --help, -h          Show this help

Examples:
  # Show summary by workflow type
  npm run report:workflows -- --summary

  # Show last 10 debugging workflows
  npm run report:workflows -- --type debugging

  # Show workflows for specific session
  npm run report:workflows -- --session abc123

  # Output as JSON
  npm run report:workflows -- --json
      `);
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

const printSummary = (summary) => {
  console.log('');
  console.log('Workflow Metrics Summary');
  console.log('═'.repeat(120));
  console.log('');

  if (!Array.isArray(summary) || summary.length === 0) {
    console.log('No completed workflows found.');
    console.log('');
    console.log('Workflows are tracked when:');
    console.log('  1. Agent calls smart_turn(start) with a task description');
    console.log('  2. Task matches a workflow pattern (debugging, review, refactor, testing, architecture)');
    console.log('  3. Agent calls smart_turn(end) to complete the workflow');
    console.log('');
    return;
  }

  const totalWorkflows = summary.reduce((sum, s) => sum + s.count, 0);
  const totalRaw = summary.reduce((sum, s) => sum + s.total_raw_tokens, 0);
  const totalCompressed = summary.reduce((sum, s) => sum + s.total_compressed_tokens, 0);
  const totalSaved = summary.reduce((sum, s) => sum + s.total_saved_tokens, 0);
  const totalOverhead = summary.reduce((sum, s) => sum + (s.total_overhead_tokens || 0), 0);
  const totalNetSaved = summary.reduce((sum, s) => sum + (s.total_net_saved_tokens || 0), 0);
  const totalNetCoverage = summary.reduce((sum, s) => sum + (s.net_metrics_count || 0), 0);
  const totalBaseline = summary.reduce((sum, s) => sum + s.total_baseline_tokens, 0);
  const totalSavedPct = totalRaw > 0 ? ((totalSaved / totalRaw) * 100).toFixed(2) : '0.00';
  const totalNetSavedPct = totalRaw > 0 ? ((totalNetSaved / totalRaw) * 100).toFixed(2) : '0.00';
  const baselineSavingsPct = totalBaseline > 0
    ? (((totalBaseline - totalCompressed) / totalBaseline) * 100).toFixed(2)
    : '0.00';

  console.log(`Total Workflows: ${formatNumber(totalWorkflows)}`);
  console.log(`Total Raw Tokens: ${formatNumber(totalRaw)}`);
  console.log(`Total Compressed Tokens: ${formatNumber(totalCompressed)}`);
  console.log(`Total Saved Tokens: ${formatNumber(totalSaved)} (${totalSavedPct}%)`);
  if (totalNetCoverage > 0) {
    console.log(`Total Overhead Tokens: ${formatNumber(totalOverhead)}`);
    console.log(
      `Total Net Saved Tokens${totalNetCoverage < totalWorkflows ? ` (${formatNumber(totalNetCoverage)}/${formatNumber(totalWorkflows)} workflows)` : ''}: ${formatNumber(totalNetSaved)} (${totalNetSavedPct}%)`,
    );
  }
  console.log(`Total Baseline Tokens: ${formatNumber(totalBaseline)}`);
  console.log(`Savings vs Baseline: ${formatNumber(totalBaseline - totalCompressed)} (${baselineSavingsPct}%)`);
  console.log('');
  console.log('By Workflow Type:');
  console.log('─'.repeat(120));
  console.log(
    'Type'.padEnd(20) +
      'Count'.padStart(8) +
      'Avg Steps'.padStart(12) +
      'Avg Duration'.padStart(15) +
      'Avg Savings'.padStart(15) +
      'vs Baseline'.padStart(15),
  );
  console.log('─'.repeat(120));

  for (const s of summary) {
    const def = WORKFLOW_DEFINITIONS[s.workflow_type];
    const name = def ? def.name : s.workflow_type;

    console.log(
      name.padEnd(20) +
        formatNumber(s.count).padStart(8) +
        s.avgStepsCount.toString().padStart(12) +
        formatDuration(s.avgDurationMs).padStart(15) +
        `${s.avgSavingsPct}%`.padStart(15) +
        `${s.avgVsBaselinePct}%`.padStart(15),
    );
  }

  console.log('─'.repeat(120));
  console.log('');

  // Show detailed breakdown for each workflow type
  console.log('Detailed Breakdown:');
  console.log('');

  for (const s of summary) {
    const def = WORKFLOW_DEFINITIONS[s.workflow_type];
    const name = def ? def.name : s.workflow_type;

    console.log(`${name}:`);
    console.log(`  Workflows: ${formatNumber(s.count)}`);
    console.log(`  Avg Steps: ${s.avgStepsCount}`);
    console.log(`  Avg Duration: ${formatDuration(s.avgDurationMs)}`);
    console.log(`  Total Raw Tokens: ${formatNumber(s.total_raw_tokens)}`);
    console.log(`  Total Compressed Tokens: ${formatNumber(s.total_compressed_tokens)}`);
    console.log(`  Total Saved Tokens: ${formatNumber(s.total_saved_tokens)} (${s.avgSavingsPct}%)`);
    if (s.net_metrics_count > 0) {
      console.log(`  Total Overhead Tokens: ${formatNumber(s.total_overhead_tokens || 0)}`);
      console.log(
        `  Total Net Saved Tokens${s.net_metrics_count < s.count ? ` (${formatNumber(s.net_metrics_count)}/${formatNumber(s.count)} workflows)` : ''}: ${formatNumber(s.total_net_saved_tokens || 0)}`,
      );
    }
    console.log(`  Baseline Tokens: ${formatNumber(s.total_baseline_tokens)}`);
    console.log(`  Savings vs Baseline: ${formatNumber(s.total_baseline_tokens - s.total_compressed_tokens)} (${s.avgVsBaselinePct}%)`);
    console.log('');
  }
};

const printWorkflows = (workflows) => {
  console.log('');
  console.log('Recent Workflows');
  console.log('═'.repeat(120));
  console.log('');

  if (workflows.length === 0) {
    console.log('No workflows found.');
    console.log('');
    return;
  }

  for (const w of workflows) {
    const def = WORKFLOW_DEFINITIONS[w.workflow_type];
    const name = def ? def.name : w.workflow_type;
    const status = w.end_time ? '✓ Completed' : '⏳ In Progress';

    console.log(`${name} (${status})`);
    console.log(`  Workflow ID: ${w.workflow_id}`);
    console.log(`  Session ID: ${w.session_id || 'N/A'}`);
    console.log(`  Started: ${new Date(w.start_time).toLocaleString()}`);

    if (w.end_time) {
      console.log(`  Ended: ${new Date(w.end_time).toLocaleString()}`);
      console.log(`  Duration: ${formatDuration(w.duration_ms)}`);
      console.log(`  Steps: ${w.steps_count}`);
      console.log(`  Tools Used: ${w.toolsUsed.join(', ')}`);
      console.log(`  Raw Tokens: ${formatNumber(w.raw_tokens)}`);
      console.log(`  Compressed Tokens: ${formatNumber(w.compressed_tokens)}`);
      console.log(`  Saved Tokens: ${formatNumber(w.saved_tokens)} (${w.savings_pct}%)`);
      if (w.overheadTokens !== undefined) {
        console.log(`  Overhead Tokens: ${formatNumber(w.overheadTokens)}`);
      }
      if (w.netSavedTokens !== undefined) {
        console.log(`  Net Saved Tokens: ${formatNumber(w.netSavedTokens)}`);
      }
      console.log(`  Baseline Tokens: ${formatNumber(w.baseline_tokens)}`);
      console.log(`  Savings vs Baseline: ${formatNumber(w.baseline_tokens - w.compressed_tokens)} (${w.vs_baseline_pct}%)`);
    }

    console.log('');
  }
};

const main = async () => {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.summary) {
      const summary = getWorkflowSummaryByType();

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      printSummary(summary);
      return;
    }

    const workflows = getWorkflowMetrics({
      workflowType: options.type,
      sessionId: options.sessionId,
      limit: options.limit,
      completed: true,
    });

    if (options.json) {
      console.log(JSON.stringify(workflows, null, 2));
      return;
    }

    printWorkflows(workflows);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
