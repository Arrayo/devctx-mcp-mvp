import fs from 'node:fs';
import path from 'node:path';
import {
  loadIndex,
  reindexFile,
  removeFileFromIndex,
  persistIndex,
  buildIndex,
} from './index.js';
import { projectRoot } from './utils/paths.js';
import { IGNORED_DIRS, IGNORED_FILE_NAMES, IGNORED_FILE_PATTERNS } from './config/ignored-paths.js';

const DEFAULT_DEBOUNCE_MS = 600;
const DEFAULT_BATCH_FLUSH_MS = 2000;
const MAX_BATCH_FILES = 50;

const IGNORED_DIRS_SET = new Set(IGNORED_DIRS);
const IGNORED_FILE_SET = new Set(IGNORED_FILE_NAMES);

const ALLOWED_EXT = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.py', '.go', '.rs', '.java', '.cs', '.kt', '.kts', '.php', '.swift',
  '.md', '.markdown',
]);

export const isIgnoredPath = (relPath) => {
  if (!relPath || typeof relPath !== 'string') return true;
  const normalized = relPath.split(path.sep).join('/');
  for (const segment of normalized.split('/')) {
    if (IGNORED_DIRS_SET.has(segment)) return true;
  }
  const base = path.basename(normalized);
  if (IGNORED_FILE_SET.has(base)) return true;
  for (const re of IGNORED_FILE_PATTERNS) {
    if (re.test(base)) return true;
  }
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return true;
  return false;
};

const classifyChange = (root, relPath) => {
  const abs = path.join(root, relPath);
  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) return 'directory';
    return 'changed';
  } catch (err) {
    if (err && err.code === 'ENOENT') return 'removed';
    return 'unknown';
  }
};

export const applyChanges = ({ index, root, changes }) => {
  let touched = 0;
  let removed = 0;
  for (const relPath of changes) {
    const kind = classifyChange(root, relPath);
    if (kind === 'removed') {
      removeFileFromIndex(index, relPath);
      removed += 1;
      continue;
    }
    if (kind === 'changed') {
      try {
        reindexFile(index, root, relPath);
        touched += 1;
      } catch {
        // best-effort; ignore individual failures
      }
    }
  }
  return { touched, removed };
};

const createWatcherState = () => ({
  pending: new Set(),
  debounceTimer: null,
  flushing: false,
  flushPromise: null,
  watcher: null,
  running: false,
  stats: {
    flushes: 0,
    eventsObserved: 0,
    filesReindexed: 0,
    filesRemoved: 0,
    errors: 0,
    lastFlushAt: 0,
  },
});

const flushNow = async (state, root) => {
  if (state.flushing) {
    return state.flushPromise;
  }
  if (state.pending.size === 0) return { touched: 0, removed: 0 };

  const batch = [...state.pending];
  state.pending.clear();

  state.flushing = true;
  state.flushPromise = (async () => {
    try {
      let index = loadIndex(root);
      if (!index) {
        index = buildIndex(root);
      }
      const { touched, removed } = applyChanges({ index, root, changes: batch });
      if (touched > 0 || removed > 0) {
        await persistIndex(index, root);
      }
      state.stats.flushes += 1;
      state.stats.filesReindexed += touched;
      state.stats.filesRemoved += removed;
      state.stats.lastFlushAt = Date.now();
      return { touched, removed };
    } catch (error) {
      state.stats.errors += 1;
      return { error: error?.message ?? String(error) };
    } finally {
      state.flushing = false;
      state.flushPromise = null;
    }
  })();
  return state.flushPromise;
};

const scheduleFlush = (state, root, debounceMs) => {
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    flushNow(state, root).catch(() => {});
  }, debounceMs);
  if (state.debounceTimer.unref) state.debounceTimer.unref();
};

let activeWatcher = null;

export const getActiveWatcher = () => activeWatcher;

export const setActiveWatcher = (handle) => {
  activeWatcher = handle;
};

export const isWatchEnabled = () => {
  const value = String(process.env.DEVCTX_WATCH_INDEX ?? '').trim().toLowerCase();
  if (value === '' || value === '1' || value === 'true' || value === 'yes') return true;
  return false;
};

export const startIndexWatcher = ({
  root = projectRoot,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  batchFlushMs = DEFAULT_BATCH_FLUSH_MS,
} = {}) => {
  const state = createWatcherState();

  if (!isWatchEnabled()) {
    return {
      stop: async () => ({ stopped: false, reason: 'disabled' }),
      flush: async () => ({ touched: 0, removed: 0, skipped: true }),
      stats: () => ({ ...state.stats, enabled: false }),
      isRunning: () => false,
    };
  }

  let watcher;
  try {
    watcher = fs.watch(root, { recursive: true, persistent: false }, (eventType, filename) => {
      if (!filename) return;
      const relPath = typeof filename === 'string' ? filename : filename.toString();
      if (isIgnoredPath(relPath)) return;

      state.stats.eventsObserved += 1;
      state.pending.add(relPath);

      if (state.pending.size >= MAX_BATCH_FILES) {
        if (state.debounceTimer) clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
        flushNow(state, root).catch(() => {});
        return;
      }
      scheduleFlush(state, root, debounceMs);
    });
  } catch (error) {
    return {
      stop: async () => ({ stopped: false, error: error?.message ?? String(error) }),
      flush: async () => ({ touched: 0, removed: 0, skipped: true }),
      stats: () => ({ ...state.stats, enabled: false, error: error?.message ?? String(error) }),
      isRunning: () => false,
    };
  }

  state.watcher = watcher;
  state.running = true;

  const safetyInterval = setInterval(() => {
    if (state.pending.size === 0) return;
    flushNow(state, root).catch(() => {});
  }, batchFlushMs);
  if (safetyInterval.unref) safetyInterval.unref();

  watcher.on('error', () => {
    state.stats.errors += 1;
  });

  return {
    stop: async () => {
      if (!state.running) return { stopped: false };
      state.running = false;
      try { watcher.close(); } catch { /* noop */ }
      clearInterval(safetyInterval);
      if (state.debounceTimer) clearTimeout(state.debounceTimer);
      const finalFlush = await flushNow(state, root).catch(() => ({}));
      return { stopped: true, finalFlush };
    },
    flush: async () => flushNow(state, root),
    stats: () => ({ ...state.stats, enabled: true, pending: state.pending.size }),
    isRunning: () => state.running,
  };
};

export const _internal = { classifyChange, createWatcherState, flushNow, scheduleFlush };
