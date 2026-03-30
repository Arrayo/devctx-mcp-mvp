# smart-context-mcp

MCP server that reduces AI agent token usage by 90% through intelligent context compression.

[![npm version](https://img.shields.io/npm/v/smart-context-mcp.svg)](https://www.npmjs.com/package/smart-context-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it is

An MCP (Model Context Protocol) server that provides specialized tools for reading, searching, and managing code context efficiently. Instead of loading full files or returning massive search results, it compresses information while preserving what matters for the task.

**Real metrics from production use:**
- 14.5M tokens → 1.6M tokens (89.87% reduction)
- 3,666 operations across development of this project
- Compression ratios: 3x to 46x depending on tool

## Why it exists

AI agents waste tokens in three ways:

1. **Reading full files** when they only need structure or specific functions
2. **Massive search results** with hundreds of irrelevant matches
3. **Repeating context** across conversation turns

This MCP solves all three by providing tools that return compressed, ranked, and cached context.

## How it works

This MCP exposes tools that AI agents can call. The agent decides when to use them based on:

- Your prompts and questions
- Agent rules generated during installation (`.cursor/rules`, `AGENTS.md`, etc.)
- The agent's own reasoning about what information it needs

**Important:** The MCP cannot force the agent to always use these tools. It provides better options, and the generated rules encourage their use, but the agent makes the final decision. Think of it as offering a faster, cheaper path that the agent will usually prefer.

## Core Tools

These are the essential tools you should understand first:

### smart_read

Read files in compressed modes instead of loading full content.

```javascript
// Outline mode: structure only (~90% savings)
{ filePath: 'src/server.js', mode: 'outline' }

// Signatures mode: exported API only
{ filePath: 'src/api.js', mode: 'signatures' }

// Symbol mode: extract specific function/class
{ filePath: 'src/auth.js', mode: 'symbol', symbol: 'validateToken' }
```

**Modes:** `outline`, `signatures`, `symbol`, `range`, `full`

**When to use:** Any time you need to understand file structure without reading everything.

---

### smart_search

Intent-aware code search with automatic ranking.

```javascript
// Debug intent: prioritizes errors, logs, exception handling
{ query: 'authentication error', intent: 'debug' }

// Implementation intent: prioritizes source files, changed files
{ query: 'UserModel', intent: 'implementation' }
```

**Intents:** `implementation`, `debug`, `tests`, `config`, `docs`, `explore`

**When to use:** Searching for code, errors, or patterns. Much better than grep.

---

### smart_context

One-call context builder: search + read + graph expansion.

```javascript
{
  task: 'Fix login authentication bug',
  detail: 'balanced'  // minimal | balanced | deep
}
```

Returns relevant files with compressed content, symbol details, and relationship graph.

**When to use:** Starting a new task and need comprehensive context.

---

### build_index

Build a symbol index for the project (functions, classes, imports).

```javascript
{ incremental: true }  // Only reindex changed files
```

**When to use:** Once after checkout, or after major changes. Improves search and context quality.

---

### smart_metrics

Inspect token savings and usage statistics.

```javascript
{ window: '24h' }  // or '7d', '30d', 'all'
```

**When to use:** Verify the MCP is working and see actual savings.

## Advanced Tools

These tools provide specialized capabilities for specific workflows:

### smart_summary

Maintain compressed session state across conversation turns.

```javascript
// Save state
{ action: 'update', update: { goal: '...', status: 'in_progress', nextStep: '...' }}

// Resume later
{ action: 'get' }
```

Compresses conversation context to ~100 tokens. Critical for long sessions.

---

### smart_turn

Orchestrate turn start/end with automatic context recovery.

```javascript
{ phase: 'start', prompt: '...' }  // Rehydrates context
{ phase: 'end', event: 'milestone', update: {...} }  // Saves checkpoint
```

Designed for CLI clients with native hooks (Claude Code).

---

### smart_read_batch

Read multiple files in one call.

```javascript
{
  files: [
    { path: 'src/a.js', mode: 'outline' },
    { path: 'src/b.js', mode: 'signatures' }
  ]
}
```

Reduces round-trip latency when you know you need several files.

---

### smart_shell

Safe diagnostic command execution (allowlisted commands only).

```javascript
{ command: 'git status' }
```

Blocks shell operators and unsafe commands by design.

---

### Diff-Aware Context

Analyze git changes intelligently (part of `smart_context`):

```javascript
{ task: 'Review changes', diff: 'main' }
```

Returns changed files prioritized by impact + related files (tests, importers).

---

### Context Prediction

Learn from usage patterns and predict needed files (part of `smart_context`):

```javascript
{ task: 'Implement authentication', prefetch: true }
```

After 3+ similar tasks: 40-60% fewer round-trips, 15-20% additional savings.

---

### warm_cache

Preload frequently accessed files into OS cache.

```javascript
{}  // No parameters
```

First query: 250ms → 50ms (5x faster cold start).

---

### git_blame

Function-level code attribution.

```javascript
// Who wrote each function?
{ mode: 'symbol', filePath: 'src/server.js' }

// Find code by author
{ mode: 'author', authorQuery: 'alice@example.com' }

// Recent changes
{ mode: 'recent', daysBack: 7 }
```

---

### cross_project

Share context across monorepos and microservices.

```javascript
// Search all related projects
{ mode: 'search', query: 'AuthService' }

// Find symbol across projects
{ mode: 'symbol', symbolName: 'validateToken' }
```

Requires `.devctx-projects.json` config file.

## Installation

```bash
npm install smart-context-mcp
npx smart-context-init --target .
```

Restart your AI client. Tools are immediately available.

## Client Setup

### Cursor

```bash
npx smart-context-init --target . --clients cursor
```

Restart Cursor. Tools appear in Agent mode.

### Codex CLI

```bash
npx smart-context-init --target . --clients codex
```

Codex reads `.codex/config.toml` on launch.

### Claude Code

```bash
npx smart-context-init --target . --clients claude
```

Claude Code reads `.mcp.json` and `.claude/settings.json` for native hooks.

### Qwen Code

```bash
npx smart-context-init --target . --clients qwen
```

Qwen Code reads `.qwen/settings.json`.

### All clients

```bash
npx smart-context-init --target .
```

Generates configs for all supported clients.

## Recommended Workflow

### Day 1: Core tools only

1. **Install and build index:**
   ```bash
   npm install smart-context-mcp
   npx smart-context-init --target .
   npm run build-index
   ```

2. **Use core tools:**
   - `smart_read` for file structure
   - `smart_search` for finding code
   - `smart_context` for comprehensive context
   - `smart_metrics` to verify savings

3. **Let the agent decide:** Don't force tool usage. The generated rules will guide the agent naturally.

### After 1 week: Add advanced tools

- `smart_summary` if you work on long tasks
- `smart_turn` if using Claude Code CLI
- `git_blame` for code attribution
- `cross_project` if working in monorepos

### After 1 month: Optimize

- Check `smart_metrics` for usage patterns
- Enable `warm_cache` if cold starts are slow
- Enable `prefetch` in `smart_context` for repetitive tasks

## Metrics & Verification

### Run full benchmark

```bash
npm run benchmark
```

Runs all verification suites:
- 421 unit tests
- 14 feature verifications
- Synthetic corpus evaluation
- Real project evaluation
- Production metrics report

Takes 2-3 minutes. See [Benchmark Documentation](./docs/verification/benchmark.md) for details.

### View production metrics

```bash
npm run report:metrics
```

Example output:

```
devctx metrics report

Entries:      3,696
Raw tokens:   14,492,131
Final tokens: 1,641,051
Saved tokens: 13,024,099 (89.87%)

By tool:
  smart_search   count=692  saved=5,817,485 (95.45%)
  smart_read     count=2108 saved=2,355,809 (70.52%)
  smart_summary  count=449  saved=1,897,628 (97.89%)
```

### Quick verification

```bash
npm run verify  # Feature verification (14 tools)
npm test        # Unit tests (421 tests)
npm run eval    # Synthetic corpus
npm run eval:self  # Real project
```

## Supported Languages

**First-class (AST parsing):** JavaScript, TypeScript, JSX, TSX

**Heuristic parsing:** Python, Go, Rust, Java, C#, Kotlin, PHP, Swift

**Structural extraction:** Shell, Terraform, HCL, Dockerfile, SQL, JSON, YAML, TOML

## Configuration

### Environment Variables

```bash
# Point to different project
export DEVCTX_PROJECT_ROOT=/path/to/project

# Disable cache warming
export DEVCTX_CACHE_WARMING=false

# Change warm file count
export DEVCTX_WARM_FILES=100
```

### Cross-Project Setup

Create `.devctx-projects.json`:

```json
{
  "version": "1.0",
  "projects": [
    { "name": "main-app", "path": ".", "type": "main" },
    { "name": "shared-lib", "path": "../shared-lib", "type": "library" },
    { "name": "api-service", "path": "../api-service", "type": "service" }
  ]
}
```

Build indexes for each project:

```bash
cd main-app && npx build-index
cd ../shared-lib && npx build-index
cd ../api-service && npx build-index
```

## Storage

All data stored in `.devctx/`:

- `index.json` - Symbol index
- `state.sqlite` - Sessions, metrics, patterns (Node 22+)
- `metrics.jsonl` - Legacy metrics (fallback for Node <22)

Add to `.gitignore`:

```
.devctx/
```

## Security

This MCP is **secure by default**:

- ✅ **Allowlist-only commands** - Only safe diagnostic commands (`ls`, `git status`, `npm test`, etc.)
- ✅ **No shell operators** - Blocks `|`, `&`, `;`, `>`, `<`, `` ` ``, `$()`
- ✅ **Path validation** - Cannot escape project root
- ✅ **No write access** - Cannot modify your code
- ✅ **Repository safety** - Prevents accidental commit of local state
- ✅ **Resource limits** - 15s timeout, 10MB buffer

**What `smart_shell` can run:**

```bash
# Allowed
git status              # ✓ Safe git read operations
npm test                # ✓ Safe package manager scripts
find . -name "*.js"     # ✓ File discovery
rg "pattern"            # ✓ Code search

# Blocked
git commit              # ✗ Write operations blocked
npm install pkg         # ✗ Package changes blocked
ls | grep secret        # ✗ Shell operators blocked
rm -rf /                # ✗ Dangerous commands blocked
```

**Configuration:**

```bash
# Disable shell execution entirely
export DEVCTX_SHELL_DISABLED=true

# Disable cache warming
export DEVCTX_CACHE_WARMING=false
```

**Complete security documentation:** [SECURITY.md](./SECURITY.md)

## Requirements

- **Node.js:** 18+ (22+ recommended for SQLite features)
- **Git:** For diff-aware context and git blame
- **ripgrep:** Included via `@vscode/ripgrep` (no system install needed)

## Performance Comparison

| Operation | Without MCP | With MCP | Savings |
|-----------|-------------|----------|---------|
| Read file | 4,000 tokens | 400 tokens | 90% |
| Search code | 10,000 tokens | 500 tokens | 95% |
| Session resume | 5,000 tokens | 100 tokens | 98% |
| Cold start | 250ms | 50ms | 5x faster |

## Documentation

### Features
- [Streaming Progress](./docs/features/streaming.md) - Real-time progress notifications
- [Context Prediction](./docs/features/context-prediction.md) - Intelligent file prediction
- [Diff-Aware Context](./docs/features/diff-aware.md) - Smart change analysis
- [Cache Warming](./docs/features/cache-warming.md) - Cold-start optimization
- [Git Blame](./docs/features/git-blame.md) - Code attribution
- [Cross-Project Context](./docs/features/cross-project.md) - Multi-project support

### Security
- [Security Policy](./SECURITY.md) - Security guarantees and threat model
- [Threat Model](./docs/security/threat-model.md) - Attack surface analysis
- [Security Configuration](./docs/security/configuration.md) - Hardening and profiles

### Verification
- [Benchmark](./docs/verification/benchmark.md) - Reproducible benchmark
- [E2E Test Report](./docs/verification/e2e-test-report.md) - Production usage analysis
- [Verification Report](./docs/verification/verification-report.md) - Feature verification

### Development
- [Architecture](./ARCHITECTURE.md) - Repository structure and development guide
- [Contributing](./CONTRIBUTING.md) - How to contribute
- [Changelog](./CHANGELOG.md) - Version history

## API Reference

### Core Tools

**smart_read**
```typescript
{
  filePath: string;
  mode?: 'outline' | 'signatures' | 'symbol' | 'range' | 'full';
  symbol?: string | string[];
  startLine?: number;
  endLine?: number;
  maxTokens?: number;
  context?: boolean;
}
```

**smart_search**
```typescript
{
  query: string;
  intent?: 'implementation' | 'debug' | 'tests' | 'config' | 'docs' | 'explore';
  cwd?: string;
  maxResults?: number;
}
```

**smart_context**
```typescript
{
  task: string;
  intent?: string;
  detail?: 'minimal' | 'balanced' | 'deep';
  maxTokens?: number;
  entryFile?: string;
  diff?: boolean | string;
  prefetch?: boolean;
  include?: string[];
}
```

**build_index**
```typescript
{
  incremental?: boolean;
  warmCache?: boolean;
}
```

**smart_metrics**
```typescript
{
  window?: '24h' | '7d' | '30d' | 'all';
  tool?: string;
  sessionId?: string;
}
```

### Advanced Tools

**smart_summary**
```typescript
{
  action: 'get' | 'update' | 'append' | 'checkpoint' | 'reset' | 'list_sessions';
  sessionId?: string;
  update?: {
    goal?: string;
    status?: 'planning' | 'in_progress' | 'blocked' | 'completed';
    nextStep?: string;
    completed?: string[];
    decisions?: string[];
  };
  maxTokens?: number;
}
```

**smart_turn**
```typescript
{
  phase: 'start' | 'end';
  prompt?: string;
  event?: string;
  update?: object;
}
```

**smart_read_batch**
```typescript
{
  files: Array<{
    path: string;
    mode?: string;
    symbol?: string;
  }>;
  maxTokens?: number;
}
```

**smart_shell**
```typescript
{
  command: string;
  cwd?: string;
}
```

**warm_cache**
```typescript
{}  // No parameters
```

**git_blame**
```typescript
{
  mode: 'symbol' | 'file' | 'author' | 'recent';
  filePath?: string;
  authorQuery?: string;
  limit?: number;
  daysBack?: number;
}
```

**cross_project**
```typescript
{
  mode: 'discover' | 'search' | 'read' | 'symbol' | 'deps' | 'stats';
  query?: string;
  symbolName?: string;
  maxResultsPerProject?: number;
}
```

## Changelog

### v1.1.0 (Latest)

- ✅ Cache warming (5x faster cold start)
- ✅ Symbol-level git blame
- ✅ Cross-project context
- ✅ Repository metadata updated
- 421 tests passing (100%)

### v1.0.4

- ✅ Streaming progress notifications
- ✅ Diff-aware context analysis
- ✅ Intelligent context prediction

See individual CHANGELOG files for detailed changes.

## Repository Structure

This repository contains the `smart-context-mcp` npm package in `tools/devctx/`:

```
/
├── tools/devctx/          ← Publishable package
│   ├── src/               ← Source code
│   ├── tests/             ← 421 unit tests
│   ├── scripts/           ← CLI binaries
│   └── package.json       ← Package metadata
├── docs/                  ← Documentation (GitHub only)
├── .github/workflows/     ← CI/CD
└── README.md              ← This file
```

**What gets published to npm:** Only `tools/devctx/` contents (src + scripts)

**Development:** All work happens in `tools/devctx/`

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup.

## Contributing

Pull requests welcome for:
- Additional language parsers
- Performance optimizations
- Bug fixes

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Author

**Francisco Caballero Portero**  
Email: fcp1978@hotmail.com  
GitHub: [@Arrayo](https://github.com/Arrayo)

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/Arrayo/smart-context-mcp)
- [npm Package](https://www.npmjs.com/package/smart-context-mcp)
- [Issue Tracker](https://github.com/Arrayo/smart-context-mcp/issues)
