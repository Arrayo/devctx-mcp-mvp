import fs from 'node:fs';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { rgPath } from '@vscode/ripgrep';
import { buildMetrics, persistMetrics } from '../metrics.js';
import { loadIndex, queryIndex, queryRelated } from '../index.js';
import { projectRoot } from '../utils/paths.js';
import { isBinaryBuffer, isDockerfile, resolveSafePath } from '../utils/fs.js';
import { truncate } from '../utils/text.js';
import { recordToolUsage } from '../usage-feedback.js';
import { recordDecision, DECISION_REASONS, EXPECTED_BENEFITS } from '../decision-explainer.js';
import { recordDevctxOperation } from '../missed-opportunities.js';
import { IGNORED_DIRS, IGNORED_FILE_NAMES, IGNORED_FILE_PATTERNS } from '../config/ignored-paths.js';
import { buildMetricsDisplay } from '../utils/metrics-display.js';
import { createProgressReporter } from '../streaming.js';
import { ensureIndexReady } from '../index-manager.js';

const execFile = promisify(execFileCallback);
const supportedGlobs = [
  '*.js', '*.jsx', '*.ts', '*.tsx', '*.json', '*.mjs', '*.cjs',
  '*.py', '*.toml', '*.yaml', '*.yml', '*.md', '*.graphql', '*.gql', '*.sql',
  '*.go', '*.rs', '*.java', '*.sh', '*.bash', '*.zsh', '*.tf', '*.tfvars', '*.hcl',
  'Dockerfile', 'Dockerfile.*',
];
const ignoredDirs = IGNORED_DIRS;
const ignoredFileNames = new Set(IGNORED_FILE_NAMES);
const fallbackExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.mjs', '.cjs', '.py', '.toml', '.yaml', '.yml', '.md', '.graphql', '.gql', '.sql', '.go', '.rs', '.java', '.sh', '.bash', '.zsh', '.tf', '.tfvars', '.hcl']);
const likelySourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.graphql', '.gql', '.sql', '.go', '.rs', '.java', '.sh', '.bash', '.zsh']);
const likelyConfigExtensions = new Set(['.json', '.toml', '.yaml', '.yml', '.tf', '.tfvars', '.hcl']);
const lowSignalNames = ['changelog', 'readme', 'migration', 'license', 'licence', 'contributing', 'authors', 'code_of_conduct', 'security', 'history'];
const testPatterns = ['.test.', '.spec.', '__tests__', '__mocks__', 'fixtures'];

export const VALID_INTENTS = new Set(['implementation', 'debug', 'tests', 'config', 'docs', 'explore']);

export const intentWeights = {
  implementation: { src: 10, source: 14, config: 4, lowSignal: -35, test: -15 },
  debug:          { src: 10, source: 14, config: 4, lowSignal: -35, test: -15 },
  tests:          { src: 5,  source: 10, config: 0, lowSignal: -35, test: 10 },
  config:         { src: 0,  source: 0,  config: 14, lowSignal: -20, test: -15 },
  docs:           { src: 0,  source: 4,  config: 4, lowSignal: -10, test: -15 },
  explore:        { src: 10, source: 14, config: 4, lowSignal: -35, test: -15 },
};

const defaultWeights = intentWeights.explore;

const shouldIgnoreFile = (filePath) => {
  const base = path.basename(filePath);
  if (ignoredFileNames.has(base)) return true;
  if (IGNORED_FILE_PATTERNS.some((p) => p.test(base))) return true;
  return false;
};

const isSearchableFile = (entryName, fullPath) => fallbackExtensions.has(path.extname(entryName)) || isDockerfile(fullPath);

