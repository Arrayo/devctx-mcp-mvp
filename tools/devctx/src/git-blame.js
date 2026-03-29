/**
 * Symbol-level git blame for fine-grained code attribution.
 * 
 * Provides author information at function/class level instead of just file level.
 */

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { loadIndex } from './index.js';
import { projectRoot } from './utils/paths.js';

const execFile = promisify(execFileCallback);

/**
 * Get git blame data for a file with line-level attribution.
 * 
 * @param {string} filePath - Relative path from project root
 * @param {string} root - Project root
 * @returns {Promise<Array>} Array of { line, author, email, date, commit, content }
 */
export const getFileBlame = async (filePath, root = projectRoot) => {
  try {
    const { stdout } = await execFile('git', [
      'blame',
      '--line-porcelain',
      '--',
      filePath
    ], {
      cwd: root,
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const lines = stdout.split('\n');
    const blameData = [];
    let currentCommit = null;
    let currentAuthor = null;
    let currentEmail = null;
    let currentDate = null;
    let lineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.match(/^[0-9a-f]{40}/)) {
        const parts = line.split(' ');
        currentCommit = parts[0];
        lineNumber = parseInt(parts[2], 10);
      } else if (line.startsWith('author ')) {
        currentAuthor = line.substring(7);
      } else if (line.startsWith('author-mail ')) {
        currentEmail = line.substring(12).replace(/[<>]/g, '');
      } else if (line.startsWith('author-time ')) {
        const timestamp = parseInt(line.substring(12), 10);
        currentDate = new Date(timestamp * 1000).toISOString();
      } else if (line.startsWith('\t')) {
        const content = line.substring(1);
        blameData.push({
          line: lineNumber,
          author: currentAuthor,
          email: currentEmail,
          date: currentDate,
          commit: currentCommit,
          content,
        });
      }
    }

    return blameData;
  } catch (err) {
    if (err.code === 'ENOENT' || err.stderr?.includes('no such path')) {
      return [];
    }
    throw err;
  }
};

/**
 * Get symbol-level blame information for a file.
 * 
 * @param {string} filePath - Relative path from project root
 * @param {string} root - Project root
 * @returns {Promise<Array>} Array of { symbol, kind, author, email, date, commit, lineStart, lineEnd }
 */
export const getSymbolBlame = async (filePath, root = projectRoot) => {
  const index = loadIndex(root);
  if (!index?.files?.[filePath]) {
    return [];
  }

  const fileInfo = index.files[filePath];
  if (!fileInfo.symbols || fileInfo.symbols.length === 0) {
    return [];
  }

  const blameData = await getFileBlame(filePath, root);
  if (blameData.length === 0) {
    return [];
  }

  const symbolBlame = [];

  for (const symbol of fileInfo.symbols) {
    const lineStart = symbol.line;
    const lineEnd = symbol.lineEnd || lineStart;

    const relevantLines = blameData.filter(
      b => b.line >= lineStart && b.line <= lineEnd
    );

    if (relevantLines.length === 0) continue;

    const authorCounts = {};
    for (const line of relevantLines) {
      const key = `${line.author}|${line.email}`;
      if (!authorCounts[key]) {
        authorCounts[key] = {
          author: line.author,
          email: line.email,
          commit: line.commit,
          date: line.date,
          count: 0,
        };
      }
      authorCounts[key].count++;
    }

    const sortedAuthors = Object.values(authorCounts).sort((a, b) => b.count - a.count);
    const primaryAuthor = sortedAuthors[0];

    const contributorCount = sortedAuthors.length;
    const primaryPercentage = Math.round((primaryAuthor.count / relevantLines.length) * 100);

    symbolBlame.push({
      symbol: symbol.name,
      kind: symbol.kind,
      author: primaryAuthor.author,
      email: primaryAuthor.email,
      date: primaryAuthor.date,
      commit: primaryAuthor.commit,
      lineStart,
      lineEnd,
      linesAuthored: primaryAuthor.count,
      totalLines: relevantLines.length,
      authorshipPercentage: primaryPercentage,
      contributors: contributorCount,
      ...(contributorCount > 1 ? { allContributors: sortedAuthors } : {}),
    });
  }

  return symbolBlame;
};

