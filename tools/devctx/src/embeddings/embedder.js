import { embed as hashingEmbed, cosineSimilarity, buildCorpusIdf, DEFAULT_DIMENSIONS } from './hashing.js';

const HASHING_EMBEDDER = {
  id: 'hashing-v1',
  dimensions: DEFAULT_DIMENSIONS,
  embed: (text, options = {}) => hashingEmbed(text, options),
  similarity: cosineSimilarity,
  buildCorpusIdf,
};

let activeEmbedder = HASHING_EMBEDDER;

export const getEmbedder = () => activeEmbedder;

export const setEmbedder = (embedder) => {
  if (!embedder || typeof embedder.embed !== 'function' || typeof embedder.similarity !== 'function') {
    throw new Error('Embedder must implement embed(text, opts) and similarity(a, b)');
  }
  activeEmbedder = {
    id: embedder.id ?? 'custom',
    dimensions: embedder.dimensions ?? DEFAULT_DIMENSIONS,
    embed: embedder.embed,
    similarity: embedder.similarity,
    buildCorpusIdf: embedder.buildCorpusIdf ?? buildCorpusIdf,
  };
};

export const resetEmbedder = () => { activeEmbedder = HASHING_EMBEDDER; };
