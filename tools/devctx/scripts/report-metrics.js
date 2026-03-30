#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smartMetrics } from '../src/tools/smart-metrics.js';
import { formatAdoptionReport } from '../src/analytics/adoption.js';

const requireValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
};

export const parseArgs = (argv) => {
  const options = {
    file: null,
    json: false,
    tool: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--file') {
      options.file = path.resolve(requireValue(argv, index, '--file'));
      index += 1;
      continue;
    }

    if (token === '--tool') {
      options.tool = requireValue(argv, index, '--tool');
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

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);

export const createReport = async (options) => {
  const result = await smartMetrics({
    file: options.file,
    tool: options.tool,
    window: 'all',
    latest: 100,
  });
  return {
    filePath: result.filePath,
    source: result.source,
    toolFilter: options.tool,
    invalidLines: result.invalidLines,
    summary: result.summary,
  };
};

const printHuman = (report) => {
  console.log('');
  console.log('devctx metrics report');
  console.log('');
  console.log(`File:         ${report.filePath}`);
  console.log(`Source:       ${report.source}`);
  console.log(`Entries:      ${formatNumber(report.summary.count)}`);
  console.log(`Raw tokens:   ${formatNumber(report.summary.rawTokens)}`);
  console.log(`Final tokens: ${formatNumber(report.summary.compressedTokens)}`);
  console.log(`Saved tokens: ${formatNumber(report.summary.savedTokens)} (${report.summary.savingsPct}%)`);
  if (report.invalidLines.length > 0) {
    console.log(`Invalid JSONL: ${report.invalidLines.join(', ')}`);
  }
  console.log('');
  console.log('By tool:');

  if (report.summary.tools.length === 0) {
    console.log('  no entries');
    return;
  }

  for (const tool of report.summary.tools) {
    console.log(
      `  ${tool.tool.padEnd(14)} count=${formatNumber(tool.count)} raw=${formatNumber(tool.rawTokens)} final=${formatNumber(tool.compressedTokens)} saved=${formatNumber(tool.savedTokens)} (${tool.savingsPct}%)`
    );
  }
  
  if (report.adoption) {
    console.log(formatAdoptionReport(report.adoption));
  }
};

export const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const report = await createReport(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  printHuman(report);
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
