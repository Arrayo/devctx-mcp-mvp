#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { smartDoctor } from '../src/tools/smart-doctor.js';
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
    verifyIntegrity: true,
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

    if (token === '--no-integrity') {
      options.verifyIntegrity = false;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
};

const printHuman = (result) => {
  const writer = result.overall === 'error' ? writeStderr : writeStdout;
  writer(`devctx doctor: ${result.overall}\n`);
  writer(`${result.message}\n`);

  for (const check of result.checks ?? []) {
    writer(`\n[${check.status}] ${check.id}: ${check.message}\n`);
    for (const action of check.recommendedActions ?? []) {
      writer(`- ${action}\n`);
    }
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  setProjectRoot(options.projectRoot);

  const result = await smartDoctor({
    verifyIntegrity: options.verifyIntegrity,
  });

  if (options.json) {
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (result.overall === 'error') {
      writeStderr(output);
    } else {
      writeStdout(output);
    }
  } else {
    printHuman(result);
  }

  process.exitCode = result.overall === 'error' ? 1 : 0;
};

main().catch((error) => {
  writeStderr(`${error.message}\n`);
  process.exitCode = 1;
});
