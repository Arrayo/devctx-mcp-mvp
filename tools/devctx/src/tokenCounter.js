import { encodingForModel } from 'js-tiktoken';

const CLAUDE_ALIASES = new Set(['claude', 'anthropic']);

// js-tiktoken does not ship Claude's tokenizer; gpt-4o (o200k_base) is the
// closest available encoding. Accuracy for Claude models: ±15-20%.
const CLAUDE_FALLBACK = 'gpt-4o';
const DEFAULT_MODEL = 'gpt-4o-mini';

const resolveModel = () => {
  const requested = (process.env.DEVCTX_TOKEN_MODEL || '').toLowerCase().trim();
  if (!requested) return DEFAULT_MODEL;
  if (CLAUDE_ALIASES.has(requested) || requested.startsWith('claude')) {
    return CLAUDE_FALLBACK;
  }
  return requested;
};

const buildEncoder = () => {
  const model = resolveModel();
  try {
    return encodingForModel(model);
  } catch {
    return encodingForModel(DEFAULT_MODEL);
  }
};

// Encoder is initialised once; if the env var changes at runtime the process
// must be restarted (acceptable for a CLI/MCP server).
const encoder = buildEncoder();

export const countTokens = (text = '') => {
  if (!text) return 0;
  return encoder.encode(String(text)).length;
};
