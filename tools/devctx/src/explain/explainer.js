import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadIndex, queryIndex, queryRelated } from '../index.js';
import { projectRoot } from '../utils/paths.js';
import { getExplainCache, setExplainCache } from '../storage/sqlite.js';
import { countTokens } from '../tokenCounter.js';

const SIDE_EFFECT_PATTERNS = [
  { kind: 'io', re: /\b(fs|fsPromises)\.(read|write|append|unlink|mkdir|rm|stat|exists|copy|rename)/ },
  { kind: 'io', re: /\b(readFileSync|writeFileSync|appendFileSync|unlinkSync|mkdirSync|rmSync|statSync)\b/ },
  { kind: 'network', re: /\b(fetch|axios|http\.request|https\.request|XMLHttpRequest|WebSocket)\b/ },
  { kind: 'process', re: /\b(process\.(env|exit|kill|chdir)|child_process|execSync|spawnSync|execFile|spawn)\b/ },
  { kind: 'logging', re: /\bconsole\.(log|info|warn|error|debug)\b/ },
  { kind: 'mutation', re: /\b(this\.\w+\s*=|let\s+\w+\s*=|\w+\.push\(|\w+\.splice\(|delete\s+\w+\[)/ },
  { kind: 'throws', re: /\bthrow\s+(new\s+)?\w+/ },
  { kind: 'async', re: /\b(await|Promise\.(all|race|any|allSettled)|setTimeout|setInterval|setImmediate)\b/ },
  { kind: 'db', re: /\b(prepare|execute|query|transaction|raw|knex|pgp)\(/ },
];

const COMMENT_LINE_RE = /^\s*(?:\/\/|#|\*|\/\*\*|\/\*|"""|''')/;
const STRIPPED_COMMENT_RE = /^\s*(?:\/\/+|#+|\*+\/?|\/\*\*?|"""|''')\s?/;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const stripCommentMarkers = (line) =>
  line.replace(STRIPPED_COMMENT_RE, '').replace(/\*\/\s*$/, '').trim();

export const extractDocstring = (lines, signatureLineIndex) => {
  if (signatureLineIndex <= 0) return '';
  const docLines = [];
  for (let i = signatureLineIndex - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line == null) break;
    if (line.trim() === '') {
      if (docLines.length === 0) continue;
      break;
    }
    if (!COMMENT_LINE_RE.test(line)) break;
    docLines.unshift(stripCommentMarkers(line));
  }
  return docLines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 280);
};

export const extractFirstBodyLine = (lines, signatureLineIndex) => {
  for (let i = signatureLineIndex + 1; i < lines.length && i < signatureLineIndex + 12; i += 1) {
    const line = lines[i];
    if (line == null) continue;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed === '{' || COMMENT_LINE_RE.test(trimmed)) continue;
    return trimmed.slice(0, 160);
  }
  return '';
};

export const detectSideEffects = (block) => {
  const found = new Set();
  for (const { kind, re } of SIDE_EFFECT_PATTERNS) {
    if (re.test(block)) found.add(kind);
  }
  return [...found];
};

const extractBlock = (lines, startLine, maxLines = 80) => {
  const startIdx = Math.max(0, (startLine ?? 1) - 1);
  const endIdx = Math.min(lines.length, startIdx + maxLines);
  return {
    block: lines.slice(startIdx, endIdx).join('\n'),
    startIdx,
    endIdx,
  };
};

const countCallers = (index, relPath, symbol) => {
  if (!index) return 0;
  const hits = queryIndex(index, symbol);
  const related = queryRelated(index, relPath);
  const callerFiles = new Set(related.importedBy);
  const externalHits = hits.filter((h) => h.path !== relPath).length;
  return callerFiles.size + externalHits;
};

const lookupSymbolMeta = (index, relPath, symbol) => {
  if (!index) return null;
  const hits = queryIndex(index, symbol);
  const local = hits.find((h) => h.path === relPath);
  return local ?? hits[0] ?? null;
};

export const buildStructuralExplanation = ({
  fullPath,
  content,
  symbol,
  root = projectRoot,
  index = null,
}) => {
  const lines = content.split('\n');
  const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
  const resolvedIndex = index ?? loadIndex(root);
  const meta = lookupSymbolMeta(resolvedIndex, relPath, symbol);

  if (!meta) {
    return null;
  }

  const { block, startIdx } = extractBlock(lines, meta.line, 80);
  const signature = meta.signature ?? lines[startIdx]?.trim() ?? '';
  const docstring = extractDocstring(lines, startIdx);
  const firstBodyLine = extractFirstBodyLine(lines, startIdx);
  const sideEffects = detectSideEffects(block);
  const callers = countCallers(resolvedIndex, relPath, symbol);
  const contentHash = sha256(block);

  return {
    symbol,
    file: relPath,
    line: meta.line,
    kind: meta.kind ?? null,
    parent: meta.parent ?? null,
    signature: signature.slice(0, 200),
    docstring,
    firstBodyLine,
    sideEffects,
    callers,
    contentHash,
  };
};

const formatExplanationText = (explanation) => {
  const lines = [
    `${explanation.symbol} (${explanation.kind ?? 'symbol'}) — ${explanation.file}:${explanation.line}`,
    `signature: ${explanation.signature || '<unknown>'}`,
  ];
  if (explanation.parent) lines.push(`parent: ${explanation.parent}`);
  if (explanation.docstring) lines.push(`docs: ${explanation.docstring}`);
  if (explanation.firstBodyLine) lines.push(`first body: ${explanation.firstBodyLine}`);
  if (explanation.sideEffects.length > 0) lines.push(`side effects: ${explanation.sideEffects.join(', ')}`);
  lines.push(`callers: ${explanation.callers}`);
  return lines.join('\n');
};

export const explainSymbol = async ({
  fullPath,
  content,
  symbol,
  root = projectRoot,
  index = null,
  useCache = true,
}) => {
  const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
  const partial = buildStructuralExplanation({ fullPath, content, symbol, root, index });

  if (!partial) {
    return {
      symbol,
      file: relPath,
      found: false,
      text: `Symbol not found in index or content: ${symbol}`,
      cached: false,
      provider: 'structural',
    };
  }

  if (useCache) {
    try {
      const cached = await getExplainCache({
        relPath,
        symbol,
        contentHash: partial.contentHash,
      });
      if (cached?.explanation) {
        const text = formatExplanationText(cached.explanation);
        return {
          ...cached.explanation,
          found: true,
          text,
          cached: true,
          provider: cached.provider,
        };
      }
    } catch {
      // cache unavailable — fall through and recompute
    }
  }

  const text = formatExplanationText(partial);
  const tokens = countTokens(text);

  if (useCache) {
    try {
      await setExplainCache({
        relPath,
        symbol,
        contentHash: partial.contentHash,
        explanation: partial,
        provider: 'structural',
        tokens,
      });
    } catch {
      // best-effort cache write
    }
  }

  return {
    ...partial,
    found: true,
    text,
    cached: false,
    provider: 'structural',
  };
};

export const explainSymbols = async ({ fullPath, content, symbols, root = projectRoot, index = null, useCache = true }) => {
  const list = Array.isArray(symbols) ? symbols : [symbols];
  const results = [];
  for (const sym of list) {
    if (!sym) continue;
    results.push(await explainSymbol({ fullPath, content, symbol: sym, root, index, useCache }));
  }
  return results;
};

export const formatExplanationsAsText = (results) =>
  results.map((r) => r.text).join('\n\n');

const fileExists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

export const __internal = { fileExists, formatExplanationText };
