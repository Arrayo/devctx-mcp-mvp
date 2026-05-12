const DEFAULT_THROTTLE_MS = 2 * 60 * 1000;
const LARGE_RESPONSE_CHARS = 12000;
const REPEATED_READ_THRESHOLD = 5;
const REPEATED_GREP_THRESHOLD = 3;

const lastIssuedAt = new Map();

const env = (key) => (typeof process !== 'undefined' ? process.env?.[key] : undefined);

export const isSoftPromptsEnabled = () => {
  const value = env('DEVCTX_DISABLE_SOFT_PROMPTS');
  if (value && /^(1|true|yes|on)$/i.test(value)) return false;
  return true;
};

const measureResponseSize = (toolResponse) => {
  if (!toolResponse) return 0;
  if (typeof toolResponse === 'string') return toolResponse.length;
  if (typeof toolResponse === 'object') {
    const content = toolResponse.content ?? toolResponse.output ?? toolResponse.text ?? '';
    if (typeof content === 'string') return content.length;
    try { return JSON.stringify(toolResponse).length; } catch { return 0; }
  }
  return 0;
};

const countMatches = (state, field) => {
  const value = state?.[field];
  if (Array.isArray(value)) return value.length;
  if (Number.isFinite(value)) return Number(value);
  return 0;
};

const buildPrompt = (kind, severity, message) => ({ kind, severity, message });

export const evaluateSoftPrompt = ({ toolName, toolInput, toolResponse, state } = {}) => {
  if (!toolName) return null;

  const meaningfulReadCount = Number.isFinite(state?.meaningfulReadCount) ? state.meaningfulReadCount : 0;
  const readFiles = Array.isArray(state?.readFiles) ? state.readFiles : [];
  const touchedFiles = countMatches(state, 'touchedFiles');

  if (toolName === 'Read') {
    const size = measureResponseSize(toolResponse);
    if (size > LARGE_RESPONSE_CHARS) {
      return buildPrompt(
        'large_read',
        'med',
        `devctx hint: that Read returned ~${Math.round(size / 1000)}KB. Consider smart_read({ mode: 'outline', paths: ['${toolInput?.path ?? toolInput?.file_path ?? '<path>'}'] }) for cheaper exploration, then smart_read({ mode: 'symbol' }) when you know the target.`,
      );
    }

    if (meaningfulReadCount + 1 >= REPEATED_READ_THRESHOLD && touchedFiles === 0) {
      return buildPrompt(
        'repeated_reads',
        'med',
        `devctx hint: ${meaningfulReadCount + 1} sequential reads without writes. smart_context({ task: '<your task>' }) fetches curated multi-file context in one call (or smart_context({ paths: { from, to } }) to trace the import graph).`,
      );
    }
  }

  if (toolName === 'Grep' || toolName === 'SemanticSearch') {
    const grepHits = readFiles.filter((p) => typeof p === 'string').length;
    if (grepHits + 1 >= REPEATED_GREP_THRESHOLD) {
      return buildPrompt(
        'repeated_search',
        'med',
        `devctx hint: ${grepHits + 1} search calls already in this turn. smart_search({ query, intent: 'debug'|'implementation'|'explore', kinds: [...] }) ranks results by relevance and supports ADR/class/function filters.`,
      );
    }
  }

  return null;
};

export const shouldEmitSoftPrompt = (hookKey, now = Date.now(), throttleMs = DEFAULT_THROTTLE_MS) => {
  if (!hookKey) return false;
  const last = lastIssuedAt.get(hookKey);
  if (last && now - last < throttleMs) return false;
  return true;
};

export const markSoftPromptEmitted = (hookKey, now = Date.now()) => {
  if (hookKey) lastIssuedAt.set(hookKey, now);
};

export const _resetSoftPromptThrottle = (hookKey) => {
  if (hookKey) lastIssuedAt.delete(hookKey);
  else lastIssuedAt.clear();
};

export const _internal = {
  DEFAULT_THROTTLE_MS,
  LARGE_RESPONSE_CHARS,
  REPEATED_READ_THRESHOLD,
  REPEATED_GREP_THRESHOLD,
};
