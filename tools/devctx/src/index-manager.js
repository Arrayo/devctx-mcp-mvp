import fs from 'node:fs';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot } from './utils/paths.js';
import { loadIndex, buildIndexIncremental, persistIndex } from './index.js';

const execFile = promisify(execFileCallback);

const INDEX_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const INDEX_BUILD_TIMEOUT_MS = 60000;

const resolveMetadataPath = (root = projectRoot) => {
  return path.join(root, '.devctx', 'index-meta.json');
};

const loadIndexMetadata = (root = projectRoot) => {
  try {
    const metaPath = resolveMetadataPath(root);
    const raw = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveIndexMetadata = (meta, root = projectRoot) => {
  try {
    const metaPath = resolveMetadataPath(root);
    const dir = path.dirname(metaPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch (error) {
    process.stderr.write(`[devctx] Failed to save index metadata: ${error.message}\n`);
  }
};

const getGitHead = (root = projectRoot) => {
  try {
    const gitHeadPath = path.join(root, '.git', 'HEAD');
    if (!fs.existsSync(gitHeadPath)) return null;
    return fs.readFileSync(gitHeadPath, 'utf8').trim();
  } catch {
    return null;
  }
};

const isIndexFresh = (meta, root = projectRoot) => {
  if (!meta || !meta.builtAt) return false;
  
  const age = Date.now() - meta.builtAt;
  if (age < INDEX_FRESHNESS_MS) return true;
  
  const currentHead = getGitHead(root);
  if (currentHead && currentHead === meta.gitHead) return true;
  
  return false;
};

const timeout = (ms, message) => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

const log = (message) => {
  process.stderr.write(`[devctx] ${message}\n`);
};

export const ensureIndexReady = async (options = {}) => {
  const { force = false, timeoutMs = INDEX_BUILD_TIMEOUT_MS, root = projectRoot } = options;
  
  if (!force) {
    const existingIndex = loadIndex(root);
    if (existingIndex) {
      const meta = loadIndexMetadata(root);
      if (isIndexFresh(meta, root)) {
        return { status: 'ready', cached: true };
      }
    }
  }
  
  log('Building search index...');

  try {
    const buildPromise = (async () => {
      const { index, stats } = buildIndexIncremental(root);
      await persistIndex(index, root);
      return { stats, fileCount: Object.keys(index.files).length, version: index.version };
    })();

    const result = await Promise.race([
      buildPromise,
      timeout(timeoutMs, 'Index build timeout'),
    ]);

    saveIndexMetadata({
      builtAt: Date.now(),
      gitHead: getGitHead(root),
      fileCount: result.fileCount,
      version: result.version,
    }, root);

    log('Index ready');
    return { status: 'built', cached: false, fileCount: result.fileCount };
  } catch (error) {
    log(`Index build failed: ${error.message}`);
    return { status: 'fallback', error: error.message };
  }
};

export const getIndexStatus = (root = projectRoot) => {
  const index = loadIndex(root);
  if (!index) {
    return { available: false, fresh: false, reason: 'not_built' };
  }
  
  const meta = loadIndexMetadata(root);
  const fresh = isIndexFresh(meta, root);
  
  return {
    available: true,
    fresh,
    builtAt: meta?.builtAt,
    fileCount: meta?.fileCount,
    age: meta?.builtAt ? Date.now() - meta.builtAt : null
  };
};
