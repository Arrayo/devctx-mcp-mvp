import { joinSections, toUniqueLines, truncateSection } from './shared.js';

export const summarizeToml = (content, mode) => {
  const lines = content.split('\n');
  const sections = [];
  const keys = [];
  let currentSection = 'root';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const sectionMatch = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections.push(`[${currentSection}]`);
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
    if (keyMatch) {
      keys.push(`${currentSection}.${keyMatch[1]}`);
    }
  }

  if (mode === 'signatures') {
    return truncateSection('# TOML sections', toUniqueLines(sections), 4000);
  }

  return joinSections([
    truncateSection('# TOML sections', toUniqueLines(sections), 1800),
    truncateSection('# Keys', toUniqueLines(keys), 2800),
  ], 5000);
};

export const summarizeYaml = (content, mode) => {
  const lines = content.split('\n');
  const sections = [];
  const nestedKeys = [];

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }

    const keyMatch = rawLine.match(/^(\s*)([^\s:#][^:]*):/);
    if (!keyMatch) {
      continue;
    }

    const indent = keyMatch[1].length / 2;
    const key = keyMatch[2].trim();

    if (indent === 0) {
      sections.push(key);
    } else {
      nestedKeys.push(`${'  '.repeat(indent)}${key}`);
    }
  }

  if (mode === 'signatures') {
    return truncateSection('# YAML keys', toUniqueLines(sections), 4000);
  }

  return joinSections([
    truncateSection('# YAML top-level', toUniqueLines(sections), 1600),
    truncateSection('# YAML nested', toUniqueLines(nestedKeys), 2800),
  ], 5000);
};