export const walk = (dir, files = [], stats = { skippedDirs: 0 }) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    stats.skippedDirs++;
    return files;
  }

  for (const entry of entries) {
    if (ignoredDirs.includes(entry.name) || ignoredFileNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files, stats);
      continue;
    }

    if (isSearchableFile(entry.name, fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
};

const parseRgLine = (line, root) => {
  const match = /^(.*?):(\d+):(.*)$/.exec(line);

  if (!match) {
    return null;
  }

  const [, relativePath, lineNumber, content] = match;
  return {
    file: path.join(root, relativePath),
    lineNumber: Number(lineNumber),
    content,
  };
};

const MAX_FILE_SIZE = '1M';

const buildRgBaseArgs = () => {
  const args = [
    '--line-number',
    '--no-heading',
    '--color', 'never',
    '--smart-case',
    '--max-filesize', MAX_FILE_SIZE,
  ];
  for (const dir of ignoredDirs) {
    args.push('--glob', `!${dir}/**`);
    args.push('--glob', `!**/${dir}/**`);
  }
  for (const fileName of ignoredFileNames) {
    args.push('--glob', `!${fileName}`);
  }
  for (const extension of supportedGlobs) {
    args.push('--glob', extension);
  }
  return args;
};

const runRg = async (root, pattern, extraArgs = []) => {
  const args = [...buildRgBaseArgs(), ...extraArgs, pattern, '.'];
  try {
    const { stdout } = await execFile(rgPath, args, {
      cwd: root,
      maxBuffer: 1024 * 1024 * 10,
      timeout: 15000,
    });
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => parseRgLine(line, root))
      .filter(Boolean)
      .filter((match) => !shouldIgnoreFile(match.file));
  } catch (error) {
    if (error.code === 1) return [];
    process.stderr.write(`[smart-search] ripgrep failed: ${error.message}\n`);
    return null;
  }
};

const extractTerms = (query) =>
  query
    .split(/[\s,;|/\\]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

const searchWithRipgrep = async (root, query) => {
  // Pass 1: exact literal match
  const exact = await runRg(root, query, ['--fixed-strings']);
  if (exact === null) return null;
  if (exact.length > 0) return { matches: exact, searchMode: 'exact' };

  // Pass 2: regex (handles partial words, snake_case, camelCase fragments)
  const escaped = query.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
  const regex = await runRg(root, escaped);
  if (regex === null) return null;
  if (regex.length > 0) return { matches: regex, searchMode: 'regex' };

  // Pass 3: term expansion — search each significant word independently and merge
  const terms = extractTerms(query);
  if (terms.length < 2) return { matches: [], searchMode: 'exact', zeroReason: 'no_matches' };

  const seen = new Set();
  const merged = [];
  for (const term of terms) {
    const hits = await runRg(root, term, ['--fixed-strings']);
    if (!hits) continue;
    for (const hit of hits) {
      const key = `${hit.file}:${hit.lineNumber}`;
      if (!seen.has(key)) { seen.add(key); merged.push({ ...hit, matchedTerm: term }); }
    }
  }

  return { matches: merged, searchMode: 'terms', terms };
};

const MAX_FALLBACK_FILE_BYTES = 1024 * 1024;

export const isSmartCaseSensitive = (query) => query !== query.toLowerCase();

export const searchWithFallback = (root, query) => {
  const walkStats = { skippedDirs: 0 };
  const files = walk(root, [], walkStats);
  const matches = [];
  const caseSensitive = isSmartCaseSensitive(query);
  const comparator = caseSensitive
    ? (line) => line.includes(query)
    : (line) => line.toLowerCase().includes(query.toLowerCase());
  let skippedLarge = 0;
  let skippedBinary = 0;
  let skippedErrors = 0;

  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_FALLBACK_FILE_BYTES) { skippedLarge++; continue; }

      const buffer = fs.readFileSync(file);
      if (isBinaryBuffer(buffer)) { skippedBinary++; continue; }

      const content = buffer.toString('utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (comparator(line)) {
          matches.push({
            file,
            lineNumber: index + 1,
            content: line,
          });
        }
      });
    } catch {
      skippedErrors++;
    }
  }

  return { matches, caseSensitive, skippedLarge, skippedBinary, skippedErrors, skippedDirs: walkStats.skippedDirs };
};

