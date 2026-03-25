import { truncate, uniqueLines } from '../../utils/text.js';

export const toUniqueLines = (items, limit = Infinity) => uniqueLines(items.join('\n')).split('\n').filter(Boolean).slice(0, limit);

export const truncateSection = (title, lines, maxChars) => {
  if (lines.length === 0) {
    return '';
  }

  return truncate(`${title}\n${lines.join('\n')}`, maxChars);
};

export const joinSections = (sections, maxChars) => truncate(sections.filter(Boolean).join('\n\n'), maxChars);

export const summarizeJson = (content, mode) => {
  try {
    const parsed = JSON.parse(content);
    const entries = Object.entries(parsed ?? {});
    const lines = entries.map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: array(${value.length})`;
      }

      if (value && typeof value === 'object') {
        return `${key}: object(${Object.keys(value).length})`;
      }

      if (typeof value === 'string') {
        return `${key}: ${value.slice(0, 48)}`;
      }

      return `${key}: ${String(value)}`;
    });

    return truncateSection('# JSON outline', lines, mode === 'signatures' ? 4000 : 5000);
  } catch {
    return truncate(content, 4000);
  }
};
