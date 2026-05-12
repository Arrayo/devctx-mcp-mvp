const TODO_RE = /\b(?:TODO|FIXME|XXX|HACK)\b/i;
const CONSOLE_RE = /\bconsole\.(log|debug|info)\(/;
const PRINT_RE = /\b(?:print|System\.out\.println|fmt\.Println)\(/;
const DEBUGGER_RE = /\bdebugger\s*;?/;
const EVAL_RE = /\beval\s*\(/;
const NEW_FUNCTION_RE = /\bnew\s+Function\s*\(/;
const PROCESS_EXIT_RE = /\bprocess\.exit\s*\(/;
const AS_ANY_RE = /\bas\s+any\b/;
const COLON_ANY_RE = /:\s*any\b/;
const ALERT_RE = /\balert\s*\(/;
const HARDCODED_SECRET_RE = /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']([A-Za-z0-9_\-]{12,})["']/i;

const CHECKS = [
  { kind: 'todo', severity: 'low', re: TODO_RE, message: 'TODO/FIXME/XXX/HACK marker added' },
  { kind: 'console-log', severity: 'med', re: CONSOLE_RE, message: 'console.log left in code' },
  { kind: 'print-stmt', severity: 'med', re: PRINT_RE, message: 'print/println left in code' },
  { kind: 'debugger', severity: 'high', re: DEBUGGER_RE, message: 'debugger statement left in code' },
  { kind: 'eval', severity: 'high', re: EVAL_RE, message: 'use of eval()' },
  { kind: 'new-function', severity: 'high', re: NEW_FUNCTION_RE, message: 'dynamic Function() constructor' },
  { kind: 'process-exit', severity: 'high', re: PROCESS_EXIT_RE, message: 'process.exit() inside library/business code' },
  { kind: 'any-type', severity: 'med', re: AS_ANY_RE, message: '"as any" cast — loses type safety' },
  { kind: 'any-annot', severity: 'med', re: COLON_ANY_RE, message: '": any" annotation — loses type safety' },
  { kind: 'alert', severity: 'med', re: ALERT_RE, message: 'alert() call' },
  { kind: 'hardcoded-secret', severity: 'high', re: HARDCODED_SECRET_RE, message: 'possible hardcoded secret' },
];

const TEST_FILE_HINT_RE = /(?:\.(?:test|spec)\.[jt]sx?$|__tests__|_test\.go$|test_\w+\.py$|Tests?\.(?:cs|kt|swift)$|_test\.(?:cs|kt)$|Test\.php$)/;

export const isTestPath = (rel) => TEST_FILE_HINT_RE.test(rel);

const LAYER_RULES = [
  { layer: 'domain', re: /(?:^|\/)(?:domain|entities?|value-objects?|aggregates?)\//i },
  { layer: 'application', re: /(?:^|\/)(?:application|use-cases?|services?|app)\//i },
  { layer: 'infrastructure', re: /(?:^|\/)(?:infrastructure|infra|adapters?|repositories?|persistence|controllers?|handlers?|routes?|api)\//i },
  { layer: 'presentation', re: /(?:^|\/)(?:presentation|ui|views?|components?|pages?)\//i },
];

export const detectLayer = (relPath) => {
  for (const rule of LAYER_RULES) {
    if (rule.re.test(relPath)) return rule.layer;
  }
  return null;
};

const parseHunks = (diffText) => {
  const hunks = [];
  if (!diffText) return hunks;
  const lines = diffText.split('\n');
  let current = null;
  for (const line of lines) {
    const header = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      if (current) hunks.push(current);
      current = { startNewLine: parseInt(header[1], 10), addedLines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      current.addedLines.push({ line: current.startNewLine + current.addedLines.length, text: line.slice(1) });
    } else if (line.startsWith(' ')) {
      current.startNewLine += 1;
    }
  }
  if (current) hunks.push(current);
  return hunks;
};

export const detectIssuesInDiff = (diffText, { relPath } = {}) => {
  const issues = [];
  const hunks = parseHunks(diffText);

  for (const hunk of hunks) {
    for (const { line, text } of hunk.addedLines) {
      const trimmed = text.trimStart();
      if (!trimmed) continue;
      if (/^(?:\/\/|#|\*|<!--)/.test(trimmed) && !TODO_RE.test(trimmed)) continue;

      for (const check of CHECKS) {
        if (check.re.test(text)) {
          issues.push({
            kind: check.kind,
            severity: check.severity,
            line,
            snippet: text.trim().slice(0, 160),
            message: check.message,
          });
        }
      }
    }
  }

  if (relPath && /\.tsx?$/.test(relPath) === false) {
    return issues.filter((i) => i.kind !== 'any-type' && i.kind !== 'any-annot');
  }
  return issues;
};

export const summarizeIssues = (issues) => {
  const counts = { high: 0, med: 0, low: 0 };
  for (const i of issues) counts[i.severity] = (counts[i.severity] ?? 0) + 1;
  return counts;
};

export const _internal = { CHECKS, parseHunks };
