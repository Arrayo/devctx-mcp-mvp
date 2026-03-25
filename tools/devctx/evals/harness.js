#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setProjectRoot } from '../src/utils/paths.js';
import { buildIndex, persistIndex } from '../src/index.js';
import { smartSearch } from '../src/tools/smart-search.js';
import { smartRead } from '../src/tools/smart-read.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, 'fixtures', 'sample-project');
const CORPUS_PATH = path.resolve(__dirname, 'corpus', 'tasks.json');
const RESULTS_DIR = path.resolve(__dirname, 'results');

const isBaseline = process.argv.includes('--baseline');

const normalizeFilePath = (filePath, root) => {
  const rel = path.relative(root, filePath);
  return rel.replace(/\\/g, '/');
};

const percentile = (arr, p) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
};

const evaluateSearch = (result, task, root) => {
  const topFiles = (result.topFiles ?? []).map((f) => normalizeFilePath(f.file, root));
  const top5 = topFiles.slice(0, 5);
  const top10 = topFiles.slice(0, 10);

  const expectedNorm = task.expectedFiles.map((f) => f.replace(/\\/g, '/'));
  const hitsTop5 = expectedNorm.filter((f) => top5.some((t) => t.endsWith(f) || t === f));
  const hitsTop10 = expectedNorm.filter((f) => top10.some((t) => t.endsWith(f) || t === f));

  const wrongFileTop1 = expectedNorm.length > 0 && top5.length > 0
    ? !expectedNorm.some((f) => top5[0].endsWith(f) || top5[0] === f)
    : false;

  return {
    precision5: expectedNorm.length > 0 ? hitsTop5.length / expectedNorm.length : 1,
    precision10: expectedNorm.length > 0 ? hitsTop10.length / expectedNorm.length : 1,
    recall: expectedNorm.length > 0 ? hitsTop10.length / expectedNorm.length : 1,
    wrongFileTop1,
    totalMatches: result.totalMatches,
    matchedFiles: result.matchedFiles,
    engine: result.engine,
    retrievalConfidence: result.retrievalConfidence,
    indexFreshness: result.indexFreshness,
    sourceBreakdown: result.sourceBreakdown,
    searchTokens: result.metrics?.compressedTokens ?? 0,
  };
};

const evaluateSymbol = async (topFile, symbols, root) => {
  if (symbols.length === 0) return { symbolHits: 0, symbolTotal: 0, symbolTokens: 0 };

  const filePath = path.isAbsolute(topFile) ? topFile : path.join(root, topFile);
  if (!fs.existsSync(filePath)) return { symbolHits: 0, symbolTotal: symbols.length, symbolTokens: 0 };

  try {
    const result = await smartRead({ filePath, mode: 'symbol', symbol: symbols });
    const content = result.content ?? '';
    const hits = symbols.filter((s) => content.includes(s) && !content.includes(`Symbol not found: ${s}`));
    return {
      symbolHits: hits.length,
      symbolTotal: symbols.length,
      symbolTokens: result.metrics?.compressedTokens ?? 0,
    };
  } catch {
    return { symbolHits: 0, symbolTotal: symbols.length, symbolTokens: 0 };
  }
};

const taskTypeToIntent = {
  'find-definition': 'implementation',
  debug: 'debug',
  review: 'implementation',
  tests: 'tests',
  refactor: 'implementation',
  config: 'config',
  onboard: 'explore',
  explore: 'explore',
};

const runTask = async (task, root) => {
  const start = Date.now();
  const intent = isBaseline ? undefined : taskTypeToIntent[task.taskType];

  const searchResult = await smartSearch({ query: task.query, cwd: root, intent });
  const searchMetrics = evaluateSearch(searchResult, task, root);

  let symbolMetrics = { symbolHits: 0, symbolTotal: 0, symbolTokens: 0 };
  let followUpReads = 0;
  let tokensToSuccess = searchMetrics.searchTokens;
  let symbolSuccessReached = false;

  if (task.expectedSymbols?.length > 0 && searchResult.topFiles?.length > 0) {
    for (const topFile of searchResult.topFiles.slice(0, 5)) {
      followUpReads++;
      const candidate = await evaluateSymbol(topFile.file, task.expectedSymbols, root);

      if (!symbolSuccessReached) {
        tokensToSuccess += candidate.symbolTokens;
      }

      if (candidate.symbolHits > symbolMetrics.symbolHits) {
        symbolMetrics = candidate;
      }
      if (symbolMetrics.symbolHits === symbolMetrics.symbolTotal) {
        symbolSuccessReached = true;
        break;
      }
    }
  }

  const latencyMs = Date.now() - start;
  const totalTokens = searchMetrics.searchTokens + symbolMetrics.symbolTokens;
  const pass = searchMetrics.precision5 >= 0.5 && (symbolMetrics.symbolTotal === 0 || symbolMetrics.symbolHits > 0);

  const retrievalHonest = (() => {
    const conf = searchMetrics.retrievalConfidence;
    const engine = searchMetrics.engine;
    const freshness = searchMetrics.indexFreshness;
    if (engine === 'walk' && conf === 'high') return false;
    if (freshness === 'stale' && conf === 'high') return false;
    return true;
  })();

  return {
    id: task.id,
    taskType: task.taskType,
    query: task.query,
    latencyMs,
    totalTokens,
    tokensToSuccess,
    followUpReads,
    retrievalHonest,
    ...searchMetrics,
    ...symbolMetrics,
    pass,
  };
};

