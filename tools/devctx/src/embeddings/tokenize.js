const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'as', 'by', 'from', 'this', 'that', 'these', 'those', 'it', 'its', 'be', 'been', 'being',
  'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
  'can', 'could', 'may', 'might', 'must', 'shall', 'not', 'no', 'yes', 'if', 'else', 'then',
  'return', 'true', 'false', 'null', 'undefined', 'self', 'this', 'use', 'using', 'used',
]);

const CAMEL_RE = /([a-z0-9])([A-Z])/g;
const SNAKE_RE = /[_-]+/g;
const NON_WORD_RE = /[^A-Za-z0-9_]+/g;
const NUMBER_RE = /^\d+$/;

const splitIdentifier = (token) => {
  if (!token) return [];
  const camelExpanded = token.replace(CAMEL_RE, '$1 $2');
  const parts = camelExpanded.replace(SNAKE_RE, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  out.add(token.toLowerCase());
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!lower || NUMBER_RE.test(lower)) continue;
    if (STOP_WORDS.has(lower)) continue;
    if (lower.length < 2) continue;
    out.add(lower);
  }
  return [...out];
};

export const tokenize = (text) => {
  if (!text || typeof text !== 'string') return [];
  const raw = text.replace(NON_WORD_RE, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const token of raw) {
    if (NUMBER_RE.test(token)) continue;
    const expanded = splitIdentifier(token);
    for (const part of expanded) {
      if (!STOP_WORDS.has(part) && part.length >= 2) {
        out.push(part);
      }
    }
  }
  return out;
};

export const _internal = { STOP_WORDS, splitIdentifier };
