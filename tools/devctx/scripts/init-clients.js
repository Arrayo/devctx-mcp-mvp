#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_CONTRACT_RULE_LINES } from '../src/client-contract.js';

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

const buildCursorAssistedLauncher = (targetDir) => {
  const runnerScript = normalizeCommandPath(path.relative(targetDir, path.join(devctxDir, 'scripts', 'task-runner.js')));
  return `#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
project_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"

export DEVCTX_PROJECT_ROOT="$project_root"

if [ "$#" -gt 0 ] && [ "\${1#-}" = "$1" ]; then
  subcommand="$1"
  shift
  exec "${process.execPath}" "$project_root/${runnerScript}" "$subcommand" --client cursor "$@"
fi

exec "${process.execPath}" "$project_root/${runnerScript}" task --client cursor "$@"
`;
};

const updateCursorAssistedLauncher = (targetDir, dryRun) => {
  const filePath = path.join(targetDir, '.devctx', 'bin', 'cursor-devctx');
  writeFile(filePath, buildCursorAssistedLauncher(targetDir), dryRun);

  if (!dryRun) {
    fs.chmodSync(filePath, 0o755);
  }
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

const buildPreCommitHookSection = () => {
  return `${HOOK_SECTION_START}
# Prevent committing project-local devctx state.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
node "$(npm root -g)/smart-context-mcp/scripts/check-repo-safety.js" --project-root "$repo_root" 2>/dev/null || true
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
  const nextBody = upsertSentinelSection(current, HOOK_SECTION_START, HOOK_SECTION_END, buildPreCommitHookSection());
  const nextContent = nextBody.startsWith('#!') ? nextBody : `#!/bin/sh\n\n${nextBody}`;
  writeFile(filePath, nextContent, dryRun);

  if (!dryRun) {
    fs.chmodSync(filePath, 0o755);
  }
};

// ---------------------------------------------------------------------------
// Agent rules — instruct agents to prefer devctx tools over built-in ones
// ---------------------------------------------------------------------------

const agentRuleBody = `**First time in project?** Run build_index(incremental=true) to enable search/context quality.

Prefer devctx MCP for non-trivial tasks:
- smart_turn(start, userPrompt, ensureSession=true) before multi-step work
- smart_context(...) or smart_search(intent=...) to build context cheaply
- smart_read(outline|signatures|symbol) before full reads
- smart_shell instead of Shell for safe diagnostics
- smart_turn(end, event=milestone) after meaningful progress

Tool substitution rules (use devctx INSTEAD of native tools):
- smart_search OVER Grep/SemanticSearch for any codebase exploration or "how does X work" queries
- smart_read/smart_read_batch OVER Read when reading multiple files or large files (>200 lines) for context
- smart_shell OVER Shell for build/test/lint/git checks
- smart_turn(end, event=milestone) after EVERY significant code change, not just at session end

If devctx MCP is installed and enabled, default to devctx on every non-trivial multi-file or multi-step task. Skip it only for genuinely trivial work, and then state why it was skipped.

Client contract:
- ${CLIENT_CONTRACT_RULE_LINES.join('\n- ')}

Cursor assisted mode:
- For long or continuity-sensitive tasks, prefer the local launcher \`./.devctx/bin/cursor-devctx\`
- Usage: \`./.devctx/bin/cursor-devctx task --prompt "your task" -- <agent-command> [args...]\`
- Specialized flows: \`review\`, \`debug\`, \`refactor\`, \`test\`, \`doctor\`, \`status\`, \`checkpoint\`, \`cleanup\`
- This launcher wraps the prompt with smart_turn(start/end) orchestration and the shared operational contract

Reading cascade: outline → signatures → symbol → full (last resort)

Detailed workflows: .cursor/rules/profiles-compact/ (debugging, code-review, refactoring, testing, architecture)

---

If you didn't use devctx tools in a non-trivial programming task, add at the end:

**Note:** devctx not used because: [task too simple | MCP unavailable | index not built | already had sufficient context | native tool more direct for this case]. To use devctx next time: "Use smart-context-mcp: smart_turn(start, userPrompt, ensureSession=true) → smart_context/smart_search → smart_read → smart_turn(end, event=milestone)"`;

const cursorRuleContent = `---
description: Prefer devctx MCP tools for non-trivial tasks
alwaysApply: true
---

${agentRuleBody}
`;

const cursorProfilesNote = `
# Task-Specific Profiles

For detailed workflows, see rules in this directory:
- debugging.mdc - Error-first, symbol-focused (90% savings)
- code-review.mdc - Diff-aware, API-focused (87% savings)
- refactoring.mdc - Graph-aware, test-verified (89% savings)
- testing.mdc - Coverage-aware, TDD-friendly (90% savings)
- architecture.mdc - Index-first, minimal-detail (90% savings)

These profiles are **conditionally applied** based on file globs and task context.
The base rule (devctx.mdc) is **always active** but kept minimal to reduce fixed context cost.
`;

const updateCursorRule = (targetDir, dryRun) => {
  const rulesDir = path.join(targetDir, '.cursor', 'rules');
  const profilesDir = path.join(rulesDir, 'profiles-compact');
  
  const baseFilePath = path.join(rulesDir, 'devctx.mdc');
  writeFile(baseFilePath, cursorRuleContent, dryRun);

  const profilesReadmePath = path.join(profilesDir, 'README.md');
  writeFile(profilesReadmePath, cursorProfilesNote, dryRun);
  
  // Copy compact profiles from package
  const sourceProfilesDir = path.join(devctxDir, 'agent-rules', 'profiles-compact');
  if (fs.existsSync(sourceProfilesDir)) {
    const profiles = fs.readdirSync(sourceProfilesDir).filter(f => f.endsWith('.mdc'));
    profiles.forEach(profile => {
      const sourcePath = path.join(sourceProfilesDir, profile);
      const targetPath = path.join(profilesDir, profile);
      const content = fs.readFileSync(sourcePath, 'utf8');
      writeFile(targetPath, content, dryRun);
    });
  }
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
    updateCursorAssistedLauncher(targetDir, options.dryRun);
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