const formatMatch = (match) => `${match.file}:${match.lineNumber}:${match.content}`;

const scoreGroup = (group, query, intent) => {
  const w = (intent && intentWeights[intent]) || defaultWeights;
  const normalizedQuery = query.toLowerCase();
  const lowerFilePath = group.file.toLowerCase();
  const fileName = path.basename(group.file).toLowerCase();
  const extension = path.extname(group.file).toLowerCase();
  const pathDepth = group.file.split(path.sep).length;
  const sampleText = group.matches.slice(0, 5).map((match) => match.content.toLowerCase()).join(' ');
  const pathSegments = lowerFilePath.split(/[\\/._-]+/).filter(Boolean);
  let score = Math.min(group.count, 12) * 6;

  if (fileName.includes(normalizedQuery)) {
    score += 30;
  }

  if (pathSegments.includes(normalizedQuery)) {
    score += 16;
  }

  if (lowerFilePath.includes(`${path.sep}src${path.sep}`)) {
    score += w.src;
  }

  if (lowerFilePath.includes(`${path.sep}packages${path.sep}`) || lowerFilePath.includes(`${path.sep}apps${path.sep}`)) {
    score += 8;
  }

  if (likelySourceExtensions.has(extension) || isDockerfile(group.file)) {
    score += w.source;
  } else if (likelyConfigExtensions.has(extension)) {
    score += w.config;
  }

  if (sampleText.includes(normalizedQuery)) {
    score += 8;
  }

  if (lowSignalNames.some((name) => fileName.includes(name))) {
    score += w.lowSignal;
  }

  if (testPatterns.some((p) => lowerFilePath.includes(p))) {
    score += w.test;
  }

  score -= Math.min(pathDepth, 12);

  return score;
};

const groupMatches = (matches, query, intent, indexHits, graphHits) => {
  const groups = new Map();

  for (const match of matches) {
    if (!groups.has(match.file)) {
      groups.set(match.file, []);
    }

    groups.get(match.file).push(match);
  }

  const breakdown = { textMatch: 0, indexBoost: 0, graphBoost: 0 };

  const sorted = [...groups.entries()]
    .map(([file, fileMatches]) => {
      let score = scoreGroup({ file, count: fileMatches.length, matches: fileMatches }, query, intent);
      let boostSource = 'text';
      if (indexHits?.has(file)) { score += 50; boostSource = 'index'; }
      else if (graphHits?.has(file)) { score += 25; boostSource = 'graph'; }
      return { file, count: fileMatches.length, score, matches: fileMatches, boostSource };
    })
    .sort((left, right) => right.score - left.score || right.count - left.count || left.file.localeCompare(right.file));

  for (const g of sorted.slice(0, 10)) {
    if (g.boostSource === 'index') breakdown.indexBoost++;
    else if (g.boostSource === 'graph') breakdown.graphBoost++;
    else breakdown.textMatch++;
  }

  return { groups: sorted, breakdown };
};

const buildZeroResultsMessage = (query, searchMode, provenance) => {
  const lines = [`No matches found for: "${query}"`];

  if (searchMode === 'exact') {
    lines.push('• Tried: exact literal match (--fixed-strings)');
    lines.push('• Tried: regex match');
  } else if (searchMode === 'terms') {
    const terms = provenance?.expandedTerms ?? [];
    lines.push(`• Tried: exact, regex, and term expansion (${terms.join(', ')})`);
  }

  lines.push('');
  lines.push('Suggestions:');
  lines.push('  – Use a shorter, more specific term (e.g. a function name, not a phrase)');
  lines.push('  – Try Grep for raw text: the query may be in a file type not indexed by smart_search');
  lines.push('  – Run build_index to enable symbol-level search if the codebase is new');

  return lines.join('\n');
};

