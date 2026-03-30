#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFilePath);
const devctxDir = path.resolve(scriptsDir, '..');
const supportedClients = new Set(['cursor', 'codex', 'qwen', 'claude']);

const requireValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
};

const parseArgs = (argv) => {
  const options = {
    target: process.cwd(),
    name: 'devctx',
    command: process.execPath,
    args: null,
    clients: [...supportedClients],
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--target') {
      options.target = requireValue(argv, index, '--target');
      index += 1;
      continue;
    }

    if (token === '--name') {
      options.name = requireValue(argv, index, '--name');
      index += 1;
      continue;
    }

    if (token === '--command') {
      options.command = requireValue(argv, index, '--command');
      index += 1;
      continue;
    }

    if (token === '--args') {
      const raw = requireValue(argv, index, '--args');
      try {
        options.args = JSON.parse(raw);
      } catch {
        throw new Error('--args must be valid JSON');
      }
      if (!Array.isArray(options.args)) {
        throw new Error('--args must be a JSON array');
      }
      index += 1;
      continue;
    }

    if (token === '--clients') {
      options.clients = requireValue(argv, index, '--clients')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  const invalidClients = options.clients.filter((client) => !supportedClients.has(client));

  if (invalidClients.length > 0) {
    throw new Error(`Unsupported clients: ${invalidClients.join(', ')}`);
  }

  return options;
};

const normalizeCommandPath = (value) => {
  if (path.isAbsolute(value) || value.startsWith('./') || value.startsWith('../')) {
    return value;
  }

  return `./${value}`;
};

const readJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(`Invalid JSON in ${filePath}`);
  }
};

const writeFile = (filePath, content, dryRun) => {
  if (dryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`updated ${filePath}`);
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
      stdout: stdout.trim(),
    };
  } catch {
    return {
      ok: false,
      stdout: '',
    };
  }
};

const getServerConfig = ({ name, command, args, cwd }) => ({
  name,
  config: {
    command,
    args,
    env: {
      DEVCTX_PROJECT_ROOT: cwd,
    },
  },
});

const updateCursorConfig = (targetDir, serverConfig, dryRun) => {
  const filePath = path.join(targetDir, '.cursor', 'mcp.json');
  const current = readJson(filePath, { mcpServers: {} });
  current.mcpServers ??= {};
  const existing = current.mcpServers[serverConfig.name] || {};
  current.mcpServers[serverConfig.name] = {
    ...serverConfig.config,
    env: {
      ...existing.env,
      ...serverConfig.config.env,
    },
  };
  writeFile(filePath, `${JSON.stringify(current, null, 2)}\n`, dryRun);
};

const updateClaudeConfig = (targetDir, serverConfig, dryRun) => {
  const filePath = path.join(targetDir, '.mcp.json');
  const current = readJson(filePath, { mcpServers: {} });
  current.mcpServers ??= {};
  const existing = current.mcpServers[serverConfig.name] || {};
  current.mcpServers[serverConfig.name] = {
    ...serverConfig.config,
    env: {
      ...existing.env,
      ...serverConfig.config.env,
    },
  };
  writeFile(filePath, `${JSON.stringify(current, null, 2)}\n`, dryRun);
};

const buildClaudeHookCommand = (targetDir, eventName) => {
  const scriptPath = normalizeCommandPath(path.relative(targetDir, path.join(devctxDir, 'scripts', 'claude-hook.js')));
  return `"${process.execPath}" "${scriptPath}" --event ${eventName} --project-root "$CLAUDE_PROJECT_DIR"`;
};

const getClaudeHookMatcher = (eventName) => {
  if (eventName === 'SessionStart') {
    return 'startup|resume|clear|compact';
  }

  if (eventName === 'PostToolUse') {
    return 'Write|Edit|MultiEdit|mcp__.*__smart_turn|mcp__.*__smart_summary';
  }

  return '*';
};

const upsertClaudeHook = (settings, eventName, matcher, command) => {
  settings.hooks ??= {};
  settings.hooks[eventName] = Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [];

  const normalizedMatcher = matcher ?? '*';
  const existingGroup = settings.hooks[eventName].find((group) => (group.matcher ?? '*') === normalizedMatcher);

  if (existingGroup) {
    existingGroup.hooks = Array.isArray(existingGroup.hooks) ? existingGroup.hooks : [];
    const alreadyPresent = existingGroup.hooks.some((hook) => hook?.type === 'command' && hook?.command === command);
    if (!alreadyPresent) {
      existingGroup.hooks.push({ type: 'command', command });
    }
    return;
  }

  settings.hooks[eventName].push({
    matcher: normalizedMatcher,
    hooks: [{ type: 'command', command }],
  });
};

const updateClaudeHooksConfig = (targetDir, dryRun) => {
  const filePath = path.join(targetDir, '.claude', 'settings.json');
  const current = readJson(filePath, {});

  ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop'].forEach((eventName) => {
    upsertClaudeHook(
      current,
      eventName,
      getClaudeHookMatcher(eventName),
      buildClaudeHookCommand(targetDir, eventName),
    );
  });

  writeFile(filePath, `${JSON.stringify(current, null, 2)}\n`, dryRun);
};

