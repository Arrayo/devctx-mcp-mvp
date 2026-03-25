#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, 'results');

const findLatest = (prefix, exclude) => {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .filter((f) => !exclude || !f.startsWith(exclude));
  if (files.length === 0) return null;
  files.sort().reverse();
  return path.join(RESULTS_DIR, files[0]);
};

const inputPath = process.argv[2] ?? findLatest('eval-', 'eval-baseline-') ?? (() => { throw new Error('No eval results found. Run `npm run eval` first.'); })();
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

let baseline = null;
const baselinePath = findLatest('eval-baseline-');
if (baselinePath && baselinePath !== inputPath) {
  try { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); } catch { /* noop */ }
}

const bar = (value, width = 20) => {
  const filled = Math.round(value * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

const delta = (current, base) => {
  if (base == null) return '';
  const diff = current - base;
  const sign = diff >= 0 ? '+' : '';
  return `  (${sign}${typeof current === 'number' && current % 1 !== 0 ? diff.toFixed(3) : Math.round(diff)})`;
};

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║              devctx eval report                     ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log(`  Date:       ${data.timestamp}`);
console.log(`  Mode:       ${data.mode ?? 'full'}`);
console.log(`  Tasks:      ${data.totalTasks}`);
console.log(`  Passed:     ${data.passed}/${data.totalTasks} (${((data.passed / data.totalTasks) * 100).toFixed(0)}%)${delta(data.passed, baseline?.passed)}`);
if (baseline) console.log(`  Baseline:   ${baseline.timestamp} (${baseline.passed}/${baseline.totalTasks})`);
console.log('');

console.log('  ── Scorecard ───────────────────────────────────────');
console.log(`  P@5:              ${bar(data.avgPrecision5)}  ${data.avgPrecision5}${delta(data.avgPrecision5, baseline?.avgPrecision5)}`);
console.log(`  P@10:             ${bar(data.avgPrecision10)}  ${data.avgPrecision10}${delta(data.avgPrecision10, baseline?.avgPrecision10)}`);
console.log(`  Recall:           ${bar(data.avgRecall)}  ${data.avgRecall}${delta(data.avgRecall, baseline?.avgRecall)}`);

if (data.wrongFileRate != null) {
  console.log(`  Wrong-file rate:  ${bar(1 - data.wrongFileRate)}  ${data.wrongFileRate}${delta(data.wrongFileRate, baseline?.wrongFileRate)}`);
}
if (data.retrievalHonesty != null) {
  console.log(`  Retrieval honesty:${bar(data.retrievalHonesty)}  ${data.retrievalHonesty}${delta(data.retrievalHonesty, baseline?.retrievalHonesty)}`);
}
if (data.avgFollowUpReads != null) {
  console.log(`  Avg follow-ups:   ${data.avgFollowUpReads}${delta(data.avgFollowUpReads, baseline?.avgFollowUpReads)}`);
}
if (data.avgTokensToSuccess != null) {
  console.log(`  Tokens to success:${data.avgTokensToSuccess}${delta(data.avgTokensToSuccess, baseline?.avgTokensToSuccess)}`);
}

console.log('');
console.log('  ── Latency & tokens ────────────────────────────────');
console.log(`  Avg latency:      ${data.avgLatencyMs}ms${delta(data.avgLatencyMs, baseline?.avgLatencyMs)}`);
if (data.p50LatencyMs != null) {
  console.log(`  P50 latency:      ${data.p50LatencyMs}ms`);
  console.log(`  P95 latency:      ${data.p95LatencyMs}ms`);
}
console.log(`  Avg tokens:       ${data.avgTokens}${delta(data.avgTokens, baseline?.avgTokens)}`);
if (data.p50Tokens != null) {
  console.log(`  P50 tokens:       ${data.p50Tokens}`);
  console.log(`  P95 tokens:       ${data.p95Tokens}`);
}

console.log('');
console.log('  ── By task type ────────────────────────────────────');

for (const [type, stats] of Object.entries(data.byTaskType)) {
  const passRate = stats.count > 0 ? (stats.passed / stats.count) : 0;
  const wfr = stats.wrongFileRate != null ? `  WF=${stats.wrongFileRate}` : '';
  const fur = stats.avgFollowUpReads != null ? `  FU=${stats.avgFollowUpReads}` : '';
  console.log(`  ${type.padEnd(18)} ${stats.passed}/${stats.count} pass  P@5=${stats.avgPrecision5.toFixed(2)}  R=${stats.avgRecall.toFixed(2)}${wfr}${fur}  ${bar(passRate, 10)}`);
}

const failures = data.results.filter((r) => !r.pass);
if (failures.length > 0) {
  console.log('');
  console.log('  ── Failures ────────────────────────────────────────');
  for (const f of failures) {
    console.log(`  x ${f.id} (${f.taskType}): P@5=${f.precision5.toFixed(2)}, symbols=${f.symbolHits}/${f.symbolTotal}, conf=${f.retrievalConfidence}`);
  }
}

console.log('');
