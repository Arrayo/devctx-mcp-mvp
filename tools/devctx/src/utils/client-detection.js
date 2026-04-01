const detectClientFromEnv = () => {
  if (process.env.CURSOR_AGENT === '1') {
    return 'cursor';
  }

  if (process.env.CLAUDE_AGENT === '1') {
    return 'claude';
  }

  if (process.env.GEMINI_AGENT === '1') {
    return 'gemini';
  }

  if (process.env.CODEX_AGENT === '1') {
    return 'codex';
  }

  return 'generic';
};

let cachedClient = null;

export const detectClient = () => {
  if (cachedClient === null) {
    cachedClient = detectClientFromEnv();
  }

  return cachedClient;
};

export const resetClientDetection = () => {
  cachedClient = null;
};
