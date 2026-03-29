# smart-context-mcp

MCP server that reduces AI agent token usage by 90% with intelligent context compression and smart file reading.

[![npm version](https://img.shields.io/npm/v/smart-context-mcp.svg)](https://www.npmjs.com/package/smart-context-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it does

Provides 12 specialized tools that replace inefficient file reading and searching with compressed, ranked results:

- **smart_read**: Read files in outline/signatures mode instead of full content (90% token savings)
- **smart_read_batch**: Read multiple files in one call
- **smart_search**: Intent-aware code search with ranking (21x compression)
- **smart_context**: One-call context builder with search + read + graph expansion
- **smart_summary**: Maintain conversation state across sessions (46x compression)
- **smart_turn**: Orchestrate turn start/end with automatic context recovery
- **smart_metrics**: Inspect token savings and usage stats
- **smart_shell**: Safe diagnostic command execution
- **build_index**: Build symbol index for faster lookups
- **warm_cache**: Preload frequently accessed files (5x faster cold start)
- **git_blame**: Function-level code attribution
- **cross_project**: Share context across monorepos and microservices

## Real metrics

Production usage across 3,666 operations:

- **14.5M tokens → 1.6M tokens** (89.87% reduction)
- **Compression ratios**: 3x to 46x depending on tool
- **Cold start**: 250ms → 50ms with cache warming

## Installation

```bash
npm install smart-context-mcp
npx smart-context-init --target .
```

Restart your AI client (Cursor, Codex, Claude Desktop). Tools are immediately available.

## Core Features

### 1. Smart File Reading

Read files without loading full content:

```javascript
// Instead of 4000 tokens of full file
await smartRead({ 
  filePath: 'src/server.js',
  mode: 'outline'  // Returns only structure: ~400 tokens
});

// Extract specific function
await smartRead({
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbol: 'validateToken'
});
```

**Modes**: `outline`, `signatures`, `symbol`, `range`, `full`

### 2. Intent-Aware Search

Search with automatic ranking based on task type:

```javascript
await smartSearch({
  query: 'authentication',
  intent: 'debug'  // Prioritizes error handling, logs
});

await smartSearch({
  query: 'UserModel',
  intent: 'implementation'  // Prioritizes source files
});
```

**Intents**: `implementation`, `debug`, `tests`, `config`, `docs`, `explore`

### 3. One-Call Context

Get everything needed for a task in one call:

```javascript
await smartContext({
  task: 'Fix authentication bug in login flow',
  detail: 'balanced',  // minimal | balanced | deep
  maxTokens: 8000
});

// Returns:
// - Relevant files (searched + expanded via graph)
// - Compressed content (outline/signatures)
// - Symbol details for mentioned identifiers
// - Graph relationships
// - Evidence for each inclusion
```

### 4. Diff-Aware Context

Analyze git changes intelligently:

```javascript
await smartContext({
  task: 'Review recent changes',
  diff: 'main'  // or 'HEAD', 'feature-branch'
});

// Returns:
// - Changed files prioritized by impact
// - Related files (importers, tests, dependencies)
// - Change statistics and categorization
// - Symbol-level change detection
```

### 5. Context Prediction

Learn from usage patterns and predict needed files:

```javascript
await smartContext({
  task: 'Implement user authentication',
  prefetch: true  // Learns and predicts relevant files
});

// After 3+ similar tasks:
// - Automatically includes predicted files
// - 40-60% fewer round-trips
// - 15-20% additional token savings
```

### 6. Session Management

Maintain context across sessions:

```javascript
// Start session
await smartSummary({
  action: 'update',
  update: {
    goal: 'Implement OAuth flow',
    status: 'in_progress',
    nextStep: 'Add token validation'
  }
});

// Resume later
await smartSummary({ action: 'get' });
// Returns compressed state: goal, status, nextStep, decisions, etc.
```

### 7. Cache Warming

Eliminate cold-start latency:

```javascript
await buildIndex({ 
  incremental: true,
  warmCache: true  // Preloads frequent files
});

// First query: 250ms → 50ms
```

### 8. Git Blame

Function-level code attribution:

```javascript
// Who wrote each function?
await gitBlame({
  mode: 'symbol',
  filePath: 'src/server.js'
});

// Find code by author
await gitBlame({
  mode: 'author',
  authorQuery: 'alice@example.com'
});

// Recent changes
await gitBlame({
  mode: 'recent',
  daysBack: 7
});
```

### 9. Cross-Project Context

Work across monorepos and microservices:

```javascript
// Search all related projects
await crossProject({
  mode: 'search',
  query: 'AuthService'
});

// Find symbol across projects
await crossProject({
  mode: 'symbol',
  symbolName: 'validateToken'
});

// Get dependency graph
await crossProject({ mode: 'deps' });
```

Requires `.devctx-projects.json` config file.

## Supported Languages

**First-class (AST parsing)**: JavaScript, TypeScript, JSX, TSX

**Heuristic parsing**: Python, Go, Rust, Java, C#, Kotlin, PHP, Swift

**Structural extraction**: Shell, Terraform, HCL, Dockerfile, SQL, JSON, YAML, TOML

## Client Support

Works with:
- **Cursor** (via `.cursor/mcp.json`)
- **Codex CLI** (via `.codex/config.toml`)
- **Claude Code** (via `.mcp.json` + `.claude/settings.json`)
- **Qwen Code** (via `.qwen/settings.json`)

`smart-context-init` generates configs for all clients automatically.

## Configuration

### Basic Setup

```bash
# Install in project
npm install smart-context-mcp

# Generate configs
npx smart-context-init --target .

# Specific clients only
npx smart-context-init --target . --clients cursor,codex
```

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
cd main-app && npx smart-context-mcp build-index
cd ../shared-lib && npx smart-context-mcp build-index
cd ../api-service && npx smart-context-mcp build-index
```

## Commands

```bash
# Start MCP server
npm start

# Run tests
npm test

# Verify all features
npm run verify

# Generate client configs
npm run init:clients -- --target /path/to/project

# View metrics report
npm run report:metrics
```

## Performance

| Operation | Without MCP | With MCP | Savings |
|-----------|-------------|----------|---------|
| Read file | 4,000 tokens | 400 tokens | 90% |
| Search code | 10,000 tokens | 500 tokens | 95% |
| Session resume | 5,000 tokens | 100 tokens | 98% |
| Cold start | 250ms | 50ms | 5x faster |

## Documentation

- [STREAMING.md](./STREAMING.md) - Real-time progress notifications
- [CONTEXT-PREDICTION.md](./CONTEXT-PREDICTION.md) - Intelligent file prediction
- [DIFF-AWARE.md](./DIFF-AWARE.md) - Smart change analysis
- [CACHE-WARMING.md](./CACHE-WARMING.md) - Cold-start optimization
- [GIT-BLAME.md](./GIT-BLAME.md) - Code attribution
- [CROSS-PROJECT.md](./CROSS-PROJECT.md) - Multi-project support
- [E2E-TEST-REPORT.md](./E2E-TEST-REPORT.md) - End-to-end test results

## Requirements

- **Node.js**: 18+ (22+ recommended for SQLite features)
- **Git**: For diff-aware context and git blame
- **ripgrep**: Included via `@vscode/ripgrep` (no system install needed)

## Storage

All data stored in `.devctx/`:
- `index.json` - Symbol index
- `state.sqlite` - Sessions, metrics, patterns (Node 22+)
- `metrics.jsonl` - Legacy metrics (fallback for Node <22)

Add to `.gitignore`:

```
.devctx/
!.devctx/.gitkeep
```

## Testing

```bash
# Unit tests (421 tests)
npm test

# Feature verification
npm run verify

# Smoke test
npm run smoke
```

## Use Cases

### Code Review
```javascript
await smartContext({ 
  task: 'Review PR changes',
  diff: 'main'
});
```

### Debugging
```javascript
await smartSearch({
  query: 'TypeError: Cannot read property',
  intent: 'debug'
});
```

### Implementation
```javascript
await smartContext({
  task: 'Add OAuth authentication',
  prefetch: true,
  detail: 'deep'
});
```

### Onboarding
```javascript
await gitBlame({
  mode: 'file',
  filePath: 'src/core.js'
});
```

### Monorepo Work
```javascript
await crossProject({
  mode: 'search',
  query: 'SharedButton'
});
```

## API Reference

### smart_read

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

### smart_search

```typescript
{
  query: string;
  intent?: 'implementation' | 'debug' | 'tests' | 'config' | 'docs' | 'explore';
  cwd?: string;
  maxResults?: number;
}
```

### smart_context

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

### smart_summary

```typescript
{
  action: 'get' | 'update' | 'append' | 'auto_append' | 'checkpoint' | 'reset' | 'list_sessions' | 'compact' | 'cleanup_legacy';
  sessionId?: string;
  update?: {
    goal?: string;
    status?: 'planning' | 'in_progress' | 'blocked' | 'completed';
    currentFocus?: string;
    nextStep?: string;
    completed?: string[];
    decisions?: string[];
    touchedFiles?: string[];
  };
  maxTokens?: number;
  event?: string;
}
```

### build_index

```typescript
{
  incremental?: boolean;
  warmCache?: boolean;
}
```

### warm_cache

```typescript
{}  // No parameters
```

### git_blame

```typescript
{
  mode: 'symbol' | 'file' | 'author' | 'recent';
  filePath?: string;
  authorQuery?: string;
  limit?: number;
  daysBack?: number;
}
```

### cross_project

```typescript
{
  mode: 'discover' | 'search' | 'read' | 'symbol' | 'deps' | 'stats';
  query?: string;
  intent?: string;
  symbolName?: string;
  fileRefs?: Array<{ project: string; file: string; mode?: string }>;
  maxResultsPerProject?: number;
  includeProjects?: string[];
  excludeProjects?: string[];
}
```

## Changelog

### v1.0.4 (Latest)

- ✅ Streaming progress notifications
- ✅ Diff-aware context analysis
- ✅ Intelligent context prediction
- ✅ Cache warming
- ✅ Symbol-level git blame
- ✅ Cross-project context
- 421 tests passing (100%)

See individual CHANGELOG files for detailed changes.

## Contributing

This is a production tool. Pull requests welcome for:
- Additional language parsers
- Performance optimizations
- Bug fixes

## Author

**Francisco Caballero Portero**  
Email: fcp1978@hotmail.com  
GitHub: [@Arrayo](https://github.com/Arrayo)

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/Arrayo/devctx-mcp-mvp)
- [npm Package](https://www.npmjs.com/package/smart-context-mcp)
- [Issue Tracker](https://github.com/Arrayo/devctx-mcp-mvp/issues)
