import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { loadIndex, isTestFile, queryRelated } from '../index.js';
import { ensureIndexReady } from '../index-manager.js';
import { projectRoot } from '../utils/paths.js';
import { getChangedFiles } from './smart-context.js';
import { getDetailedDiff, getChangedSymbols } from '../diff-analysis.js';
import {
  detectIssuesInDiff,
  detectLayer,
  isTestPath,
  summarizeIssues,
} from '../review/heuristics.js';
import { recordToolUsage } from '../usage-feedback.js';
import { recordDecision, DECISION_REASONS, EXPECTED_BENEFITS } from '../decision-explainer.js';
import { recordDevctxOperation } from '../missed-opportunities.js';

const execFile = promisify(execFileCallback);

const DEFAULT_MAX_FILES = 30;
const DEFAULT_MAX_CALLERS = 5;
const DEFAULT_MAX_TESTS = 5;
const SAFE_REF_RE = /^[A-Za-z0-9._\/\-]+$/;

const getFileDiff = async (ref, relPath, root) => {
  if (!SAFE_REF_RE.test(ref) || !SAFE_REF_RE.test(relPath)) return '';
  try {
    const { stdout } = await execFile('git', ['diff', '-U3', ref, '--', relPath], {
      cwd: root,
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return '';
  }
};

const blameSymbol = async ({ root, relPath, line }) => {
  if (!Number.isInteger(line) || line < 1) return null;
  if (!SAFE_REF_RE.test(relPath)) return null;
  try {
    const { stdout } = await execFile(
      'git',
      ['blame', '-L', `${line},${line}`, '--porcelain', '--', relPath],
      { cwd: root, timeout: 5000, maxBuffer: 256 * 1024 },
    );
    const lines = stdout.split('\n');
    const sha = lines[0]?.split(' ')[0] ?? null;
    const author = (lines.find((l) => l.startsWith('author ')) ?? '').slice(7) || null;
    const summary = (lines.find((l) => l.startsWith('summary ')) ?? '').slice(8) || null;
    return sha ? { sha: sha.slice(0, 12), author, summary } : null;
  } catch {
    return null;
  }
};

const resolveSymbolLine = (index, relPath, symbolName) => {
  const entry = index?.files?.[relPath];
  if (!entry?.symbols) return null;
  const match = entry.symbols.find((s) => s.name === symbolName);
  return match?.line ?? null;
};

const trimList = (list, limit) => (list.length > limit ? list.slice(0, limit) : list);

const computeCoverageGap = (analyzed) => {
  const changedSet = new Set(analyzed.map((f) => f.path));
  return analyzed
    .filter((f) => !f.isTest && f.affectedTests.length > 0)
    .filter((f) => !f.affectedTests.some((t) => changedSet.has(t)))
    .map((f) => ({ file: f.path, expectedTests: f.affectedTests }));
};

export const smartReview = async ({
  ref = 'HEAD',
  maxFiles = DEFAULT_MAX_FILES,
  maxCallers = DEFAULT_MAX_CALLERS,
  maxTests = DEFAULT_MAX_TESTS,
  includeBlame = false,
} = {}) => {
  if (typeof ref !== 'string' || !SAFE_REF_RE.test(ref)) {
    return { success: false, error: `Invalid ref: ${ref}` };
  }

  const root = projectRoot;
  await ensureIndexReady({ root });
  const index = loadIndex(root);

  const changed = await getChangedFiles(ref, root);
  const detailed = await getDetailedDiff(ref, root);
  const detailedMap = new Map(detailed.map((d) => [d.file, d]));

  const files = trimList(changed.files ?? [], maxFiles);

  const analyzed = [];
  for (const relPath of files) {
    const stats = detailedMap.get(relPath) ?? { additions: 0, deletions: 0, totalChanges: 0, changeType: 'unknown' };
    const diffText = await getFileDiff(ref, relPath, root);
    const issues = detectIssuesInDiff(diffText, { relPath });

    const related = index ? queryRelated(index, relPath) : { importedBy: [], tests: [], imports: [] };
    const callers = trimList(related.importedBy ?? [], maxCallers);
    const affectedTests = trimList(related.tests ?? [], maxTests);
    const changedSymbols = await getChangedSymbols(ref, relPath, root);

    let blame = null;
    if (includeBlame && index && changedSymbols.length > 0) {
      blame = [];
      for (const sym of changedSymbols.slice(0, 3)) {
        const line = resolveSymbolLine(index, relPath, sym);
        if (!line) continue;
        const info = await blameSymbol({ root, relPath, line });
        if (info) blame.push({ symbol: sym, line, ...info });
      }
    }

    analyzed.push({
      path: relPath,
      isTest: isTestFile(relPath) || isTestPath(relPath),
      layer: detectLayer(relPath),
      additions: stats.additions,
      deletions: stats.deletions,
      changeType: stats.changeType,
      callers,
      affectedTests,
      changedSymbols,
      issues,
      ...(blame ? { blame } : {}),
    });
  }

  const totals = analyzed.reduce(
    (acc, f) => {
      acc.additions += f.additions ?? 0;
      acc.deletions += f.deletions ?? 0;
      for (const issue of f.issues) acc.issues.push({ file: f.path, ...issue });
      return acc;
    },
    { additions: 0, deletions: 0, issues: [] },
  );

  const issuesBySeverity = summarizeIssues(totals.issues);
  const coverageGap = computeCoverageGap(analyzed);

  const layersTouched = [...new Set(analyzed.map((f) => f.layer).filter(Boolean))];
  const crossLayer = layersTouched.length >= 2;

  const hints = [];
  if (issuesBySeverity.high > 0) {
    hints.push(`Resolve ${issuesBySeverity.high} high-severity issue(s) before merge.`);
  }
  if (coverageGap.length > 0) {
    hints.push(`Coverage gap: ${coverageGap.length} file(s) changed without touching their tests. Run smart_test action="affected".`);
  }
  if (crossLayer) {
    hints.push(`Cross-layer change touches: ${layersTouched.join(', ')} — verify boundaries.`);
  }
  if (hints.length === 0) {
    hints.push('No blocking findings detected by heuristics. Still review logic.');
  }

  recordToolUsage({ tool: 'smart_review', savedTokens: 0, target: ref });
  recordDevctxOperation();
  recordDecision({
    tool: 'smart_review',
    action: `review diff vs ${ref}`,
    reason: DECISION_REASONS.DIFF_ANALYSIS,
    alternative: 'Manual review of each file + grep for risky patterns + locate tests',
    expectedBenefit: `${EXPECTED_BENEFITS.TOKEN_SAVINGS(0)}, single-call review summary with graph impact`,
    context: `${analyzed.length} files, ${totals.issues.length} issues, gap=${coverageGap.length}`,
  });

  return {
    success: true,
    ref: changed.ref ?? ref,
    files: analyzed,
    summary: {
      filesChanged: changed.files?.length ?? 0,
      filesAnalyzed: analyzed.length,
      additions: totals.additions,
      deletions: totals.deletions,
      issuesBySeverity,
      coverageGap,
      layersTouched,
      crossLayer,
      skippedDeleted: changed.skippedDeleted ?? 0,
    },
    hints,
  };
};

export const _internal = { resolveSymbolLine, computeCoverageGap };
