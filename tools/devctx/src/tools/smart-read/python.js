import { joinSections, toUniqueLines, truncateSection } from './shared.js';

export const extractPythonSymbol = (content, symbolName) => {
  const lines = content.split('\n');
  let startIdx = -1;
  let baseIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const indent = lines[i].length - lines[i].trimStart().length;

    const match = trimmed.match(/^(?:async\s+)?(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (match && match[1] === symbolName) {
      startIdx = i;
      baseIndent = indent;
      break;
    }
  }

  if (startIdx === -1) return `Symbol not found: ${symbolName}`;

  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const indent = line.length - line.trimStart().length;
      if (indent <= baseIndent) break;
    }
    endIdx++;
  }

  const slice = lines.slice(startIdx, endIdx);
  return slice.map((l, i) => `${startIdx + i + 1}|${l}`).join('\n');
};

export const summarizePython = (content, mode) => {
  const lines = content.split('\n');
  const imports = [];
  const topLevelDefs = [];
  const classNames = [];
  const classMethods = new Map();
  const constants = [];
  let currentClass = null;
  let currentClassIndent = -1;
  let pendingDecorators = 0;
  let pendingHeader = null;

  const normalizeHeader = (parts) => parts.join(' ').replace(/\s+/g, ' ').trim();

  const finalizePendingHeader = () => {
    if (!pendingHeader) {
      return;
    }

    const header = normalizeHeader(pendingHeader.parts);

    if (pendingHeader.kind === 'class') {
      const classMatch = header.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\((.*?)\))?\s*:/);
      const className = classMatch?.[1] ?? header.replace(/:$/, '');
      const bases = classMatch?.[2] ? `(${classMatch[2].trim()})` : '';
      const prefix = pendingHeader.decorated ? '@decorated ' : '';
      const classLabel = `${prefix}class ${className}${bases}`;

      classNames.push(classLabel);
      if (!classMethods.has(classLabel)) {
        classMethods.set(classLabel, []);
      }
      currentClass = classLabel;
      currentClassIndent = pendingHeader.indent;
    }

    if (pendingHeader.kind === 'function') {
      const functionMatch = header.match(/^(async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*(?:->\s*([^:]+))?\s*:/);
      const functionKind = functionMatch?.[1] ?? 'def';
      const functionName = functionMatch?.[2] ?? 'anonymous';
      const params = (functionMatch?.[3] ?? '').trim();
      const returnType = functionMatch?.[4]?.trim();
      const prefix = pendingHeader.decorated ? '@decorated ' : '';
      const asyncPrefix = functionKind === 'async def' ? 'async ' : '';
      const returnSuffix = returnType ? ` -> ${returnType}` : '';
      const signature = `${prefix}${asyncPrefix}def ${functionName}(${params})${returnSuffix}`;

      if (currentClass && pendingHeader.indent > currentClassIndent) {
        classMethods.get(currentClass).push(signature);
      } else {
        topLevelDefs.push(signature);
      }
    }

    pendingHeader = null;
    pendingDecorators = 0;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const indent = rawLine.length - rawLine.trimStart().length;

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (pendingHeader) {
      pendingHeader.parts.push(trimmed);
      if (trimmed.endsWith(':')) {
        finalizePendingHeader();
      }
      continue;
    }

    if (currentClass && indent <= currentClassIndent && !trimmed.startsWith('@')) {
      currentClass = null;
      currentClassIndent = -1;
    }

    const importMatch = rawLine.match(/^\s*(import\s+.+|from\s+.+\s+import\s+.+)$/);
    if (importMatch) {
      imports.push(importMatch[1].trim());
      pendingDecorators = 0;
      continue;
    }

    if (/^\s*@/.test(rawLine)) {
      pendingDecorators += 1;
      continue;
    }

    if (/^\s*class\s+[A-Za-z_][A-Za-z0-9_]*/.test(rawLine)) {
      pendingHeader = { kind: 'class', indent, parts: [trimmed], decorated: pendingDecorators > 0 };
      if (trimmed.endsWith(':')) {
        finalizePendingHeader();
      }
      continue;
    }

    if (/^\s*(async\s+def|def)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(rawLine)) {
      pendingHeader = { kind: 'function', indent, parts: [trimmed], decorated: pendingDecorators > 0 };
      if (trimmed.endsWith(':')) {
        finalizePendingHeader();
      }
      continue;
    }

    const constantMatch = rawLine.match(/^\s*([A-Z][A-Z0-9_]+)\s*=/);
    if (constantMatch) {
      constants.push(`const ${constantMatch[1]}`);
    }

    pendingDecorators = 0;
  }

  finalizePendingHeader();

  const importLines = toUniqueLines(imports, mode === 'signatures' ? 6 : 12);
  const topLevelLines = toUniqueLines(topLevelDefs, 12);
  const classLines = toUniqueLines(classNames, 12);
  const methodLines = [...classMethods.entries()].flatMap(([classLabel, methods]) => {
    const limitedMethods = toUniqueLines(methods, 8);
    return limitedMethods.length === 0 ? [classLabel] : [classLabel, ...limitedMethods.map((method) => `  ${method}`)];
  });
  const constantLines = toUniqueLines(constants, 12);

  if (mode === 'signatures') {
    return joinSections([
      truncateSection('# Classes and methods', methodLines.length > 0 ? methodLines : classLines, 2200),
      truncateSection('# Top-level definitions', topLevelLines, 900),
      truncateSection('# Imports', importLines, 700),
    ], 4000);
  }

  return joinSections([
    truncateSection('# Classes and methods', methodLines, 2200),
    truncateSection('# Classes', classLines, 900),
    truncateSection('# Top-level definitions', topLevelLines, 1200),
    truncateSection('# Imports', importLines, 1200),
    truncateSection('# Constants', constantLines, 800),
  ], 5000);
};
