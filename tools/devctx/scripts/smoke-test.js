import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertContains, createRecorder, emitJson, formatError, parseToolJson } from './lib/smoke-helpers.js';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFilePath);
const devctxDir = path.resolve(scriptsDir, '..');
const defaultProjectRoot = path.resolve(devctxDir, '..', '..');
const expectedToolNames = new Set(['smart_read', 'smart_search', 'smart_shell']);

const parseArgs = (argv) => {
  const options = {
    jsonMode: false,
    projectRoot: defaultProjectRoot,
    readFile: 'tools/devctx/src/tools/smart-read.js',
    readMode: 'signatures',
    readExpect: 'smartRead',
    searchQuery: 'smartShell',
    searchCwd: 'tools/devctx/src',
    searchExpect: 'smartShell',
    allowedCommand: 'pwd',
    blockedCommand: 'git commit -m test',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--json') {
      options.jsonMode = true;
      continue;
    }

    const optionMap = {
      '--project-root': 'projectRoot',
      '--read-file': 'readFile',
      '--read-mode': 'readMode',
      '--read-expect': 'readExpect',
      '--search-query': 'searchQuery',
      '--search-cwd': 'searchCwd',
      '--search-expect': 'searchExpect',
      '--allowed-command': 'allowedCommand',
      '--blocked-command': 'blockedCommand',
    };

    if (optionMap[token]) {
      options[optionMap[token]] = token === '--project-root' ? path.resolve(argv[index + 1]) : argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
};

const printStep = (jsonMode, message) => {
  if (!jsonMode) {
    console.log(`- ${message}`);
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const recorder = createRecorder();
  const startedAt = new Date().toISOString();
  const stderrChunks = [];
  const client = new Client({ name: 'devctx-smoke-test', version: '0.1.0' });

  client.onerror = (error) => {
    stderrChunks.push(`Client error: ${error instanceof Error ? error.message : String(error)}`);
  };

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./scripts/devctx-server.js', '--project-root', options.projectRoot],
    cwd: devctxDir,
    stderr: 'pipe',
  });

  if (transport.stderr) {
    transport.stderr.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
    });
  }

  await client.connect(transport);

  try {
    printStep(options.jsonMode, 'Listing tools');
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((tool) => tool.name).sort();
    const availableTools = new Set(toolNames);

    for (const toolName of expectedToolNames) {
      assert.ok(availableTools.has(toolName), `Missing tool: ${toolName}`);
    }

    recorder.record('list_tools', { toolNames });

    printStep(options.jsonMode, 'Checking smart_read against target project');
    const smartReadResult = parseToolJson(await client.callTool({
      name: 'smart_read',
      arguments: { filePath: options.readFile, mode: options.readMode },
    }));

    assert.equal(smartReadResult.mode, options.readMode);
    assertContains(smartReadResult.content, options.readExpect, 'smart_read content');
    assert.ok(smartReadResult.metrics.rawTokens >= smartReadResult.metrics.compressedTokens);

    recorder.record('smart_read', {
      filePath: smartReadResult.filePath,
      mode: smartReadResult.mode,
      preview: smartReadResult.content.slice(0, 160),
      rawTokens: smartReadResult.metrics.rawTokens,
      compressedTokens: smartReadResult.metrics.compressedTokens,
    });

    printStep(options.jsonMode, 'Checking smart_search against target project');
    const smartSearchResult = parseToolJson(await client.callTool({
      name: 'smart_search',
      arguments: { query: options.searchQuery, cwd: options.searchCwd },
    }));

    assert.ok(['rg', 'walk'].includes(smartSearchResult.engine), `Unexpected engine: ${smartSearchResult.engine}`);
    assert.ok(smartSearchResult.totalMatches >= 1, 'smart_search returned no matches');
    assertContains(smartSearchResult.matches, options.searchExpect ?? options.searchQuery, 'smart_search matches');

    recorder.record('smart_search', {
      engine: smartSearchResult.engine,
      totalMatches: smartSearchResult.totalMatches,
      preview: smartSearchResult.matches.split('\n').slice(0, 3),
    });

    printStep(options.jsonMode, 'Checking smart_shell safe execution');
    const smartShellAllowedResult = parseToolJson(await client.callTool({
      name: 'smart_shell',
      arguments: { command: options.allowedCommand },
    }));

    assert.equal(smartShellAllowedResult.blocked, false);
    assert.equal(smartShellAllowedResult.exitCode, 0);
    assert.equal(smartShellAllowedResult.output.trim(), options.projectRoot);

    recorder.record('smart_shell_allowed', {
      command: options.allowedCommand,
      exitCode: smartShellAllowedResult.exitCode,
      output: smartShellAllowedResult.output.trim(),
    });

    printStep(options.jsonMode, 'Checking smart_shell blocking rules');
    const smartShellBlockedResult = parseToolJson(await client.callTool({
      name: 'smart_shell',
      arguments: { command: options.blockedCommand },
    }));

    assert.equal(smartShellBlockedResult.blocked, true);
    assert.equal(smartShellBlockedResult.exitCode, 126);
    assert.match(smartShellBlockedResult.output, /not allowed/i);

    recorder.record('smart_shell_blocked', {
      command: options.blockedCommand,
      exitCode: smartShellBlockedResult.exitCode,
      output: smartShellBlockedResult.output,
    });

    if (options.jsonMode) {
      emitJson({ ok: true, startedAt, finishedAt: new Date().toISOString(), projectRoot: options.projectRoot, checks: recorder.checks });
    } else {
      console.log('\nSmoke test passed');
    }
  } catch (error) {
    const message = formatError(error, stderrChunks.join(''));

    if (options.jsonMode) {
      emitJson({ ok: false, startedAt, finishedAt: new Date().toISOString(), projectRoot: options.projectRoot, checks: recorder.checks, error: message });
    } else {
      console.error('\nSmoke test failed');
      console.error(message);
    }

    process.exitCode = 1;
  } finally {
    await transport.close();
  }
};

await main();
