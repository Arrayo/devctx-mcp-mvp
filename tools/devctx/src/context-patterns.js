import { withStateDb, withStateDbSnapshot } from './storage/sqlite.js';

const PATTERN_CONFIDENCE_THRESHOLD = 0.6;
const MIN_PATTERN_OCCURRENCES = 3;
const MAX_PREDICTED_FILES = 8;
const PATTERN_DECAY_DAYS = 30;

const initPatternTables = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_patterns (
      pattern_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_signature TEXT NOT NULL,
      intent TEXT,
      occurrences INTEGER DEFAULT 1,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(task_signature, intent)
    );

    CREATE TABLE IF NOT EXISTS pattern_files (
      pattern_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      access_order INTEGER NOT NULL,
      access_count INTEGER DEFAULT 1,
      avg_relevance REAL DEFAULT 1.0,
      last_accessed_at TEXT NOT NULL,
      FOREIGN KEY(pattern_id) REFERENCES context_patterns(pattern_id) ON DELETE CASCADE,
      PRIMARY KEY(pattern_id, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_pattern_signature ON context_patterns(task_signature);
    CREATE INDEX IF NOT EXISTS idx_pattern_files_lookup ON pattern_files(pattern_id, avg_relevance DESC);
  `);
};

const normalizeTaskSignature = (task) => {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length > 2)
    .slice(0, 8)
    .join(' ');
};

const computeTaskSimilarity = (task1, task2) => {
  const words1 = new Set(task1.split(' '));
  const words2 = new Set(task2.split(' '));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
};

export const recordContextAccess = async ({ task, intent, files }) => {
  if (!task || !Array.isArray(files) || files.length === 0) return;

  const signature = normalizeTaskSignature(task);
  if (!signature) return;

  return withStateDb((db) => {
    initPatternTables(db);
    
    const now = new Date().toISOString();
    
    db.exec('BEGIN');
    try {
      const existing = db.prepare(
        'SELECT pattern_id, occurrences FROM context_patterns WHERE task_signature = ? AND intent = ?'
      ).get(signature, intent || 'explore');

      let patternId;
      if (existing) {
        db.prepare(
          'UPDATE context_patterns SET occurrences = occurrences + 1, last_seen_at = ? WHERE pattern_id = ?'
        ).run(now, existing.pattern_id);
        patternId = existing.pattern_id;
      } else {
        const result = db.prepare(
          'INSERT INTO context_patterns (task_signature, intent, last_seen_at, created_at) VALUES (?, ?, ?, ?)'
        ).run(signature, intent || 'explore', now, now);
        patternId = result.lastInsertRowid;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const existingFile = db.prepare(
          'SELECT access_count, avg_relevance FROM pattern_files WHERE pattern_id = ? AND file_path = ?'
        ).get(patternId, file.path);

        if (existingFile) {
          const newCount = existingFile.access_count + 1;
          const newRelevance = (existingFile.avg_relevance * existingFile.access_count + (file.relevance || 1.0)) / newCount;
          
          db.prepare(
            'UPDATE pattern_files SET access_count = ?, avg_relevance = ?, last_accessed_at = ? WHERE pattern_id = ? AND file_path = ?'
          ).run(newCount, newRelevance, now, patternId, file.path);
        } else {
          db.prepare(
            'INSERT INTO pattern_files (pattern_id, file_path, access_order, avg_relevance, last_accessed_at) VALUES (?, ?, ?, ?, ?)'
          ).run(patternId, file.path, i, file.relevance || 1.0, now);
        }
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
};

export const predictContextFiles = async ({ task, intent, maxFiles = MAX_PREDICTED_FILES }) => {
  const signature = normalizeTaskSignature(task);
  if (!signature) return { predicted: [], confidence: 0, matchedPattern: null };

  return withStateDbSnapshot((db) => {
    initPatternTables(db);

    const cutoffDate = new Date(Date.now() - PATTERN_DECAY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    
    const patterns = db.prepare(`
      SELECT pattern_id, task_signature, intent, occurrences, last_seen_at
      FROM context_patterns
      WHERE last_seen_at > ?
      ORDER BY occurrences DESC
      LIMIT 20
    `).all(cutoffDate);

    let bestMatch = null;
    let bestScore = 0;

    for (const pattern of patterns) {
      if (intent && pattern.intent !== intent) continue;
      
      const similarity = computeTaskSimilarity(signature, pattern.task_signature);
      const recencyBonus = pattern.occurrences >= MIN_PATTERN_OCCURRENCES ? 0.1 : 0;
      const score = similarity + recencyBonus;

      if (score > bestScore && score >= PATTERN_CONFIDENCE_THRESHOLD) {
        bestScore = score;
        bestMatch = pattern;
      }
    }

    if (!bestMatch) {
      return { predicted: [], confidence: 0, matchedPattern: null };
    }

    const files = db.prepare(`
      SELECT file_path, access_order, access_count, avg_relevance
      FROM pattern_files
      WHERE pattern_id = ?
      ORDER BY avg_relevance DESC, access_count DESC, access_order ASC
      LIMIT ?
    `).all(bestMatch.pattern_id, maxFiles);

    return {
      predicted: files.map(f => ({
        path: f.file_path,
        confidence: f.avg_relevance,
        accessCount: f.access_count,
        order: f.access_order
      })),
      confidence: bestScore,
      matchedPattern: {
        signature: bestMatch.task_signature,
        intent: bestMatch.intent,
        occurrences: bestMatch.occurrences
      }
    };
  }, {});
};

export const cleanupStalePatterns = async ({ retentionDays = PATTERN_DECAY_DAYS } = {}) => {
  return withStateDb((db) => {
    initPatternTables(db);
    
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    
    const result = db.prepare(
      'DELETE FROM context_patterns WHERE last_seen_at < ?'
    ).run(cutoffDate);

    return {
      action: 'cleanup_patterns',
      deletedPatterns: result.changes,
      retentionDays
    };
  });
};
