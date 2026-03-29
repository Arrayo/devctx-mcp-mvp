/**
 * Diff-aware context analysis for intelligent change-based retrieval.
 * 
 * Analyzes git diffs to understand change impact and expand context intelligently.
 */

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFile = promisify(execFileCallback);

/**
 * Get detailed diff statistics for changed files.
 * 
 * @param {string} ref - Git reference (e.g., 'HEAD', 'main')
 * @param {string} root - Project root
 * @returns {Promise<Array>} Array of { file, additions, deletions, changeType }
 */
export const getDetailedDiff = async (ref, root) => {
  try {
    const { stdout } = await execFile('git', ['diff', '--numstat', ref], {
      cwd: root,
      timeout: 10000,
    });

    const changes = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;

      const parts = line.split('\t');
      if (parts.length < 3) continue;

      const [additions, deletions, file] = parts;
      
      const adds = additions === '-' ? 0 : parseInt(additions, 10);
      const dels = deletions === '-' ? 0 : parseInt(deletions, 10);

      changes.push({
        file,
        additions: adds,
        deletions: dels,
        totalChanges: adds + dels,
        changeType: classifyChange(adds, dels),
      });
    }

    return changes;
  } catch (err) {
    return [];
  }
};

/**
 * Classify the type of change based on additions/deletions ratio.
 */
const classifyChange = (additions, deletions) => {
  const total = additions + deletions;
  if (total === 0) return 'unchanged';
  
  const ratio = additions / total;
  
  if (ratio > 0.9) return 'addition';
  if (ratio < 0.1) return 'deletion';
  if (Math.abs(ratio - 0.5) < 0.2) return 'refactor';
  return 'modification';
};

/**
 * Analyze change impact and prioritize files.
 * 
 * @param {Array} changes - Array from getDetailedDiff
 * @param {object} index - Symbol index
 * @returns {Array} Prioritized changes with impact scores
 */
export const analyzeChangeImpact = (changes, index) => {
  return changes.map(change => {
    const impactScore = calculateImpactScore(change, index);
    
    return {
      ...change,
      impactScore,
      priority: categorizePriority(impactScore, change),
    };
  }).sort((a, b) => b.impactScore - a.impactScore);
};

/**
 * Calculate impact score for a changed file.
 */
const calculateImpactScore = (change, index) => {
  let score = 0;

  score += Math.min(change.totalChanges, 100);

  if (isImplementationFile(change.file)) {
    score += 50;
  }

  if (index?.graph?.edges) {
    const dependents = index.graph.edges.filter(e => e.to === change.file && e.kind === 'import');
    score += dependents.length * 10;
  }

  if (isTestFile(change.file)) {
    score -= 20;
  }

  if (isConfigFile(change.file) && change.totalChanges < 10) {
    score -= 30;
  }

  return Math.max(0, score);
};

const isImplementationFile = (filePath) => {
  const ext = path.extname(filePath);
  return ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java'].includes(ext) 
    && !isTestFile(filePath);
};

const isTestFile = (filePath) => {
  const patterns = ['.test.', '.spec.', '__tests__', '__mocks__', '/tests/', '/test/'];
  return patterns.some(p => filePath.includes(p));
};

const isConfigFile = (filePath) => {
  const ext = path.extname(filePath);
  const configExts = ['.json', '.yaml', '.yml', '.toml', '.config.js', '.config.ts'];
  return configExts.some(e => filePath.endsWith(e)) || 
         ['Dockerfile', 'docker-compose', '.env', '.gitignore'].some(n => filePath.includes(n));
};

const categorizePriority = (score, change) => {
  if (score >= 100) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
};

/**
 * Expand changed files to include their context.
 * 
 * @param {Array<string>} changedFiles - Changed file paths
 * @param {object} index - Symbol index
 * @param {number} maxExpansion - Max files to add
 * @returns {Set<string>} Expanded file set
 */