const run = async () => {
  const corpusArg = process.argv.find((a) => a.startsWith('--corpus='));
  const corpusPath = corpusArg ? path.resolve(corpusArg.split('=')[1]) : CORPUS_PATH;
  const rootArg = process.argv.find((a) => a.startsWith('--root='));
  const evalRoot = rootArg ? path.resolve(rootArg.split('=')[1]) : FIXTURE_ROOT;

  setProjectRoot(evalRoot);

  if (!isBaseline) {
    const index = buildIndex(evalRoot);
    await persistIndex(index, evalRoot);
    const symbolCount = Object.values(index.files).reduce((sum, f) => sum + f.symbols.length, 0);
    process.stdout.write(`Index: ${Object.keys(index.files).length} files, ${symbolCount} symbols\n\n`);
  } else {
    process.stdout.write('Baseline mode: index and intent disabled\n\n');
  }

  const tasks = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const results = [];

  for (const task of tasks) {
    const result = await runTask(task, evalRoot);
    results.push(result);
    const status = result.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`  ${status}  ${result.id} (${result.latencyMs}ms, p5=${result.precision5.toFixed(2)})\n`);
  }

  const latencies = results.map((r) => r.latencyMs);
  const tokenCounts = results.map((r) => r.totalTokens);

  const summary = {
    timestamp: new Date().toISOString(),
    mode: isBaseline ? 'baseline' : 'full',
    fixtureRoot: evalRoot,
    totalTasks: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    avgPrecision5: +(results.reduce((a, r) => a + r.precision5, 0) / results.length).toFixed(3),
    avgPrecision10: +(results.reduce((a, r) => a + r.precision10, 0) / results.length).toFixed(3),
    avgRecall: +(results.reduce((a, r) => a + r.recall, 0) / results.length).toFixed(3),
    wrongFileRate: +(results.filter((r) => r.wrongFileTop1).length / results.length).toFixed(3),
    avgFollowUpReads: +(results.reduce((a, r) => a + r.followUpReads, 0) / results.length).toFixed(2),
    avgTokensToSuccess: Math.round(results.reduce((a, r) => a + r.tokensToSuccess, 0) / results.length),
    retrievalHonesty: +(results.filter((r) => r.retrievalHonest).length / results.length).toFixed(3),
    avgLatencyMs: Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / results.length),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    avgTokens: Math.round(results.reduce((a, r) => a + r.totalTokens, 0) / results.length),
    p50Tokens: percentile(tokenCounts, 50),
    p95Tokens: percentile(tokenCounts, 95),
    byTaskType: {},
    results,
  };

  const taskTypes = [...new Set(results.map((r) => r.taskType))];
  for (const type of taskTypes) {
    const subset = results.filter((r) => r.taskType === type);
    summary.byTaskType[type] = {
      count: subset.length,
      passed: subset.filter((r) => r.pass).length,
      avgPrecision5: +(subset.reduce((a, r) => a + r.precision5, 0) / subset.length).toFixed(3),
      avgRecall: +(subset.reduce((a, r) => a + r.recall, 0) / subset.length).toFixed(3),
      wrongFileRate: +(subset.filter((r) => r.wrongFileTop1).length / subset.length).toFixed(3),
      avgFollowUpReads: +(subset.reduce((a, r) => a + r.followUpReads, 0) / subset.length).toFixed(2),
    };
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const prefix = isBaseline ? 'eval-baseline' : 'eval';
  const outPath = path.join(RESULTS_DIR, `${prefix}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  process.stdout.write(`\nResults: ${outPath}\n`);
  process.stdout.write(`Pass: ${summary.passed}/${summary.totalTasks} | P@5: ${summary.avgPrecision5} | Recall: ${summary.avgRecall} | WrongFile: ${summary.wrongFileRate} | Honesty: ${summary.retrievalHonesty}\n`);
  process.stdout.write(`Latency p50/p95: ${summary.p50LatencyMs}/${summary.p95LatencyMs}ms | Tokens p50/p95: ${summary.p50Tokens}/${summary.p95Tokens}\n`);

  return summary;
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