const updateQwenConfig = (targetDir, serverConfig, dryRun) => {
  const filePath = path.join(targetDir, '.qwen', 'settings.json');
  const current = readJson(filePath, {});
  current.mcp ??= {};
  current.mcp.enabled = true;
  current.mcpServers ??= {};
  const existing = current.mcpServers[serverConfig.name] || {};
  current.mcpServers[serverConfig.name] = {
    ...serverConfig.config,
    env: {
      ...existing.env,
      ...serverConfig.config.env,
    },
  };
  writeFile(filePath, `${JSON.stringify(current, null, 2)}\n`, dryRun);
};

const buildCodexSection = (serverConfig) => {
  const header = `[mcp_servers.${serverConfig.name}]`;
  const body = [
    'enabled = true',
    'required = false',
    `command = ${JSON.stringify(serverConfig.config.command)}`,
    `args = [${serverConfig.config.args.map((value) => JSON.stringify(value)).join(', ')}]`,
  ];

  if (serverConfig.config.env && Object.keys(serverConfig.config.env).length > 0) {
    const envEntries = Object.entries(serverConfig.config.env)
      .map(([key, value]) => `  ${JSON.stringify(key)} = ${JSON.stringify(value)}`)
      .join(',\n');
    body.push(`env = {\n${envEntries}\n}`);
  }

  body.push('startup_timeout_sec = 15.0', 'tool_timeout_sec = 30.0');

  return { header, body };
};

const upsertTomlSection = (content, header, bodyLines) => {
  const lines = content.split('\n');
  const nextLines = [];
  let skipping = false;
  let found = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!skipping && trimmed === header) {
      found = true;
      skipping = true;
      continue;
    }

    if (skipping) {
      if (trimmed.startsWith('[') && trimmed !== header) {
        skipping = false;
        nextLines.push(line);
      }
      continue;
    }

    nextLines.push(line);
  }

  const preserved = nextLines.join('\n').trim();
  const section = [header, ...bodyLines].join('\n');

  if (!found && preserved.length === 0) {
    return `${section}\n`;
  }

  if (!found) {
    return `${preserved}\n\n${section}\n`;
  }

  if (preserved.length === 0) {
    return `${section}\n`;
  }

  return `${preserved}\n\n${section}\n`;
};

const upsertSentinelSection = (content, startMarker, endMarker, section) => {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + section + content.slice(endIdx + endMarker.length);
  }

  const trimmed = content.trimEnd();
  return trimmed.length === 0 ? `${section}\n` : `${trimmed}\n\n${section}\n`;
};

const updateCodexConfig = (targetDir, serverConfig, dryRun) => {
  const filePath = path.join(targetDir, '.codex', 'config.toml');
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const section = buildCodexSection(serverConfig);
  const nextContent = upsertTomlSection(current, section.header, section.body);
  writeFile(filePath, nextContent, dryRun);
};

const HOOK_SECTION_START = '# devctx:start';
const HOOK_SECTION_END = '# devctx:end';

const buildPreCommitHookSection = (targetDir) => {
  const scriptPath = normalizeCommandPath(path.relative(targetDir, path.join(devctxDir, 'scripts', 'check-repo-safety.js')));
  return `${HOOK_SECTION_START}
# Prevent committing project-local devctx state.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
"${process.execPath}" "${scriptPath}" --project-root "$repo_root"
status=$?
if [ "$status" -ne 0 ]; then
  echo "devctx: commit blocked by repo safety checks." >&2
  exit "$status"
fi
${HOOK_SECTION_END}`;
};

const updatePreCommitHook = (targetDir, dryRun) => {
  const hookPathResult = runGit(['rev-parse', '--git-path', 'hooks/pre-commit'], targetDir);
  if (!hookPathResult.ok || !hookPathResult.stdout) {
    console.log(`skipped git hook installation for ${targetDir} (not a git repository)`);
    return;
  }

  const filePath = path.resolve(targetDir, hookPathResult.stdout);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const nextBody = upsertSentinelSection(current, HOOK_SECTION_START, HOOK_SECTION_END, buildPreCommitHookSection(targetDir));
  const nextContent = nextBody.startsWith('#!') ? nextBody : `#!/bin/sh\n\n${nextBody}`;
  writeFile(filePath, nextContent, dryRun);

  if (!dryRun) {
    fs.chmodSync(filePath, 0o755);
  }
};

// ---------------------------------------------------------------------------
// Agent rules — instruct agents to prefer devctx tools over built-in ones
// ---------------------------------------------------------------------------