export const expandChangedContext = (changedFiles, index, maxExpansion = 10) => {
  const expanded = new Set(changedFiles);
  const candidates = new Map();

  if (!index?.graph?.edges) return expanded;

  for (const changed of changedFiles) {
    const importers = index.graph.edges
      .filter(e => e.to === changed && e.kind === 'import')
      .map(e => e.from);

    for (const importer of importers) {
      if (!expanded.has(importer)) {
        const currentScore = candidates.get(importer) || 0;
        candidates.set(importer, currentScore + 10);
      }
    }

    const imports = index.graph.edges
      .filter(e => e.from === changed && e.kind === 'import')
      .map(e => e.to);

    for (const imported of imports) {
      if (!expanded.has(imported)) {
        const currentScore = candidates.get(imported) || 0;
        candidates.set(imported, currentScore + 5);
      }
    }

    const tests = index.graph.edges
      .filter(e => e.from !== changed && e.to === changed && e.kind === 'testOf')
      .map(e => e.from);

    for (const test of tests) {
      if (!expanded.has(test)) {
        const currentScore = candidates.get(test) || 0;
        candidates.set(test, currentScore + 8);
      }
    }
  }

  const sorted = Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxExpansion);

  for (const [file] of sorted) {
    expanded.add(file);
  }

  return expanded;
};

/**
 * Generate a human-readable diff summary.
 * 
 * @param {Array} changes - Prioritized changes from analyzeChangeImpact
 * @returns {string} Summary text
 */
export const generateDiffSummary = (changes) => {
  if (changes.length === 0) return 'No changes detected';

  const byType = {
    addition: [],
    deletion: [],
    modification: [],
    refactor: [],
  };

  for (const change of changes) {
    byType[change.changeType]?.push(change);
  }

  const lines = [];
  
  const total = changes.reduce((sum, c) => sum + c.totalChanges, 0);
  lines.push(`${changes.length} files changed, ${total} lines modified`);

  if (byType.addition.length > 0) {
    lines.push(`  ${byType.addition.length} new files (+${byType.addition.reduce((s, c) => s + c.additions, 0)} lines)`);
  }
  if (byType.deletion.length > 0) {
    lines.push(`  ${byType.deletion.length} deletions (-${byType.deletion.reduce((s, c) => s + c.deletions, 0)} lines)`);
  }
  if (byType.modification.length > 0) {
    lines.push(`  ${byType.modification.length} modifications`);
  }
  if (byType.refactor.length > 0) {
    lines.push(`  ${byType.refactor.length} refactorings`);
  }

  const critical = changes.filter(c => c.priority === 'critical');
  if (critical.length > 0) {
    lines.push(`\nHigh-impact files (${critical.length}):`);
    for (const change of critical.slice(0, 5)) {
      lines.push(`  - ${change.file} (+${change.additions}/-${change.deletions})`);
    }
  }

  return lines.join('\n');
};

/**
 * Extract changed function/class names from diff.
 * 
 * @param {string} ref - Git reference
 * @param {string} file - File path
 * @param {string} root - Project root
 * @returns {Promise<Array<string>>} Changed symbol names
 */
export const getChangedSymbols = async (ref, file, root) => {
  try {
    const { stdout } = await execFile('git', ['diff', '-U0', ref, '--', file], {
      cwd: root,
      timeout: 5000,
    });

    const symbols = new Set();
    const lines = stdout.split('\n');

    for (const line of lines) {
      if (!line.startsWith('+')) continue;

      const functionMatch = line.match(/\b(function|const|let|var)\s+(\w+)/);
      const classMatch = line.match(/\bclass\s+(\w+)/);
      const arrowMatch = line.match(/\b(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);

      if (functionMatch) symbols.add(functionMatch[2]);
      if (classMatch) symbols.add(classMatch[1]);
      if (arrowMatch) symbols.add(arrowMatch[1]);

      const pyDefMatch = line.match(/\bdef\s+(\w+)/);
      const pyClassMatch = line.match(/\bclass\s+(\w+)/);
      
      if (pyDefMatch) symbols.add(pyDefMatch[1]);
      if (pyClassMatch) symbols.add(pyClassMatch[1]);
    }

    return Array.from(symbols);
  } catch {
    return [];
  }
};
