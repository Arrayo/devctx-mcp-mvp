import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './paths.js';

const assertInsideProject = (fullPath, root = projectRoot) => {
  const relative = path.relative(root, fullPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${fullPath}`);
  }
};

export const resolveSafePath = (inputPath = '.', root = projectRoot) => {
  const fullPath = path.resolve(root, inputPath);
  assertInsideProject(fullPath, root);
  return fullPath;
};

const BINARY_CHECK_BYTES = 8192;

export const isBinaryBuffer = (buffer) => {
  const length = Math.min(buffer.length, BINARY_CHECK_BYTES);

  for (let i = 0; i < length; i++) {
    const byte = buffer[i];
    if (byte === 0) return true;
    if (byte < 8 && byte !== 7) return true;
  }

  return false;
};

export const isDockerfile = (filePath) => {
  const baseName = path.basename(filePath).toLowerCase();
  return baseName === 'dockerfile' || baseName.startsWith('dockerfile.');
};

export const readTextFile = (inputPath, root = projectRoot) => {
  const fullPath = resolveSafePath(inputPath, root);
  const raw = fs.readFileSync(fullPath);

  if (isBinaryBuffer(raw)) {
    throw new Error(`Binary file, cannot read as text: ${fullPath}`);
  }

  return { fullPath, content: raw.toString('utf8') };
};