const agentRuleBody = `Prefer devctx MCP over built-ins for better token efficiency:
- smart_read(outline|signatures|symbol) instead of Read → 90% savings
- smart_search(intent=...) instead of Grep → ranked results
- smart_shell instead of Shell → safe diagnostics
- smart_context instead of multiple reads → one-call builder

Context recovery:
- Start: smart_turn(start, userPrompt, ensureSession=true)
- End: smart_turn(end, event=milestone|blocker|task_complete)
- If ambiguous_resume: smart_summary(sessionId='auto')

Reading strategy (cascade):
1. outline - structure only (~90% savings)
2. signatures - exported API
3. symbol - specific function
4. range - specific lines
5. full - last resort

Search strategy:
- Always pass intent: debug|implementation|tests|config|explore
- debug → errors, logs, exceptions
- implementation → source files, changed files
- tests → test files

By task:
- Debugging: smart_turn(start) → smart_search(intent=debug) → smart_read(symbol) → smart_shell('npm test') → fix → smart_turn(end)
- Code Review: smart_turn(start) → smart_context(diff=true) → smart_read(signatures) → review → smart_turn(end)
- Refactoring: smart_turn(start) → smart_context(entryFile) → smart_read(signatures) → refactor → smart_shell('npm test') → smart_turn(end)
- Testing: smart_turn(start) → smart_search(intent=tests) → smart_read(symbol) → write test → smart_shell('npm test') → smart_turn(end)
- Architecture: smart_turn(start) → smart_context(detail=minimal) → smart_read(signatures) → analyze → smart_turn(end)

Repository safety:
- Check repoSafety in responses
- If .devctx/state.sqlite is tracked/staged, fix git hygiene first

Important: These are suggestions, not guarantees. You decide when to use devctx tools based on the task.`;

const cursorRuleContent = `---
description: Prefer devctx MCP tools for file reading, code search, and diagnostics
alwaysApply: true
---

${agentRuleBody}
`;

const updateCursorRule = (targetDir, dryRun) => {
  const filePath = path.join(targetDir, '.cursor', 'rules', 'devctx.mdc');
  writeFile(filePath, cursorRuleContent, dryRun);
};

const SECTION_START = '<!-- devctx:start -->';
const SECTION_END = '<!-- devctx:end -->';

const markdownSection = `${SECTION_START}
## devctx

${agentRuleBody}
${SECTION_END}`;

const upsertMarkdownSection = (content) => {
  const startIdx = content.indexOf(SECTION_START);
  const endIdx = content.indexOf(SECTION_END);

  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + markdownSection + content.slice(endIdx + SECTION_END.length);
  }

  const trimmed = content.trimEnd();
  return trimmed.length === 0 ? `${markdownSection}\n` : `${trimmed}\n\n${markdownSection}\n`;
};

const updateAgentsMd = (targetDir, dryRun) => {
  const filePath = path.join(targetDir, 'AGENTS.md');
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  writeFile(filePath, upsertMarkdownSection(current), dryRun);
};

const updateClaudeMd = (targetDir, dryRun) => {
  const filePath = path.join(targetDir, 'CLAUDE.md');
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  writeFile(filePath, upsertMarkdownSection(current), dryRun);
};

const hasGitignoreEntry = (content, entry) => {
  const target = entry.replace(/\/+$/, '');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\/+$/, ''))
    .includes(target);
};

const ensureGitignoreEntry = (targetDir, dryRun) => {
  const filePath = path.join(targetDir, '.gitignore');
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

  if (hasGitignoreEntry(current, '.devctx/')) return;

  const trimmed = current.trimEnd();
  const next = trimmed.length === 0 ? '.devctx/\n' : `${trimmed}\n\n.devctx/\n`;
  writeFile(filePath, next, dryRun);
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(options.target);
  const defaultArgs = [normalizeCommandPath(path.relative(targetDir, path.join(devctxDir, 'src', 'mcp-server.js')))];
  const args = options.args ?? defaultArgs;
  const serverConfig = getServerConfig({
    name: options.name,
    command: options.command,
    args,
    cwd: targetDir,
  });

  const clientSet = new Set(options.clients);
  ensureGitignoreEntry(targetDir, options.dryRun);
  updatePreCommitHook(targetDir, options.dryRun);

  if (clientSet.has('cursor')) {
    updateCursorConfig(targetDir, serverConfig, options.dryRun);
    updateCursorRule(targetDir, options.dryRun);
  }

  if (clientSet.has('codex')) {
    updateCodexConfig(targetDir, serverConfig, options.dryRun);
    updateAgentsMd(targetDir, options.dryRun);
  }

  if (clientSet.has('qwen')) {
    updateQwenConfig(targetDir, serverConfig, options.dryRun);
  }

  if (clientSet.has('claude')) {
    updateClaudeConfig(targetDir, serverConfig, options.dryRun);
    updateClaudeHooksConfig(targetDir, options.dryRun);
    updateClaudeMd(targetDir, options.dryRun);
  }

  console.log(`configured clients: ${[...clientSet].join(', ')}`);
  console.log(`target: ${targetDir}`);
  console.log(`command: ${serverConfig.config.command} ${serverConfig.config.args.join(' ')}`);
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
