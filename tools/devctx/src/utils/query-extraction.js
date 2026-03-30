const INTENT_KEYWORDS = {
  debug: ['debug', 'fix', 'error', 'bug', 'crash', 'fail', 'broken', 'issue', 'trace'],
  tests: ['test', 'spec', 'coverage', 'assert', 'mock', 'jest', 'vitest'],
  config: ['config', 'env', 'setup', 'deploy', 'docker', 'ci', 'terraform', 'yaml', 'secret', 'secrets', 'settings', 'database'],
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

const LOW_SIGNAL_QUERY_WORDS = new Set([
  'find', 'show', 'list', 'get', 'search', 'locate', 'lookup', 'look', 'check',
  'inspect', 'review', 'analyze', 'analyse', 'understand', 'explore', 'read',
  'open', 'walk', 'help', 'need', 'want', 'please', 'context', 'preview',
  'recall', 'stuff', 'thing', 'things', 'happen', 'happens', 'handle', 'handles',
  'handling', 'wired', 'declare', 'declared', 'defined', 'owns', 'owner', 'existing',
  'exercise', 'exercises', 'before', 'main', 'shared', 'related', 'across', 'split',
  'live', 'lives', 'surface', 'public', 'entry', 'point', 'path', 'logic', 'covers',
  'api', 'apis', 'flow', 'flows', 'file', 'files', 'onboarding', 'app', 'application', 'load', 'loads', 'loaded',
]);

const IDENTIFIER_RE = /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[A-Z][a-zA-Z0-9]{2,}\b|\b[a-z]{2,}_[a-z_]+\b/g;
const QUERY_TOKEN_RE = /[a-zA-Z0-9_]+/g;

const uniqueList = (items = []) => [...new Set(items.filter(Boolean))];

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

const extractCompoundQueries = (task) => {
  const lowerTask = task.toLowerCase();
  const queries = [];

  if (/\b(create[-\s]+user|user[-\s]+creation)\b/.test(lowerTask)) {
    queries.push('createUser');
  }

  if (/\bjwt[-\s]+secret\b/.test(lowerTask)) {
    queries.push('jwtSecret');
  }

  return queries;
};

const filterRedundantPromptQueries = (queries, compoundQueries) => {
  const lowerCompoundQueries = new Set(compoundQueries.map((query) => query.toLowerCase()));
  return queries.filter((query) => {
    const lowerQuery = query.toLowerCase();
    if (lowerCompoundQueries.has('jwtsecret') && lowerQuery === 'jwt') return false;
    return true;
  });
};

export const extractSymbolCandidates = (task) => {
  const compoundQueries = extractCompoundQueries(task);
  return uniqueList([
    ...compoundQueries,
    ...filterRedundantPromptQueries(task.match(IDENTIFIER_RE) || [], compoundQueries),
  ]);
};

const isLikelyCodeSymbol = (token) =>
  token.includes('_')
  || /\d/.test(token)
  || /[a-z][A-Z]/.test(token)
  || /[A-Z]{2,}/.test(token);

const scoreKeywordQuery = (token, lowerTask) => {
  let score = Math.min(token.length, 8);
  const position = lowerTask.indexOf(token);
  if (position >= 0) score += Math.max(0, 16 - position);
  if (token.length >= 12) score += 1;
  return score;
};

const extractKeywordQueries = (task, { allowIntentKeywords = false } = {}) => {
  const intentKws = new Set(Object.values(INTENT_KEYWORDS).flat());
  const lowerTask = task.toLowerCase();
  const compoundQueries = extractCompoundQueries(task);

  return filterRedundantPromptQueries(
    [...new Set((task.match(QUERY_TOKEN_RE) || [])
      .map((token) => token.toLowerCase())
      .filter((token) => {
        if (token.length <= 2) return false;
        if (/^\d+$/.test(token)) return false;
        if (STOP_WORDS.has(token)) return false;
        if (LOW_SIGNAL_QUERY_WORDS.has(token)) return false;
        if (!allowIntentKeywords && intentKws.has(token)) return false;
        return true;
      })
      .sort((a, b) => scoreKeywordQuery(b, lowerTask) - scoreKeywordQuery(a, lowerTask)
        || lowerTask.indexOf(a) - lowerTask.indexOf(b)
        || b.length - a.length
        || a.localeCompare(b)))],
    compoundQueries,
  );
};

const extractExpandedQueries = (task) => {
  const lowerTask = task.toLowerCase();
  const queries = [...extractCompoundQueries(task)];

  if (/\b(container|docker|image|deploy|deployment)\b/.test(lowerTask)) {
    queries.push('FROM');
  }

  return queries;
};

const extractFallbackSearchQuery = (task) => {
  const symbolFallback = extractSymbolCandidates(task).find(isLikelyCodeSymbol);
  if (symbolFallback) return symbolFallback;

  const keywordFallback = extractKeywordQueries(task, { allowIntentKeywords: true })[0];
  if (keywordFallback) return keywordFallback;

  return task.trim();
};

export const extractSearchQueries = (task) => {
  const symbolQueries = extractSymbolCandidates(task)
    .filter(isLikelyCodeSymbol)
    .filter((candidate) => !LOW_SIGNAL_QUERY_WORDS.has(candidate.toLowerCase()) && !STOP_WORDS.has(candidate.toLowerCase()));
  const keywordQueries = extractKeywordQueries(task);
  const queries = [];
  const seen = new Set();

  for (const candidate of [...symbolQueries, ...keywordQueries]) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(candidate);
  }

  return queries.slice(0, 3);
};

export { extractExpandedQueries, extractFallbackSearchQuery, extractKeywordQueries };
