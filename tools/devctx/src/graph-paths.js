import path from 'node:path';
import { queryIndex, queryRelated } from './index.js';

const DEFAULT_MAX_HOPS = 5;
const NEAREST_LIMIT = 3;

const buildAdjacency = (index, { directed = false } = {}) => {
  const adj = new Map();
  const ensure = (key) => {
    if (!adj.has(key)) adj.set(key, new Set());
    return adj.get(key);
  };
  for (const edge of index?.graph?.edges ?? []) {
    if (!edge?.from || !edge?.to) continue;
    if (edge.kind && edge.kind !== 'import' && edge.kind !== 'testOf') continue;
    ensure(edge.from).add(edge.to);
    if (!directed) ensure(edge.to).add(edge.from);
  }
  return adj;
};

export const resolveEntityToFiles = (index, entity) => {
  if (!entity || typeof entity !== 'string') return [];
  const normalized = entity.replace(/\\/g, '/').trim();

  if (normalized.includes('/') || /\.[a-zA-Z0-9]+$/.test(normalized)) {
    if (index?.files?.[normalized]) return [normalized];
    const filesMap = index?.files ?? {};
    const matches = Object.keys(filesMap).filter((rel) => rel.endsWith(`/${normalized}`) || rel === normalized);
    return matches;
  }

  const hits = queryIndex(index, normalized);
  return [...new Set(hits.map((h) => h.path))];
};

const reconstructPath = (parents, target) => {
  const path = [target];
  let cursor = target;
  while (parents.has(cursor)) {
    const prev = parents.get(cursor);
    if (prev === null) break;
    path.unshift(prev);
    cursor = prev;
  }
  return path;
};

export const findPath = (index, fromFile, toFile, { maxHops = DEFAULT_MAX_HOPS, directed = false } = {}) => {
  if (!index?.graph?.edges) return null;
  if (!fromFile || !toFile) return null;
  if (fromFile === toFile) return { hops: 0, path: [fromFile] };

  const adj = buildAdjacency(index, { directed });
  if (!adj.has(fromFile) && !adj.has(toFile)) return null;

  const visited = new Map();
  visited.set(fromFile, 0);
  const parents = new Map([[fromFile, null]]);
  const queue = [fromFile];

  while (queue.length > 0) {
    const current = queue.shift();
    const depth = visited.get(current);
    if (depth >= maxHops) continue;

    const neighbors = adj.get(current) ?? new Set();
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.set(next, depth + 1);
      parents.set(next, current);
      if (next === toFile) {
        return { hops: depth + 1, path: reconstructPath(parents, toFile) };
      }
      queue.push(next);
    }
  }

  return null;
};

const collectNearestNeighbors = (index, file, limit = NEAREST_LIMIT) => {
  const result = new Map();
  if (!file || !index) return [];

  const related = queryRelated(index, file);
  for (const rel of [...related.imports, ...related.importedBy, ...related.tests, ...related.neighbors]) {
    if (rel === file) continue;
    if (!result.has(rel)) result.set(rel, result.size);
    if (result.size >= limit) break;
  }
  return [...result.keys()];
};

export const findNearest = (index, fromFile, toFile, limit = NEAREST_LIMIT) => ({
  fromNeighbors: collectNearestNeighbors(index, fromFile, limit),
  toNeighbors: collectNearestNeighbors(index, toFile, limit),
});

const symbolForPathStep = (index, relPath, symbolName) => {
  const filesMap = index?.files ?? {};
  const entry = filesMap[relPath];
  if (!entry?.symbols) return null;
  if (symbolName) {
    return entry.symbols.find((s) => s.name?.toLowerCase() === symbolName.toLowerCase()) ?? null;
  }
  return entry.symbols.find((s) => s.kind === 'function' || s.kind === 'class' || s.kind === 'const')
    ?? entry.symbols[0]
    ?? null;
};

export const describePath = (index, pathFiles, { hintSymbols = {} } = {}) => {
  if (!Array.isArray(pathFiles) || pathFiles.length === 0) return [];
  return pathFiles.map((rel) => {
    const sym = symbolForPathStep(index, rel, hintSymbols[rel]);
    return {
      file: rel,
      symbol: sym?.name ?? null,
      signature: sym?.signature ?? null,
      line: sym?.line ?? null,
      kind: sym?.kind ?? null,
    };
  });
};

export const buildPathsResult = (index, from, to, options = {}) => {
  const fromFiles = resolveEntityToFiles(index, from);
  const toFiles = resolveEntityToFiles(index, to);

  if (fromFiles.length === 0 || toFiles.length === 0) {
    return {
      from,
      to,
      resolved: { from: fromFiles, to: toFiles },
      found: false,
      reason: fromFiles.length === 0 ? 'from-not-found' : 'to-not-found',
      path: [],
      hops: null,
      fallback: null,
    };
  }

  for (const f of fromFiles) {
    for (const t of toFiles) {
      const result = findPath(index, f, t, options);
      if (result) {
        return {
          from,
          to,
          resolved: { from: [f], to: [t] },
          found: true,
          hops: result.hops,
          path: describePath(index, result.path),
          fallback: null,
        };
      }
    }
  }

  const seedFrom = fromFiles[0];
  const seedTo = toFiles[0];
  const fallback = findNearest(index, seedFrom, seedTo, options.nearestLimit ?? NEAREST_LIMIT);

  return {
    from,
    to,
    resolved: { from: [seedFrom], to: [seedTo] },
    found: false,
    reason: 'no-path',
    path: [],
    hops: null,
    fallback,
  };
};
