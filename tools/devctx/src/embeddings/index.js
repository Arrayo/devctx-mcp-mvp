import { getEmbedder } from './embedder.js';

const symbolToText = (symbol, filePath) => {
  const parts = [];
  parts.push(symbol.name);
  if (symbol.parent) parts.push(symbol.parent);
  if (symbol.kind) parts.push(symbol.kind);
  if (symbol.signature) parts.push(symbol.signature);
  if (symbol.snippet) parts.push(symbol.snippet);
  if (Array.isArray(symbol.decorators)) parts.push(...symbol.decorators);
  if (filePath) {
    const segments = filePath.replace(/\\/g, '/').split('/');
    parts.push(...segments);
  }
  return parts.join(' ');
};

const fileToText = (relPath, fileInfo) => {
  const parts = [relPath];
  for (const symbol of fileInfo?.symbols ?? []) {
    parts.push(symbol.name);
    if (symbol.signature) parts.push(symbol.signature);
  }
  return parts.join(' ');
};

export const buildIndexCorpusIdf = (index) => {
  const embedder = getEmbedder();
  const docs = [];
  for (const [relPath, fileInfo] of Object.entries(index?.files ?? {})) {
    docs.push(fileToText(relPath, fileInfo));
    for (const symbol of fileInfo.symbols ?? []) {
      docs.push(symbolToText(symbol, relPath));
    }
  }
  return embedder.buildCorpusIdf(docs);
};

export const embedQuery = (query, options = {}) => {
  const embedder = getEmbedder();
  return embedder.embed(query, options);
};

export const embedFile = (relPath, fileInfo, options = {}) => {
  const embedder = getEmbedder();
  return embedder.embed(fileToText(relPath, fileInfo), options);
};

export const embedSymbol = (symbol, relPath, options = {}) => {
  const embedder = getEmbedder();
  return embedder.embed(symbolToText(symbol, relPath), options);
};

export const semanticRankSymbols = ({ query, index, limit = 10, idf = null }) => {
  if (!query || !index) return [];
  const embedder = getEmbedder();
  const queryVec = embedder.embed(query, { idf });
  const results = [];
  for (const [relPath, fileInfo] of Object.entries(index.files ?? {})) {
    for (const symbol of fileInfo.symbols ?? []) {
      const vec = embedder.embed(symbolToText(symbol, relPath), { idf });
      const score = embedder.similarity(queryVec, vec);
      if (score > 0) {
        results.push({ score, path: relPath, symbol });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
};

export const semanticRankFiles = ({ query, index, limit = 10, idf = null }) => {
  if (!query || !index) return [];
  const embedder = getEmbedder();
  const queryVec = embedder.embed(query, { idf });
  const results = [];
  for (const [relPath, fileInfo] of Object.entries(index.files ?? {})) {
    const vec = embedder.embed(fileToText(relPath, fileInfo), { idf });
    const score = embedder.similarity(queryVec, vec);
    if (score > 0) {
      results.push({ score, path: relPath, symbolCount: fileInfo.symbols?.length ?? 0 });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
};

export { getEmbedder, setEmbedder, resetEmbedder } from './embedder.js';
export { tokenize } from './tokenize.js';
export { embed, cosineSimilarity, buildCorpusIdf, DEFAULT_DIMENSIONS } from './hashing.js';
export const _internal = { symbolToText, fileToText };
