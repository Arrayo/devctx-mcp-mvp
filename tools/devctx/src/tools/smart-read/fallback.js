import { truncate } from '../../utils/text.js';

export const summarizeFallback = (content, mode) => {
  const lines = content.split('\n');
  const matches = lines.filter((line) => {
    const trimmed = line.trim();

    return (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export ') ||
      trimmed.includes('function ') ||
      trimmed.includes('const ') ||
      trimmed.includes('return (') ||
      trimmed.includes('class ') ||
      trimmed.includes('def ') ||
      trimmed.includes('resource ') ||
      trimmed.includes('FROM ') ||
      trimmed.includes('fn ')
    );
  });

  return truncate(matches.join('\n') || content, mode === 'signatures' ? 4000 : 5000);
};
