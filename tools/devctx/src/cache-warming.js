/**
 * Cache warming for intelligent index preloading.
 * 
 * Analyzes usage patterns and preloads frequently accessed files into memory
 * to reduce cold-start latency on first queries.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadIndex } from './index.js';
import { withStateDb, getStateDbPath } from './storage/sqlite.js';
import { projectRoot } from './utils/paths.js';

const isCacheWarmingEnabled = () => process.env.DEVCTX_CACHE_WARMING !== 'false';
const WARM_TOP_N_FILES = parseInt(process.env.DEVCTX_WARM_FILES || '50', 10);
const MIN_ACCESS_COUNT = 3;

export const getFrequentlyAccessedFiles = async (root = projectRoot, limit = WARM_TOP_N_FILES) => {
  if (!isCacheWarmingEnabled()) return [];

  try {
    const dbPath = getStateDbPath(root);
    if (!fs.existsSync(dbPath)) return [];

    const files = await withStateDb(async (db) => {
      const rows = db.prepare(`
        SELECT file_path, COUNT(*) as access_count
        FROM context_access
        WHERE timestamp > datetime('now', '-30 days')
        GROUP BY file_path
        HAVING access_count >= ?
        ORDER BY access_count DESC, MAX(timestamp) DESC
        LIMIT ?
      `).all(MIN_ACCESS_COUNT, limit);

      return rows.map(r => r.file_path);
    }, { filePath: dbPath });

    return files;
  } catch {
    return [];
  }
};

export const warmCache = async (root = projectRoot, progress = null) => {
  if (!isCacheWarmingEnabled()) {
    return { warmed: 0, skipped: 0, reason: 'disabled' };
  }

  const index = loadIndex(root);
  if (!index) {
    return { warmed: 0, skipped: 0, reason: 'no_index' };
  }

  const frequentFiles = await getFrequentlyAccessedFiles(root);
  if (frequentFiles.length === 0) {
    return { warmed: 0, skipped: 0, reason: 'no_frequent_files' };
  }

  let warmed = 0;
  let skipped = 0;

  for (let i = 0; i < frequentFiles.length; i++) {
    const relPath = frequentFiles[i];
    const absPath = path.join(root, relPath);

    if (progress && i % 10 === 0) {
      progress.report({
        phase: 'warming',
        processed: i,
        total: frequentFiles.length,
        percentage: Math.round((i / frequentFiles.length) * 100),
      });
    }

    try {
      if (!fs.existsSync(absPath)) {
        skipped++;
        continue;
      }

      const stats = fs.statSync(absPath);
      if (stats.size > 1024 * 1024) {
        skipped++;
        continue;
      }

      fs.readFileSync(absPath, 'utf8');
      warmed++;
    } catch {
      skipped++;
    }
  }

  if (progress) {
    progress.report({
      phase: 'warming',
      processed: frequentFiles.length,
      total: frequentFiles.length,
      percentage: 100,
    });
  }

  return { warmed, skipped, totalCandidates: frequentFiles.length };
};

export const shouldWarmCache = async (root = projectRoot) => {
  if (!isCacheWarmingEnabled()) return false;

  const index = loadIndex(root);
  if (!index) return false;

  const frequentFiles = await getFrequentlyAccessedFiles(root, 10);
  return frequentFiles.length >= 5;
};

export const getCacheStats = async (root = projectRoot) => {
  const frequentFiles = await getFrequentlyAccessedFiles(root, 100);
  
  const byExtension = {};
  for (const file of frequentFiles) {
    const ext = path.extname(file) || 'no-ext';
    byExtension[ext] = (byExtension[ext] || 0) + 1;
  }

  return {
    totalFrequentFiles: frequentFiles.length,
    byExtension,
    topFiles: frequentFiles.slice(0, 10),
  };
};
