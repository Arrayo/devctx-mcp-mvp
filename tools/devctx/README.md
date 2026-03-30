# smart-context-mcp

MCP server that reduces AI agent token usage by 90% with intelligent context compression.

[![npm version](https://badge.fury.io/js/smart-context-mcp.svg)](https://www.npmjs.com/package/smart-context-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

### Cursor
```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients cursor
```
Restart Cursor. Done.

### Codex CLI
```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients codex
```
Restart Codex. Done.

### Claude Desktop
```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients claude
```
Restart Claude Desktop. Done.

### Qwen Code
```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients qwen
```
Restart Qwen Code. Done.

### All Clients
```bash
npm install -g smart-context-mcp
npx smart-context-init --target .
```
Restart your AI client. Done.

## How it Works in Practice

**The reality:** This MCP does not intercept prompts automatically. Here's the actual flow:

1. **You:** "Fix the login bug"
2. **Agent reads rules:** Sees debugging workflow
3. **Agent decides:** Uses `smart_search(intent=debug)`
4. **MCP returns:** Ranked results (errors prioritized)
5. **Agent continues:** Calls `smart_read(symbol)` for function
6. **Agent fixes:** Makes changes
7. **Agent verifies:** Calls `smart_shell('npm test')`
8. **Agent checkpoints:** Calls `smart_turn(end)`

**Key points:**
- ✅ Agent **chooses** to use devctx tools (not forced)
- ✅ Rules **guide** the agent (not enforce)
- ✅ Agent can use built-in tools when appropriate
- ✅ Token savings: 85-90% on complex tasks

Check actual usage:
- **Real-time feedback** - See usage immediately (enable with `export DEVCTX_SHOW_USAGE=true`)
- `npm run report:metrics` - Tool-level savings + adoption analysis
- `npm run report:workflows` - Workflow-level savings (requires `DEVCTX_WORKFLOW_TRACKING=true`)

## What it does

Provides **two key components**:

### 1. Specialized Tools (12 tools)

| Tool | Purpose | Savings |
|------|---------|---------|
| `smart_read` | Read files in outline/signatures mode | 90% |
| `smart_read_batch` | Read multiple files in one call | 90% |
| `smart_search` | Intent-aware code search with ranking | 95% |
| `smart_context` | One-call context builder | 85% |
| `smart_summary` | Task checkpoint management | 98% |
| `smart_turn` | Task recovery orchestration | - |
| `smart_metrics` | Token usage inspection | - |
| `smart_shell` | Safe command execution | 94% |
| `build_index` | Symbol index builder | - |
| `warm_cache` | File preloading (5x faster cold start) | - |
| `git_blame` | Function-level code attribution | - |
| `cross_project` | Multi-project context | - |

### 2. Agent Rules (Task-Specific Guidance)

Installation generates rules that teach agents optimal workflows:

**Debugging:** `smart_search(intent=debug)` → `smart_read(symbol)` → fix (90% savings)  
**Code Review:** `smart_context(diff=true)` → `smart_read(signatures)` → review (87% savings)  
**Refactoring:** `smart_context(entryFile)` → `smart_read(signatures)` → refactor (89% savings)  
**Testing:** `smart_search(intent=tests)` → `smart_read(symbol)` → write test (90% savings)  
**Architecture:** `smart_context(detail=minimal)` → `smart_read(signatures)` → analyze (90% savings)

**Key insight:** The value isn't just in the tools—it's in teaching agents **when** and **how** to use them.

## Real Metrics

Production usage: **14.5M tokens → 1.6M tokens** (89.87% reduction)

## Verify It's Working

### Real-Time Feedback (Auto-enabled for First 10 Calls)

Feedback is **automatically enabled** for your first 10 tool calls (onboarding mode), then auto-disables.

**To keep it enabled permanently:**
```bash
export DEVCTX_SHOW_USAGE=true
```

**To disable immediately:**
```bash
export DEVCTX_SHOW_USAGE=false
```

You'll see at the end of agent responses:

```markdown
---

📊 **devctx usage this session:**
- **smart_read**: 3 calls | ~45.0K tokens saved (file1.js, file2.js, file3.js)
- **smart_search**: 1 call | ~12.0K tokens saved (query)

**Total saved:** ~57.0K tokens

*Onboarding mode: showing for 3 more tool calls. To keep: `export DEVCTX_SHOW_USAGE=true`*
```

**Why this is useful:**
- ✅ Verify agent is following rules
- ✅ See token savings in real-time
- ✅ Debug adoption issues instantly
- ✅ Validate forcing prompts worked

### Historical Metrics

```bash
npm run report:metrics
```

Shows adoption analysis + token savings over time.

### Decision Explanations (Optional)

Understand **why** the agent chose devctx tools:

```bash
export DEVCTX_EXPLAIN=true
```

You'll see explanations like:

```markdown
🤖 **Decision explanations:**

**smart_read** (read server.js (outline mode))
- **Why:** File is large (2500 lines), outline mode extracts structure only
- **Instead of:** Read (full file)
- **Expected benefit:** ~45.0K tokens saved

**smart_search** (search "bug" (intent: debug))
- **Why:** Intent-aware search prioritizes relevant results
- **Expected benefit:** Better result ranking
```

**When to use:**
- Learning how devctx works
- Debugging tool selection
- Understanding best practices

### Missed Opportunities Detection (Optional)

Detect when devctx **should have been used but wasn't**:

```bash
export DEVCTX_DETECT_MISSED=true
```

You'll see warnings like:

```markdown
⚠️ **Missed devctx opportunities detected:**

**Session stats:**
- devctx operations: 2
- Estimated total: 25
- Adoption: 8%

🟡 **low devctx adoption**
- **Issue:** Low adoption (8%). Target: >50%
- **Potential savings:** ~184.0K tokens
```

**Detects:**
- No devctx usage in long sessions
- Low adoption (<30%)
- Usage dropped mid-session

**Combine all features:**

```bash
export DEVCTX_SHOW_USAGE=true    # See what's used
export DEVCTX_EXPLAIN=true       # Understand why
export DEVCTX_DETECT_MISSED=true # Detect gaps
```

## Core Tools

### smart_read

Read files without full content:

```javascript
// Outline mode: structure only (~400 tokens vs 4000)
{ filePath: 'src/server.js', mode: 'outline' }

// Extract specific function
{ filePath: 'src/auth.js', mode: 'symbol', symbol: 'validateToken' }
```

**Modes**: `outline`, `signatures`, `symbol`, `range`, `full`

### smart_search

Intent-aware search with ranking:

```javascript
{ query: 'authentication', intent: 'debug' }  // Prioritizes errors, logs
{ query: 'UserModel', intent: 'implementation' }  // Prioritizes source
```

**Intents**: `implementation`, `debug`, `tests`, `config`, `docs`, `explore`

### smart_context

Get everything for a task in one call:

```javascript
{
  task: 'Fix authentication bug',
  detail: 'balanced',  // minimal | balanced | deep
  maxTokens: 8000
}
```

Returns: relevant files + compressed content + symbol details + graph relationships

### smart_summary

Maintain task checkpoint:

```javascript
// Save checkpoint
{ action: 'update', update: { goal: 'Implement OAuth', status: 'in_progress', nextStep: '...' }}

// Resume task
{ action: 'get' }
```

Stores compressed task state (~100 tokens: goal, status, decisions, blockers), not full conversation.

## New Features

### Diff-Aware Context

Analyze git changes intelligently:

```javascript
{ task: 'Review changes', diff: 'main' }
```

Returns changed files prioritized by impact + related files (importers, tests).

### Context Prediction

Learn from usage and predict needed files:

```javascript
{ task: 'Implement auth', prefetch: true }
```

After 3+ similar tasks: 40-60% fewer round-trips, 15-20% additional savings.

### Cache Warming

Eliminate cold-start latency:

```javascript
{ incremental: true, warmCache: true }
```

First query: 250ms → 50ms (5x faster).

### Git Blame

Function-level attribution:

```javascript
// Who wrote each function?
{ mode: 'symbol', filePath: 'src/server.js' }

// Find code by author
{ mode: 'author', authorQuery: 'alice@example.com' }

// Recent changes
{ mode: 'recent', daysBack: 7 }
```

### Cross-Project Context

Work across monorepos:

```javascript
// Search all projects
{ mode: 'search', query: 'AuthService' }

// Find symbol across projects
{ mode: 'symbol', symbolName: 'validateToken' }
```

Requires `.devctx-projects.json` config.

## Supported Languages

**AST parsing**: JavaScript, TypeScript, JSX, TSX

**Heuristic**: Python, Go, Rust, Java, C#, Kotlin, PHP, Swift

**Structural**: Shell, Terraform, HCL, Dockerfile, SQL, JSON, YAML, TOML

## Client Support

- Cursor (`.cursor/mcp.json`)
- Codex CLI (`.codex/config.toml`)
- Claude Code (`.mcp.json` + `.claude/settings.json`)
- Qwen Code (`.qwen/settings.json`)

## Commands

```bash
# Start server
smart-context-server

# Against another repo
smart-context-server --project-root /path/to/repo

# Generate configs
smart-context-init --target /path/to/project

# View metrics
smart-context-report

# Verify features
npm run verify
```

## Storage

Data stored in `.devctx/`:
- `index.json` - Symbol index
- `state.sqlite` - Task checkpoints, metrics, patterns (Node 22+)
- `metrics.jsonl` - Legacy fallback (Node 18-20)

Add to `.gitignore`:
```
.devctx/
```

## Requirements

- Node.js 18+ (22+ for SQLite features)
- Git (for diff and blame features)

## Security

This MCP is **secure by default**:

- ✅ **Allowlist-only commands** - Only safe diagnostic commands (`ls`, `git status`, `npm test`, etc.)
- ✅ **No shell operators** - Blocks `|`, `&`, `;`, `>`, `<`, `` ` ``, `$()`
- ✅ **Path validation** - Cannot escape project root
- ✅ **No write access** - Cannot modify your code
- ✅ **Repository safety** - Prevents accidental commit of local state
- ✅ **Resource limits** - 15s timeout, 10MB buffer

**Configuration:**

```bash
# Disable shell execution entirely
export DEVCTX_SHELL_DISABLED=true

# Disable cache warming
export DEVCTX_CACHE_WARMING=false
```

See [SECURITY.md](https://github.com/Arrayo/smart-context-mcp/blob/main/SECURITY.md) for complete security documentation.

## Documentation

Full documentation in [GitHub repository](https://github.com/Arrayo/smart-context-mcp):

- [Streaming Progress](https://github.com/Arrayo/smart-context-mcp/blob/main/docs/features/streaming.md) - Progress notifications
- [Context Prediction](https://github.com/Arrayo/smart-context-mcp/blob/main/docs/features/context-prediction.md) - File prediction
- [Diff-Aware Context](https://github.com/Arrayo/smart-context-mcp/blob/main/docs/features/diff-aware.md) - Change analysis
- [Cache Warming](https://github.com/Arrayo/smart-context-mcp/blob/main/docs/features/cache-warming.md) - Cold-start optimization
- [Git Blame](https://github.com/Arrayo/smart-context-mcp/blob/main/docs/features/git-blame.md) - Code attribution
- [Cross-Project Context](https://github.com/Arrayo/smart-context-mcp/blob/main/docs/features/cross-project.md) - Multi-project support

## Links

- [GitHub](https://github.com/Arrayo/smart-context-mcp)
- [npm](https://www.npmjs.com/package/smart-context-mcp)
- [Issues](https://github.com/Arrayo/smart-context-mcp/issues)

## Author

**Francisco Caballero Portero**  
fcp1978@hotmail.com  
[@Arrayo](https://github.com/Arrayo)

## License

MIT
