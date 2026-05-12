import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../utils/runtime-config.js';
import { parseYamlMini } from './yaml-mini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = path.join(__dirname, 'builtin');
const PROJECT_DIR_NAME = '.devctx/playbooks';

const SUPPORTED_EXT = new Set(['.yaml', '.yml', '.json']);
const SAFE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const listFilesIn = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SUPPORTED_EXT.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(dir, entry.name));
};

const parseContent = (content, ext) => {
  if (ext === '.json') return JSON.parse(content);
  return parseYamlMini(content);
};

const nameFromFile = (file) => {
  const base = path.basename(file).replace(/\.(ya?ml|json)$/i, '');
  return base;
};

const validatePlaybook = (raw, sourceFile) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Playbook ${sourceFile}: root must be a mapping`);
  }
  if (!raw.name || typeof raw.name !== 'string' || !SAFE_NAME_RE.test(raw.name)) {
    throw new Error(`Playbook ${sourceFile}: missing/invalid 'name'`);
  }
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error(`Playbook ${raw.name}: 'steps' must be a non-empty array`);
  }
  for (const [i, step] of raw.steps.entries()) {
    if (!step || typeof step !== 'object') {
      throw new Error(`Playbook ${raw.name}: step ${i} must be an object`);
    }
    if (typeof step.tool !== 'string' || step.tool.length === 0) {
      throw new Error(`Playbook ${raw.name}: step ${i} missing 'tool'`);
    }
    if (step.args !== undefined && step.args !== null && (typeof step.args !== 'object' || Array.isArray(step.args))) {
      throw new Error(`Playbook ${raw.name}: step ${i} 'args' must be an object`);
    }
  }
  return {
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : '',
    defaults: raw.defaults && typeof raw.defaults === 'object' && !Array.isArray(raw.defaults) ? raw.defaults : {},
    stopOnFail: raw.stopOnFail !== false,
    steps: raw.steps.map((step) => ({
      tool: step.tool,
      args: (step.args && typeof step.args === 'object' && !Array.isArray(step.args)) ? step.args : {},
      when: typeof step.when === 'string' ? step.when : null,
      label: typeof step.label === 'string' ? step.label : null,
    })),
    source: sourceFile,
  };
};

const collectFromDir = (dir, source) => {
  const out = new Map();
  for (const file of listFilesIn(dir)) {
    try {
      const ext = path.extname(file).toLowerCase();
      const raw = parseContent(fs.readFileSync(file, 'utf-8'), ext);
      const playbook = validatePlaybook(raw, source);
      if (playbook.name !== nameFromFile(file)) {
        playbook.fileName = nameFromFile(file);
      }
      out.set(playbook.name, playbook);
    } catch (err) {
      out.set(`__error__${path.basename(file)}`, { error: err.message, source, file });
    }
  }
  return out;
};

export const loadPlaybooks = ({ root = projectRoot } = {}) => {
  const builtin = collectFromDir(BUILTIN_DIR, 'builtin');
  const projectDir = path.join(root, PROJECT_DIR_NAME);
  const project = collectFromDir(projectDir, 'project');

  const merged = new Map(builtin);
  for (const [name, pb] of project) merged.set(name, pb);

  return {
    playbooks: merged,
    sources: {
      builtinDir: BUILTIN_DIR,
      projectDir,
      projectExists: fs.existsSync(projectDir),
    },
  };
};

export const listPlaybookSummaries = ({ root = projectRoot } = {}) => {
  const { playbooks, sources } = loadPlaybooks({ root });
  const summaries = [];
  const errors = [];
  for (const [, value] of playbooks) {
    if (value.error) {
      errors.push({ file: value.file, error: value.error, source: value.source });
      continue;
    }
    summaries.push({
      name: value.name,
      description: value.description,
      source: value.source,
      steps: value.steps.length,
      defaults: value.defaults,
    });
  }
  return { summaries, errors, sources };
};

export const _internal = { validatePlaybook, parseContent, nameFromFile };
