import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getStateDbPath } from './storage/sqlite.js';
import { projectRoot } from './utils/runtime-config.js';

export const HARD_BLOCK_REPO_SAFETY_REASONS = Object.freeze([
  ['tracked', 'isTracked'],
  ['staged', 'isStaged'],
]);

const hasGitignoreEntry = (content, entry) => {
  const target = entry.replace(/\/+$/, '');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\/+$/, ''))
    .includes(target);
};

const runGit = (args, cwd) => {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      ok: true,
      code: 0,
      stdout: stdout.trim(),
      stderr: '',
    };
  } catch (error) {
    return {
      ok: false,
      code: Number.isInteger(error.status) ? error.status : null,
      stdout: typeof error.stdout === 'string' ? error.stdout.trim() : '',
      stderr: typeof error.stderr === 'string' ? error.stderr.trim() : '',
      errorCode: error.code ?? null,
    };
  }
};

const toRelativePath = (basePath, targetPath) => path.relative(basePath, path.resolve(targetPath)).replace(/\\/g, '/');

const getStagedFiles = (gitRoot, filePath) => {
  const result = runGit(['diff', '--cached', '--name-only', '--', filePath], gitRoot);
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

export const getRepoSafety = ({
  root = projectRoot,
  stateDbPath = getStateDbPath(),
} = {}) => {
  const repoRootResult = runGit(['rev-parse', '--show-toplevel'], root);

  if (!repoRootResult.ok || !repoRootResult.stdout) {
    return {
      available: false,
      isGitRepo: false,
      riskLevel: 'unknown',
      warnings: [],
      recommendedActions: [],
    };
  }

  const gitRoot = repoRootResult.stdout;
  const relativeStateDbPath = toRelativePath(gitRoot, stateDbPath);
  const projectGitignorePath = path.join(root, '.gitignore');
  const gitignoreContent = fs.existsSync(projectGitignorePath)
    ? fs.readFileSync(projectGitignorePath, 'utf8')
    : '';
  const projectIgnoreEntryPresent = hasGitignoreEntry(gitignoreContent, '.devctx/');

  const ignoredResult = runGit(['check-ignore', relativeStateDbPath], gitRoot);
  const trackedResult = runGit(['ls-files', '--error-unmatch', relativeStateDbPath], gitRoot);

  const isIgnored = ignoredResult.code === 0;
  const isTracked = trackedResult.code === 0;
  const stagedPaths = getStagedFiles(gitRoot, relativeStateDbPath);
  const isStaged = stagedPaths.length > 0;
  const warnings = [];
  const recommendedActions = [];

  if (isTracked) {
    warnings.push(`${relativeStateDbPath} is tracked by git and can be committed accidentally.`);
    recommendedActions.push(`Untrack ${relativeStateDbPath} and keep .devctx/ ignored before committing.`);
  }

  if (isStaged) {
    warnings.push(`${relativeStateDbPath} is staged for commit.`);
    recommendedActions.push(`Unstage ${relativeStateDbPath} before committing.`);
  } else if (!isIgnored) {
    warnings.push(`${relativeStateDbPath} is not ignored by git.`);
    recommendedActions.push('Add .devctx/ to the project .gitignore before relying on project-local state.');
  }

  if (!projectIgnoreEntryPresent) {
    recommendedActions.push('Ensure the project .gitignore contains `.devctx/` for explicit local-state hygiene.');
  }

  return {
    available: true,
    isGitRepo: true,
    gitRoot,
    stateDbPath: relativeStateDbPath,
    projectGitignorePath: path.relative(root, projectGitignorePath).replace(/\\/g, '/'),
    projectIgnoreEntryPresent,
    isIgnored,
    isTracked,
    isStaged,
    stagedPaths,
    riskLevel: warnings.length > 0 ? 'warning' : 'ok',
    warnings,
    recommendedActions,
  };
};

export const enforceRepoSafety = ({
  root = projectRoot,
  stateDbPath = getStateDbPath(),
} = {}) => {
  const safety = getRepoSafety({ root, stateDbPath });

  if (!safety.available) {
    return {
      ...safety,
      enforced: false,
      ok: true,
      violations: [],
      message: 'Repository safety checks skipped because no git repository was detected.',
    };
  }

  const violations = [];

  if (!safety.projectIgnoreEntryPresent) {
    violations.push('The project .gitignore does not include .devctx/.');
  }

  if (!safety.isIgnored) {
    violations.push(`${safety.stateDbPath} is not ignored by git.`);
  }

  if (safety.isTracked) {
    violations.push(`${safety.stateDbPath} is tracked by git.`);
  }

  if (safety.isStaged) {
    violations.push(`${safety.stateDbPath} is staged for commit.`);
  }

  return {
    ...safety,
    enforced: true,
    ok: violations.length === 0,
    violations,
    message: violations.length === 0
      ? 'Repository safety checks passed.'
      : 'Repository safety checks failed.',
  };
};

export const getRepoMutationSafety = ({
  root = projectRoot,
  stateDbPath = getStateDbPath(),
} = {}) => {
  const repoSafety = enforceRepoSafety({ root, stateDbPath });
  const reasons = HARD_BLOCK_REPO_SAFETY_REASONS
    .filter(([, field]) => repoSafety[field])
    .map(([reason]) => reason);

  return {
    repoSafety,
    shouldBlock: reasons.length > 0,
    reasons,
  };
};
