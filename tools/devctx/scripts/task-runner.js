#!/usr/bin/env node
import { runTaskRunner } from '../src/task-runner.js';
import { checkNodeVersion } from '../src/utils/runtime-check.js';

const runtimeCheck = checkNodeVersion();
if (!runtimeCheck.ok) {
  console.error(`[smart-context-task] Runtime check failed: ${runtimeCheck.message}`);
  console.error(`[smart-context-task] Current: ${runtimeCheck.current}, Required: ${runtimeCheck.minimum}+`);
  process.exit(1);
}

const requireValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value === '--') {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
};

const parseListValue = (raw) =>
  raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const parseArgs = (argv) => {
  const subcommand = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'task';
  const rest = argv[0] && !argv[0].startsWith('--') ? argv.slice(1) : argv;
  const options = {
    commandName: subcommand,
    client: 'generic',
    prompt: '',
    sessionId: undefined,
    event: undefined,
    stdinPrompt: false,
    dryRun: false,
    json: false,
    streamOutput: true,
    allowDegraded: false,
    verifyIntegrity: true,
    format: 'compact',
    maxItems: 10,
    cleanupMode: 'compact',
    apply: false,
    retentionDays: 30,
    keepLatestEventsPerSession: 20,
    keepLatestMetrics: 1000,
    vacuum: false,
    command: '',
    args: [],
    update: {},
  };

  const listFields = new Map([
    ['--completed', 'completed'],
    ['--decisions', 'decisions'],
    ['--blockers', 'blockers'],
    ['--touched-files', 'touchedFiles'],
    ['--pinned-context', 'pinnedContext'],
    ['--unresolved-questions', 'unresolvedQuestions'],
  ]);

  let commandIndex = rest.indexOf('--');
  const head = commandIndex === -1 ? rest : rest.slice(0, commandIndex);

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

    if (token === '--allow-degraded') {
      options.allowDegraded = true;
      continue;
    }

    if (token === '--no-integrity') {
      options.verifyIntegrity = false;
      continue;
    }

    if (token === '--format') {
      options.format = requireValue(head, index, '--format');
      index += 1;
      continue;
    }

    if (token === '--max-items') {
      options.maxItems = Number(requireValue(head, index, '--max-items'));
      index += 1;
      continue;
    }

    if (token === '--cleanup-mode') {
      options.cleanupMode = requireValue(head, index, '--cleanup-mode');
      index += 1;
      continue;
    }

    if (token === '--apply') {
      options.apply = true;
      continue;
    }

    if (token === '--retention-days') {
      options.retentionDays = Number(requireValue(head, index, '--retention-days'));
      index += 1;
      continue;
    }

    if (token === '--keep-latest-events') {
      options.keepLatestEventsPerSession = Number(requireValue(head, index, '--keep-latest-events'));
      index += 1;
      continue;
    }

    if (token === '--keep-latest-metrics') {
      options.keepLatestMetrics = Number(requireValue(head, index, '--keep-latest-metrics'));
      index += 1;
      continue;
    }

    if (token === '--vacuum') {
      options.vacuum = true;
      continue;
    }

    if (token === '--goal') {
      options.update.goal = requireValue(head, index, '--goal');
      index += 1;
      continue;
    }

    if (token === '--status') {
      options.update.status = requireValue(head, index, '--status');
      index += 1;
      continue;
    }

    if (token === '--current-focus') {
      options.update.currentFocus = requireValue(head, index, '--current-focus');
      index += 1;
      continue;
    }

    if (token === '--why-blocked') {
      options.update.whyBlocked = requireValue(head, index, '--why-blocked');
      index += 1;
      continue;
    }

    if (token === '--next-step') {
      options.update.nextStep = requireValue(head, index, '--next-step');
      index += 1;
      continue;
    }

    if (listFields.has(token)) {
      const field = listFields.get(token);
      options.update[field] = parseListValue(requireValue(head, index, token));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (commandIndex !== -1) {
    const commandParts = rest.slice(commandIndex + 1);
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

  const result = await runTaskRunner(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result?.blocked) {
    process.exitCode = 2;
    return;
  }

  if (typeof result?.exitCode === 'number' && result.exitCode !== 0) {
    process.exitCode = result.exitCode;
    return;
  }

  if (result?.overall === 'error') {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
