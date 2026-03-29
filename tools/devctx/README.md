# smart-context-mcp

MCP server that reduces AI agent token usage by 90% with intelligent context compression.

[![npm version](https://badge.fury.io/js/smart-context-mcp.svg)](https://www.npmjs.com/package/smart-context-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install smart-context-mcp
npx smart-context-init --target .
```

Restart your AI client. Tools are immediately available.

## What it does

Replaces inefficient file reading and searching with 12 specialized tools:

| Tool | Purpose | Savings |
|------|---------|---------|
| `smart_read` | Read files in outline/signatures mode | 90% |
| `smart_read_batch` | Read multiple files in one call | 90% |
| `smart_search` | Intent-aware code search with ranking | 95% |
| `smart_context` | One-call context builder | 85% |
| `smart_summary` | Session state management | 98% |
| `smart_turn` | Turn orchestration | - |
| `smart_metrics` | Token usage inspection | - |
| `smart_shell` | Safe command execution | 94% |
| `build_index` | Symbol index builder | - |
| `warm_cache` | File preloading (5x faster cold start) | - |
| `git_blame` | Function-level code attribution | - |
| `cross_project` | Multi-project context | - |

## Real Metrics

Production usage: **14.5M tokens → 1.6M tokens** (89.87% reduction)

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

Maintain session state:

```javascript
// Start
{ action: 'update', update: { goal: 'Implement OAuth', status: 'in_progress' }}

// Resume
{ action: 'get' }
```

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
- `state.sqlite` - Sessions, metrics, patterns
- `metrics.jsonl` - Legacy fallback

Add to `.gitignore`:
```
.devctx/
```

## Requirements

- Node.js 18+ (22+ for SQLite features)
- Git (for diff and blame features)

## Documentation

Full documentation in [GitHub repository](https://github.com/Arrayo/devctx-mcp-mvp):

- [STREAMING.md](https://github.com/Arrayo/devctx-mcp-mvp/blob/main/STREAMING.md) - Progress notifications
- [CONTEXT-PREDICTION.md](https://github.com/Arrayo/devctx-mcp-mvp/blob/main/CONTEXT-PREDICTION.md) - File prediction
- [DIFF-AWARE.md](https://github.com/Arrayo/devctx-mcp-mvp/blob/main/DIFF-AWARE.md) - Change analysis
- [CACHE-WARMING.md](https://github.com/Arrayo/devctx-mcp-mvp/blob/main/CACHE-WARMING.md) - Cold-start optimization
- [GIT-BLAME.md](https://github.com/Arrayo/devctx-mcp-mvp/blob/main/GIT-BLAME.md) - Code attribution
- [CROSS-PROJECT.md](https://github.com/Arrayo/devctx-mcp-mvp/blob/main/CROSS-PROJECT.md) - Multi-project support

## Links

- [GitHub](https://github.com/Arrayo/devctx-mcp-mvp)
- [npm](https://www.npmjs.com/package/smart-context-mcp)
- [Issues](https://github.com/Arrayo/devctx-mcp-mvp/issues)

## Author

**Francisco Caballero Portero**  
fcp1978@hotmail.com  
[@Arrayo](https://github.com/Arrayo)

## License

MIT
