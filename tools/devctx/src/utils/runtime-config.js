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

const defaultDevctxRoot = path.resolve(currentDir, '..', '..');
const defaultProjectRoot = path.resolve(defaultDevctxRoot, '..', '..');
const projectRootArg = readArgValue('--project-root');
const projectRootEnv = process.env.DEVCTX_PROJECT_ROOT ?? null;
const rawProjectRoot = projectRootArg ?? projectRootEnv ?? defaultProjectRoot;

export const devctxRoot = defaultDevctxRoot;
export let projectRoot = path.resolve(rawProjectRoot);
export const projectRootSource = projectRootArg ? 'argv' : projectRootEnv ? 'env' : 'default';

export const setProjectRoot = (newRoot) => {
  projectRoot = path.resolve(newRoot);
};
