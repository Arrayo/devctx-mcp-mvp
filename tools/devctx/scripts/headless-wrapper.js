#!/usr/bin/env node
import { runHeadlessWrapper } from '../src/orchestration/headless-wrapper.js';
import { detectClient } from '../src/utils/client-detection.js';

const requireValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value === '--') {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
};

const parseArgs = (argv) => {
  const options = {
    client: null,
    prompt: '',
    sessionId: undefined,
    event: undefined,
    stdinPrompt: false,
    dryRun: false,
    json: false,
    streamOutput: true,
    command: '',
    args: [],
  };

  let commandIndex = argv.indexOf('--');
  const head = commandIndex === -1 ? argv : argv.slice(0, commandIndex);

  for (let index = 0; index < head.length; index += 1) {
    const token = head[index];

    if (token === '--client') {
      options.client = requireValue(head, index, '--client');
      index += 1;
      continue;
    }

    if (token === '--prompt') {
      options.prompt = requireValue(head, index, '--prompt');
      index += 1;
      continue;
    }

    if (token === '--session-id') {
      options.sessionId = requireValue(head, index, '--session-id');
      index += 1;
      continue;
    }

    if (token === '--event') {
      options.event = requireValue(head, index, '--event');
      index += 1;
      continue;
    }

    if (token === '--stdin-prompt') {
      options.stdinPrompt = true;
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (token === '--json') {
      options.json = true;
      continue;
    }

    if (token === '--quiet') {
      options.streamOutput = false;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (commandIndex !== -1) {
    const commandParts = argv.slice(commandIndex + 1);
    if (commandParts.length > 0) {
      [options.command, ...options.args] = commandParts;
    }
  }

  return options;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.json) {
    options.streamOutput = false;
  }
  const result = await runHeadlessWrapper(options);
  if (options.dryRun || options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  if (!options.dryRun && result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
