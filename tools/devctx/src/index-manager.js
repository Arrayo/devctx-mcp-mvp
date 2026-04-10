import fs from 'node:fs';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot } from './utils/paths.js';
import { loadIndex, buildIndex as buildIndexCore } from './index.js';

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
    console.warn('Failed to save index metadata:', error.message);
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

const isTestEnvironment = () => {
  return process.env.NODE_ENV === 'test' || 
         typeof process.env.NODE_TEST_CONTEXT !== 'undefined' ||
         process.argv.some(arg => arg.includes('--test'));
};

const isMcpEnvironment = () => {
  return process.env.MCP_SERVER === 'true' || 
         process.argv.some(arg => arg.includes('devctx-server'));
};

const log = (message, level = 'info') => {
  if (isTestEnvironment() || isMcpEnvironment()) {
    return;
  }
  
  if (level === 'warn') {
    console.warn(message);
  } else {
    console.log(message);
  }
};

export const ensureIndexReady = async (options = {}) => {
  const { force = false, timeoutMs = INDEX_BUILD_TIMEOUT_MS, root = projectRoot, silent = false } = options;
  
  if (!force) {
    const existingIndex = loadIndex(root);
    if (existingIndex) {
      const meta = loadIndexMetadata(root);
      if (isIndexFresh(meta, root)) {
        return { status: 'ready', cached: true };
      }
    }
  }
  
  if (!silent) {
    log('📦 Building search index (this may take 30-60s)...');
  }
  
  try {
    const buildPromise = buildIndexCore({ root, incremental: true });
    const result = await Promise.race([
      buildPromise,
      timeout(timeoutMs, 'Index build timeout')
    ]);
    
    saveIndexMetadata({
      builtAt: Date.now(),
      gitHead: getGitHead(root),
      fileCount: result?.files?.length || 0,
      version: result?.version
    }, root);
    
    if (!silent) {
      log('✅ Index ready');
    }
    return { status: 'built', cached: false, fileCount: result?.files?.length || 0 };
  } catch (error) {
    if (!silent) {
      log('⚠️ Index build failed, search will use fallback mode', 'warn');
    }
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