/**
 * Get aggregated authorship statistics for a file.
 * 
 * @param {string} filePath - Relative path from project root
 * @param {string} root - Project root
 * @returns {Promise<object>} Aggregated stats
 */
export const getFileAuthorshipStats = async (filePath, root = projectRoot) => {
  const blameData = await getFileBlame(filePath, root);
  if (blameData.length === 0) {
    return {
      totalLines: 0,
      authors: [],
      lastModified: null,
      oldestLine: null,
    };
  }

  const authorStats = {};
  let mostRecentDate = null;
  let oldestDate = null;

  for (const line of blameData) {
    const key = line.email;
    if (!authorStats[key]) {
      authorStats[key] = {
        author: line.author,
        email: line.email,
        lines: 0,
        commits: new Set(),
        firstContribution: line.date,
        lastContribution: line.date,
      };
    }

    authorStats[key].lines++;
    authorStats[key].commits.add(line.commit);

    if (!mostRecentDate || line.date > mostRecentDate) {
      mostRecentDate = line.date;
    }
    if (!oldestDate || line.date < oldestDate) {
      oldestDate = line.date;
    }

    if (line.date < authorStats[key].firstContribution) {
      authorStats[key].firstContribution = line.date;
    }
    if (line.date > authorStats[key].lastContribution) {
      authorStats[key].lastContribution = line.date;
    }
  }

  const authors = Object.values(authorStats)
    .map(a => ({
      author: a.author,
      email: a.email,
      lines: a.lines,
      percentage: Math.round((a.lines / blameData.length) * 100),
      commits: a.commits.size,
      firstContribution: a.firstContribution,
      lastContribution: a.lastContribution,
    }))
    .sort((a, b) => b.lines - a.lines);

  return {
    totalLines: blameData.length,
    authors,
    lastModified: mostRecentDate,
    oldestLine: oldestDate,
  };
};

/**
 * Find symbols authored by a specific person.
 * 
 * @param {string} authorQuery - Author name or email (partial match)
 * @param {string} root - Project root
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of { file, symbol, kind, author, email, percentage }
 */
export const findSymbolsByAuthor = async (authorQuery, root = projectRoot, limit = 50) => {
  const index = loadIndex(root);
  if (!index?.files) return [];

  const normalizedQuery = authorQuery.toLowerCase();
  const results = [];

  const files = Object.keys(index.files).slice(0, 100);

  for (const filePath of files) {
    try {
      const symbolBlame = await getSymbolBlame(filePath, root);

      for (const sb of symbolBlame) {
        const authorMatch = sb.author.toLowerCase().includes(normalizedQuery);
        const emailMatch = sb.email.toLowerCase().includes(normalizedQuery);

        if (authorMatch || emailMatch) {
          results.push({
            file: filePath,
            symbol: sb.symbol,
            kind: sb.kind,
            author: sb.author,
            email: sb.email,
            authorshipPercentage: sb.authorshipPercentage,
            lineStart: sb.lineStart,
            lineEnd: sb.lineEnd,
          });

          if (results.length >= limit) {
            return results;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return results;
};

/**
 * Get recently modified symbols across the project.
 * 
 * @param {string} root - Project root
 * @param {number} limit - Max results
 * @param {number} daysBack - How many days to look back
 * @returns {Promise<Array>} Array of { file, symbol, kind, author, date, daysAgo }
 */
export const getRecentlyModifiedSymbols = async (root = projectRoot, limit = 20, daysBack = 30) => {
  const index = loadIndex(root);
  if (!index?.files) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffISO = cutoffDate.toISOString();

  const results = [];
  const files = Object.keys(index.files).slice(0, 50);

  for (const filePath of files) {
    try {
      const symbolBlame = await getSymbolBlame(filePath, root);

      for (const sb of symbolBlame) {
        if (sb.date >= cutoffISO) {
          const daysAgo = Math.floor((Date.now() - new Date(sb.date).getTime()) / (1000 * 60 * 60 * 24));

          results.push({
            file: filePath,
            symbol: sb.symbol,
            kind: sb.kind,
            author: sb.author,
            email: sb.email,
            date: sb.date,
            daysAgo,
          });
        }
      }
    } catch {
      continue;
    }
  }

  return results
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
};
