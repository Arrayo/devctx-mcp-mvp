export const truncate = (text = '', maxChars = 4000) => {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
};

export const uniqueLines = (text = '') => {
  const seen = new Set();

  return text
    .split('\n')
    .filter((line) => {
      const key = line.trim();

      if (!key) {
        return true;
      }

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .join('\n');
};

export const pickRelevantLines = (text = '', patterns = []) => {
  const lines = text.split('\n');
  const loweredPatterns = patterns.map((pattern) => pattern.toLowerCase());

  return lines
    .filter((line) => loweredPatterns.some((pattern) => line.toLowerCase().includes(pattern)))
    .join('\n');
};
