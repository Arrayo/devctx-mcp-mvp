import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);

const readArgValue = (name) => {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
};

const readEnvValue = (...names) => {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
};

const defaultDevctxRoot = path.resolve(currentDir, '..', '..');
const defaultProjectRoot = path.resolve(process.cwd());
const projectRootArg = readArgValue('--project-root');
const projectRootEnv = readEnvValue('DEVCTX_PROJECT_ROOT', 'MCP_PROJECT_ROOT');
const rawProjectRoot = projectRootArg ?? projectRootEnv ?? defaultProjectRoot;

export const devctxRoot = defaultDevctxRoot;
export let projectRoot = path.resolve(rawProjectRoot);
export const projectRootSource = projectRootArg ? 'argv' : projectRootEnv ? 'env' : 'cwd';

export const setProjectRoot = (newRoot) => {
  projectRoot = path.resolve(newRoot);
};
