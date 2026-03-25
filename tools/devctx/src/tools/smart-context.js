import path from 'node:path';
import fs from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { smartSearch, VALID_INTENTS } from './smart-search.js';
import { smartRead } from './smart-read.js';
import { loadIndex, queryRelated } from '../index.js';
import { projectRoot } from '../utils/paths.js';
import { resolveSafePath } from '../utils/fs.js';
import { countTokens } from '../tokenCounter.js';
import { persistMetrics } from '../metrics.js';

const execFile = promisify(execFileCallback);

const INTENT_KEYWORDS = {
  debug: ['debug', 'fix', 'error', 'bug', 'crash', 'fail', 'broken', 'issue', 'trace'],
  tests: ['test', 'spec', 'coverage', 'assert', 'mock', 'jest', 'vitest'],
  config: ['config', 'env', 'setup', 'deploy', 'docker', 'ci', 'terraform', 'yaml'],
  docs: ['doc', 'readme', 'explain', 'document', 'guide'],
  implementation: ['implement', 'add', 'create', 'build', 'feature', 'refactor', 'update', 'modify'],
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'and', 'or', 'but', 'not', 'this', 'that', 'it',
  'how', 'what', 'where', 'when', 'why', 'which', 'who', 'do', 'does', 'did',
  'has', 'have', 'had', 'from', 'by', 'about', 'into', 'my', 'our', 'your',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'i', 'we', 'you',
  'all', 'each', 'every', 'me', 'us', 'them', 'its',
]);

const IDENTIFIER_RE = /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[A-Z][a-zA-Z0-9]{2,}\b|\b[a-z]{2,}_[a-z_]+\b/g;

const ROLE_PRIORITY = ['primary', 'test', 'dependency', 'dependent'];

export const inferIntent = (task) => {
  const lower = task.toLowerCase();
  let best = 'explore';
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = intent; }
  }

  return best;
};

export const extractSymbolCandidates = (task) =>
  [...new Set(task.match(IDENTIFIER_RE) || [])];

export const extractSearchQueries = (task) => {
  const symbols = extractSymbolCandidates(task);
  const intentKws = new Set(Object.values(INTENT_KEYWORDS).flat());

  const keywords = task.split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9_]/g, ''))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()) && !intentKws.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length);

  const queries = [...symbols];
  for (const kw of keywords) {
    if (!queries.some((q) => q.toLowerCase() === kw.toLowerCase())) queries.push(kw);
  }

  return queries.slice(0, 3);
};

const expandWithGraph = (primaryAbsPaths, index, root) => {
  const files = new Map();

  for (const abs of primaryAbsPaths) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    files.set(rel, { role: 'primary', absPath: abs });
  }

  if (!index) return { files, neighbors: [] };

  const allNeighbors = new Set();

  for (const abs of primaryAbsPaths) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (!index.files?.[rel]) continue;

    const related = queryRelated(index, rel);

    for (const p of related.imports) {
      if (!files.has(p)) files.set(p, { role: 'dependency', absPath: path.join(root, p) });
    }
    for (const p of related.importedBy) {
      if (!files.has(p)) files.set(p, { role: 'dependent', absPath: path.join(root, p) });
    }
    for (const p of related.tests) {
      if (!files.has(p)) files.set(p, { role: 'test', absPath: path.join(root, p) });
    }
    for (const p of related.neighbors) {
      if (!files.has(p)) allNeighbors.add(p);
    }
  }

  return { files, neighbors: [...allNeighbors] };
};

const checkIndexFreshness = (idx, absPaths, root) => {
  if (!idx) return 'unavailable';
  for (const abs of absPaths) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const entry = idx.files?.[rel];
    if (!entry) continue;
    try {
      const diskMtime = Math.floor(fs.statSync(abs).mtimeMs);
      if (diskMtime !== entry.mtime) return 'stale';
    } catch { /* file gone or unreadable */ }
  }
  return 'fresh';
};