const buildCompactResult = (groups, totalMatches, query, root, searchMode, provenance) => {
  if (totalMatches === 0) {
    return buildZeroResultsMessage(query, searchMode, provenance);
  }

  const modeLabel = searchMode === 'exact' ? '' : searchMode === 'regex' ? ' [regex fallback]' : ` [term expansion: ${(provenance?.expandedTerms ?? []).join(', ')}]`;

  if (totalMatches <= 20) {
    const header = modeLabel ? `# Search mode:${modeLabel}\n\n` : '';
    return header + groups
      .flatMap((group) => group.matches)
      .map(formatMatch)
      .join('\n');
  }

  const lines = [
    `query: ${query}${modeLabel}`,
    `root: ${root}`,
    `total matches: ${totalMatches}`,
    `matched files: ${groups.length}`,
    '',
    '# Top files',
  ];

  for (const group of groups.slice(0, 10)) {
    lines.push(`${group.count} match(es), score ${group.score} :: ${group.file}`);
  }

  lines.push('', '# Sample matches');

  for (const group of groups.slice(0, 5)) {
    for (const match of group.matches.slice(0, 3)) {
      lines.push(formatMatch(match));
    }
  }

  return lines.join('\n');
};

export const smartSearch = async ({ query, cwd = '.', intent, _testForceWalk = false, progress: enableProgress = false }) => {
  const progress = enableProgress ? createProgressReporter('smart_search') : null;
  const startTime = Date.now();
  
  if (progress) {
    progress.report({ phase: 'searching', query });
  }
  
  const root = resolveSafePath(cwd);
  const rgResult = _testForceWalk ? null : await searchWithRipgrep(root, query);
  const usedFallback = rgResult === null;
  const engine = usedFallback ? 'walk' : 'rg';

  let rawMatches;
  let provenance;
  let searchMode = 'exact';

  if (usedFallback) {
    const fallback = searchWithFallback(root, query);
    rawMatches = fallback.matches;
    const skippedTotal = fallback.skippedLarge + fallback.skippedBinary + fallback.skippedErrors + fallback.skippedDirs;
    const warnings = ['search used filesystem walk instead of ripgrep'];
    if (skippedTotal > 0) warnings.push(`${skippedTotal} items skipped (${fallback.skippedDirs} dirs, ${fallback.skippedLarge + fallback.skippedBinary + fallback.skippedErrors} files)`);

    provenance = {
      fallbackReason: 'rg unavailable or failed',
      caseMode: fallback.caseSensitive ? 'sensitive' : 'insensitive',
      partial: skippedTotal > 0,
      skippedItemsTotal: skippedTotal,
      skippedLargeFiles: fallback.skippedLarge,
      skippedBinaryFiles: fallback.skippedBinary,
      skippedReadErrors: fallback.skippedErrors,
      skippedDirs: fallback.skippedDirs,
      warnings,
    };
  } else {
    rawMatches = rgResult.matches;
    searchMode = rgResult.searchMode;
    if (rgResult.terms) provenance = { expandedTerms: rgResult.terms };
  }

  rawMatches = rawMatches.filter((match) => !shouldIgnoreFile(match.file));

  const seen = new Set();
  const dedupedMatches = rawMatches.filter((match) => {
    const key = `${match.file}:${match.lineNumber}:${match.content.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const validIntent = intent && VALID_INTENTS.has(intent) ? intent : undefined;

  const indexRoot = projectRoot;
  let indexHits = null;
  let graphHits = null;
  let indexFreshness = 'unavailable';
  let loadedIndex = null;
  
  if (progress) {
    progress.report({ phase: 'ranking', rawMatches: rawMatches.length });
  }
  
  await ensureIndexReady({ root: indexRoot });
  
  try {
    loadedIndex = loadIndex(indexRoot);
    if (loadedIndex) {
      indexFreshness = 'fresh';
      const hits = queryIndex(loadedIndex, query);
      if (hits.length > 0) {
        indexHits = new Set(hits.map((h) => path.join(indexRoot, h.path)));
        const related = new Set();
        for (const h of hits) {
          const rel = queryRelated(loadedIndex, h.path);
          for (const p of [...rel.importedBy, ...rel.tests, ...rel.imports]) {
            const full = path.join(indexRoot, p);
            if (!indexHits.has(full)) related.add(full);
          }
        }
        if (related.size > 0) graphHits = related;
      }
    }
  } catch {
    // index unavailable — continue without it
  }

  const { groups, breakdown } = groupMatches(dedupedMatches, query, validIntent, indexHits, graphHits);

  if (loadedIndex && indexFreshness === 'fresh') {
    const topRelPaths = groups.slice(0, 10).map((g) => path.relative(indexRoot, g.file).replace(/\\/g, '/'));
    for (const rp of topRelPaths) {
      const entry = loadedIndex.files?.[rp];
      if (!entry) continue;
      try {
        const diskMtime = Math.floor(fs.statSync(path.join(indexRoot, rp)).mtimeMs);
        if (diskMtime !== entry.mtime) { indexFreshness = 'stale'; break; }
      } catch { /* file gone or unreadable */ }
    }
  }

  const rawText = dedupedMatches.map(formatMatch).join('\n');
  const compressedText = truncate(buildCompactResult(groups, dedupedMatches.length, query, root, searchMode, provenance), 5000);
  const metrics = buildMetrics({
    tool: 'smart_search',
    target: `${root} :: ${query}`,
    rawText,
    compressedText,
  });

  await persistMetrics(metrics);
  
  // Record usage for feedback
  recordToolUsage({
    tool: 'smart_search',
    savedTokens: metrics.savedTokens,
    target: query,
  });
  
  // Record devctx operation for missed opportunity detection
  recordDevctxOperation();
  
  // Record decision explanation
  let reason = DECISION_REASONS.MULTIPLE_FILES;
  if (validIntent) {
    reason = DECISION_REASONS.INTENT_AWARE;
  }
  if (indexHits && indexHits.size > 0) {
    reason = DECISION_REASONS.INDEX_BOOST;
  }
  
  recordDecision({
    tool: 'smart_search',
    action: `search "${query}"${validIntent ? ` (intent: ${validIntent})` : ''}`,
    reason,
    alternative: 'Grep (unranked results)',
    expectedBenefit: `${EXPECTED_BENEFITS.TOKEN_SAVINGS(metrics.savedTokens)}, ${EXPECTED_BENEFITS.BETTER_RANKING}`,
    context: `${dedupedMatches.length} matches in ${groups.length} files, ranked by relevance`,
  });

  let retrievalConfidence = 'high';
  if (dedupedMatches.length === 0) retrievalConfidence = 'none';
  else if (searchMode === 'terms') retrievalConfidence = 'low';
  else if (searchMode === 'regex') retrievalConfidence = 'medium';
  else if (usedFallback) retrievalConfidence = provenance?.skippedItemsTotal > 0 ? 'low' : 'medium';
  else if (provenance?.skippedItemsTotal > 0) retrievalConfidence = 'low';

  const confidence = { level: retrievalConfidence, indexFreshness };

  const metricsDisplay = buildMetricsDisplay({
    tool: 'smart_search',
    target: query,
    metrics,
    startTime: enableProgress ? startTime : null,
    filesCount: groups.length,
  });

  if (progress) {
    progress.complete({
      query,
      matches: dedupedMatches.length,
      files: groups.length,
      savedTokens: metrics.savedTokens,
      savingsPct: metrics.savingsPct,
    });
  }

  const result = {
    query,
    root,
    engine,
    retrievalConfidence,
    indexFreshness,
    sourceBreakdown: breakdown,
    confidence,
    ...(validIntent ? { intent: validIntent } : {}),
    ...(indexHits ? { indexBoosted: indexHits.size } : {}),
    totalMatches: dedupedMatches.length,
    matchedFiles: groups.length,
    topFiles: groups.slice(0, 10).map((group) => ({ file: group.file, count: group.count, score: group.score })),
    matches: compressedText,
    metrics,
    metricsDisplay,
  };

  if (provenance) result.provenance = provenance;

  return result;
};
