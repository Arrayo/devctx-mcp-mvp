import { tokenize } from './tokenize.js';

export const DEFAULT_DIMENSIONS = 256;

const fnv1a = (str) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

const signedBucket = (token, dims) => {
  const h = fnv1a(token);
  const bucket = h % dims;
  const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
  return { bucket, sign };
};

const l2Normalize = (vector) => {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i += 1) sumSq += vector[i] * vector[i];
  if (sumSq === 0) return vector;
  const norm = Math.sqrt(sumSq);
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
};

export const embed = (text, { dimensions = DEFAULT_DIMENSIONS, idf = null } = {}) => {
  const tokens = tokenize(text);
  const vector = new Float32Array(dimensions);
  if (tokens.length === 0) return vector;

  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  for (const [token, count] of counts) {
    const tf = 1 + Math.log(count);
    const weight = idf ? tf * (idf.get(token) ?? 1) : tf;
    const { bucket, sign } = signedBucket(token, dimensions);
    vector[bucket] += sign * weight;
  }

  return l2Normalize(vector);
};

export const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
};

export const buildCorpusIdf = (documents) => {
  const df = new Map();
  let docCount = 0;
  for (const doc of documents) {
    docCount += 1;
    const seen = new Set();
    for (const token of tokenize(doc)) {
      if (!seen.has(token)) {
        seen.add(token);
        df.set(token, (df.get(token) ?? 0) + 1);
      }
    }
  }
  const idf = new Map();
  for (const [token, freq] of df) {
    idf.set(token, Math.log((docCount + 1) / (freq + 1)) + 1);
  }
  return idf;
};

export const _internal = { fnv1a, signedBucket, l2Normalize };