const allocateReads = (files, maxTokens, intent) => {
  const maxFiles = Math.min(10, Math.ceil(maxTokens / 800));
  const tightBudget = maxTokens < 4000;

  const byRole = {};
  for (const [rel, info] of files) {
    if (!byRole[info.role]) byRole[info.role] = [];
    byRole[info.role].push({ rel, ...info });
  }

  const roleLimits = {
    primary: 5,
    test: intent === 'tests' ? 3 : 2,
    dependency: 3,
    dependent: 2,
  };

  const plan = [];

  for (const role of ROLE_PRIORITY) {
    if (plan.length >= maxFiles) break;
    const candidates = byRole[role] || [];
    const limit = Math.min(candidates.length, roleLimits[role], maxFiles - plan.length);
    const mode = role === 'primary' && !tightBudget ? 'outline' : 'signatures';

    for (let i = 0; i < limit; i++) {
      plan.push({ rel: candidates[i].rel, absPath: candidates[i].absPath, role, mode });
    }
  }

  return plan;
};

const BLOCKED_REF_RE = /[|&;<>`\n\r$(){}]/;

export const getChangedFiles = async (diff, root) => {
  const ref = diff === true ? 'HEAD' : String(diff);

  if (BLOCKED_REF_RE.test(ref)) {
    return { ref, files: [], skippedDeleted: 0, error: 'Invalid ref: contains shell metacharacters' };
  }

  try {
    const { stdout } = await execFile('git', ['diff', '--name-only', ref], {
      cwd: root,
      timeout: 10000,
    });

    const allPaths = stdout.split('\n').map((l) => l.trim()).filter(Boolean);

    if (ref === 'HEAD') {
      try {
        const { stdout: untrackedOut } = await execFile(
          'git', ['ls-files', '--others', '--exclude-standard'],
          { cwd: root, timeout: 10000 },
        );
        for (const u of untrackedOut.split('\n').map((l) => l.trim()).filter(Boolean)) {
          if (!allPaths.includes(u)) allPaths.push(u);
        }
      } catch { /* ignore — untracked listing is best-effort */ }
    }

    let skippedDeleted = 0;
    const files = [];

    for (const rel of allPaths) {
      const abs = path.join(root, rel);
      if (fs.existsSync(abs)) {
        files.push(rel);
      } else {
        skippedDeleted++;
      }
    }

    return { ref, files, skippedDeleted };
  } catch (err) {
    const msg = err.stderr?.trim() || err.message || 'git diff failed';
    return { ref, files: [], skippedDeleted: 0, error: msg };
  }
};

const filterFoundSymbols = (content, candidates) => {
  if (candidates.length <= 1) {
    return content.includes('Symbol not found') ? null : content;
  }

  const sections = content.split(/(?=^--- )/m);
  const kept = sections.filter((s) => !s.includes('Symbol not found'));
  if (kept.length === 0) return null;
  return kept.join('').trim();
};

export const smartContext = async ({ task, intent, maxTokens = 8000, entryFile, diff }) => {
  const resolvedIntent = (intent && VALID_INTENTS.has(intent)) ? intent : inferIntent(task);
  const root = projectRoot;

  let topAbsPaths;
  let searchIndexFreshness;
  let diffSummary = null;

  if (diff) {
    const changed = await getChangedFiles(diff, root);
    const changedAbs = changed.files.map((rel) => path.join(root, rel));
    topAbsPaths = changedAbs;
    diffSummary = {
      ref: changed.ref,
      totalChanged: changed.files.length + changed.skippedDeleted,
      included: Math.min(changed.files.length, 5),
      skippedDeleted: changed.skippedDeleted,
    };
    if (changed.error) diffSummary.error = changed.error;
    searchIndexFreshness = null;
  } else {
    const queries = extractSearchQueries(task);
    const primaryQuery = queries[0] || task.split(/\s+/).find((w) => w.length > 2) || task;
    const searchResult = await smartSearch({ query: primaryQuery, cwd: '.', intent: resolvedIntent });
    topAbsPaths = searchResult.topFiles.map((f) => f.file);
    searchIndexFreshness = searchResult.indexFreshness;
  }

  if (entryFile) {
    try {
      const abs = resolveSafePath(entryFile);
      if (fs.existsSync(abs)) {
        const idx = topAbsPaths.indexOf(abs);
        if (idx > 0) topAbsPaths.splice(idx, 1);
        if (idx !== 0) topAbsPaths.unshift(abs);
      }
    } catch { /* invalid path — skip */ }
  }

  const primaryFiles = topAbsPaths.slice(0, 5);

  const index = loadIndex(root);

  const indexFreshness = searchIndexFreshness ?? checkIndexFreshness(index, primaryFiles, root);

  const { files: expanded, neighbors } = expandWithGraph(primaryFiles, index, root);

  const readPlan = allocateReads(expanded, maxTokens, resolvedIntent);

  const context = [];
  let totalRawTokens = 0;
  let totalCompressedTokens = 0;

  for (const item of readPlan) {
    try {
      const readResult = await smartRead({ filePath: item.absPath, mode: item.mode });
      const itemTokens = countTokens(readResult.content);

      if (totalCompressedTokens + itemTokens > maxTokens && context.length > 0) break;

      const fileSymbols = index?.files?.[item.rel]?.symbols?.map((s) => s.name) ?? [];

      context.push({
        file: item.rel,
        role: item.role,
        readMode: item.mode,
        ...(fileSymbols.length > 0 ? { symbols: fileSymbols.slice(0, 10) } : {}),
        content: readResult.content,
      });

      totalRawTokens += readResult.metrics.rawTokens;
      totalCompressedTokens += itemTokens;
    } catch { /* unreadable file — skip */ }
  }

  const symbolCandidates = extractSymbolCandidates(task);

  if (symbolCandidates.length > 0 && readPlan.length > 0) {
    const topPrimary = readPlan.find((p) => p.role === 'primary');
    if (topPrimary) {
      try {
        const symbolResult = await smartRead({
          filePath: topPrimary.absPath,
          mode: 'symbol',
          symbol: symbolCandidates.slice(0, 3),
        });

        const filtered = filterFoundSymbols(symbolResult.content, symbolCandidates);
        if (filtered) {
          const symbolTokens = countTokens(filtered);
          if (totalCompressedTokens + symbolTokens <= maxTokens) {
            context.push({
              file: topPrimary.rel,
              role: 'symbolDetail',
              readMode: 'symbol',
              content: filtered,
            });
            totalCompressedTokens += symbolTokens;
          }
        }
      } catch { /* skip */ }
    }
  }

  const graphSummary = {
    primaryImports: [],
    tests: [],
    dependents: [],
    neighbors,
  };

  for (const [rel, info] of expanded) {
    if (info.role === 'dependency') graphSummary.primaryImports.push(rel);
    else if (info.role === 'test') graphSummary.tests.push(rel);
    else if (info.role === 'dependent') graphSummary.dependents.push(rel);
  }

  const hints = [];
  const excludedNeighbors = neighbors.filter((n) => !expanded.has(n));
  if (excludedNeighbors.length > 0) {
    hints.push(`${excludedNeighbors.length} neighbor file(s) available: ${excludedNeighbors.slice(0, 3).join(', ')}`);
  }
  if (indexFreshness === 'stale') {
    hints.push('Index is stale — run build_index for better results');
  }
  if (indexFreshness === 'unavailable') {
    hints.push('No symbol index — run build_index for graph expansion and ranking boosts');
  }
  if (diff && context.length === 0) {
    hints.push(diffSummary?.error || 'No changed files found for the given diff ref');
  }
  if (context.length > 0 && symbolCandidates.length === 0) {
    const topCtx = context[0];
    if (topCtx.symbols?.length) {
      hints.push(`Inspect symbols with smart_read: ${topCtx.symbols.slice(0, 3).join(', ')}`);
    }
  }

  const savingsPct = totalRawTokens > 0
    ? Math.round(((totalRawTokens - totalCompressedTokens) / totalRawTokens) * 100)
    : 0;

  const compressedText = context.map((c) => c.content).join('\n');
  const totalTokens = countTokens(compressedText);

  await persistMetrics({
    tool: 'smart_context',
    target: `${root} :: ${task}`,
    rawTokens: totalRawTokens,
    compressedTokens: totalCompressedTokens,
    savedTokens: Math.max(0, totalRawTokens - totalCompressedTokens),
    savingsPct,
    timestamp: new Date().toISOString(),
  });

  const result = {
    task,
    intent: resolvedIntent,
    indexFreshness,
    context,
    graph: graphSummary,
    metrics: {
      totalTokens,
      filesIncluded: new Set(context.map((c) => c.file)).size,
      filesEvaluated: expanded.size,
      savingsPct,
    },
    hints,
  };

  if (diffSummary) {
    diffSummary.included = context.filter((c) => c.role === 'primary').length;
    result.diffSummary = diffSummary;
  }

  return result;
};
