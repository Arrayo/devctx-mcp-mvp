#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { enforceRepoSafety } from '../src/repo-safety.js';
import { setProjectRoot } from '../src/utils/runtime-config.js';

const writeStdout = (text) => {
  fs.writeSync(process.stdout.fd, text);
};

const writeStderr = (text) => {
  fs.writeSync(process.stderr.fd, text);
};

const parseArgs = (argv) => {
  const options = {
    projectRoot: process.cwd(),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--project-root') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --project-root');
      }
      options.projectRoot = path.resolve(next);
      index += 1;
      continue;
    }

    if (token === '--json') {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
};

const printHuman = (result) => {
  if (result.ok) {
    writeStdout('devctx repo safety: ok\n');
    return;
  }

  writeStderr('devctx repo safety: failed\n');
  for (const violation of result.violations) {
    writeStderr(`- ${violation}\n`);
  }
  for (const action of result.recommendedActions) {
    writeStderr(`- ${action}\n`);
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  setProjectRoot(options.projectRoot);

  const result = enforceRepoSafety({ root: options.projectRoot });
  if (options.json) {
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (result.ok) {
      writeStdout(output);
    } else {
      writeStderr(output);
    }
  } else {
    printHuman(result);
  }

  process.exitCode = result.ok ? 0 : 1;
};

try {
  main();
} catch (error) {
  writeStderr(`${error.message}\n`);
  process.exitCode = 1;
}
