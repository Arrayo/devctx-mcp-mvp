# smart-context-mcp

[![npm version](https://badge.fury.io/js/smart-context-mcp.svg)](https://www.npmjs.com/package/smart-context-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MCP server that reduces AI agent token usage by 90% and improves response quality.**

Instead of reading entire files and repeating context, this MCP provides 8 focused tools that compress, rank, and maintain context efficiently.

## Why use this?

**Problem:** AI agents waste tokens reading full files, repeating context, and searching inefficiently.

**Solution:** This MCP reduces token usage by **~90%** in real projects while improving response quality.

**Real metrics from production use:**
- 14.5M tokens → 1.6M tokens (89.87% reduction)
- 3,666 successful calls across the original 7 core tools
- Compression ratios: 3x to 46x depending on tool

## Quick Start (2 commands)

```bash
npm install smart-context-mcp
npx smart-context-init --target .
```

That's it. Restart your AI client (Cursor, Codex, Claude Desktop) and the tools are available.

**Important:** The init command automatically sets the correct project-root env var in the generated configs, so the MCP server runs from your project root. This works for standalone projects, monorepos, and nested workspaces.

## What you get

Eight focused tools that work automatically:

- `smart_read`: compact file summaries instead of full file dumps (3x compression)
- `smart_read_batch`: read multiple files in one call — reduces round-trip latency
- `smart_search`: ripgrep-first code search with intent-aware ranking (21x compression)
- `smart_context`: one-call context planner — search + read + graph expansion
- `smart_summary`: maintain compressed conversation state across sessions (46x compression)
- `smart_turn`: one-call turn orchestration for start/end context recovery and checkpointing
- `smart_metrics`: inspect saved token metrics and recent usage through MCP
- `smart_shell`: safe diagnostic shell execution with restricted commands (18x compression)
- `build_index`: lightweight symbol index for faster lookups and smarter ranking

**Strongest in:** Modern web/backend codebases (JS/TS, React, Next.js, Node.js, Python, Go, Rust), infra repos (Terraform, Docker, YAML)

## Example: Before vs After

### Without this MCP
```
Agent: Let me read auth.js...
[Reads 4,000 tokens of full file]

Agent: Let me search for "jwt validation"...
[Returns 10,000 tokens of grep results]

Agent: [Next turn] What were we doing?
[Repeats 5,000 tokens of context]

Total: ~19,000 tokens
```

### With this MCP
```
Agent: Let me use smart_read on auth.js...
[Returns 500 tokens of signatures]

Agent: Let me use smart_search for "jwt validation"...
[Returns 400 tokens of ranked snippets]

Agent: [Next turn] Let me get the context...
[smart_summary returns 100 tokens]

Total: ~1,000 tokens (95% reduction)
```

## Quick start

```bash
npm install smart-context-mcp
npx smart-context-init --target .
```

This installs the MCP server and generates client configs for Cursor, Codex, Qwen, and Claude Code. Open the project with your IDE/agent and the server starts automatically.
If the target is a git repository, `smart-context-init` also installs an idempotent `pre-commit` hook that blocks commits when `.devctx/state.sqlite` is staged, tracked, or not properly ignored.
For Claude Code, `smart-context-init` also generates `.claude/settings.json` with native hooks so devctx context recovery and turn-end enforcement run automatically.

## Binaries

The package exposes five binaries:

- `smart-context-headless`
- `smart-context-server`
- `smart-context-init`
- `smart-context-report`
- `smart-context-protect`

Start the MCP server against the current project:

```bash
smart-context-server
```

Start it against another repository:

```bash
smart-context-server --project-root /path/to/target-repo
```

## Generate client configs

Generate MCP config files for a target project:

```bash
smart-context-init --target /path/to/project
```

Limit the generated clients if needed:

```bash
smart-context-init --target /path/to/project --clients cursor,codex,qwen,claude
```

Override the command used in generated configs:

```bash
smart-context-init --target /path/to/project --command node --args '["./tools/devctx/src/mcp-server.js"]'
```

## Metrics

Each tool call persists token metrics to the target repo by default in:

```bash
.devctx/state.sqlite
```

SQLite is now the primary project-local store for persisted context and metrics. Running `smart-context-init` also adds `.devctx/` to the target repo's `.gitignore` idempotently.

When an active session exists, metrics entries automatically inherit its `sessionId`, so you can inspect savings per task with `smart_metrics`.

Show a quick report:

```bash
smart-context-report
```

Show JSON output or inspect a legacy/custom JSONL file explicitly:

```bash
smart-context-report --json
smart-context-report --file ./.devctx/metrics.jsonl
```

Example output:

```text
devctx metrics report

File:         /path/to/repo/.devctx/state.sqlite
Source:       sqlite
Entries:      148
Raw tokens:   182,340
Final tokens: 41,920
Saved tokens: 140,420 (77.01%)

By tool:
  smart_context  count=42 raw=96,200 final=24,180 saved=72,020 (74.86%)
  smart_read     count=71 raw=52,810 final=9,940 saved=42,870 (81.18%)
  smart_search   count=35 raw=33,330 final=7,800 saved=25,530 (76.59%)
```

If you need JSONL compatibility for external tooling, set `DEVCTX_METRICS_FILE` or pass `--file`.

## Usage per client

After installing and running `smart-context-init`, each client picks up the server automatically:

### Cursor

Open the project in Cursor. The MCP server starts automatically. Enable it in **Cursor Settings > MCP** if needed. All eight tools are available in Agent mode.

### Codex CLI

```bash
cd /path/to/your-project
codex
```

Codex reads `.codex/config.toml` and starts the MCP server on launch.

### Claude Code

```bash
cd /path/to/your-project
claude
```

Claude Code reads `.mcp.json` from the project root and `.claude/settings.json` for native hook automation.

### Codex/Qwen headless fallback

When a client does not expose native per-turn hooks, use `smart-context-headless` to wrap a headless CLI run and force `smart_turn(start)` plus a closing checkpoint around that invocation.

Examples:

```bash
smart-context-headless --client codex --prompt "Finish the runtime repo-safety docs" -- codex exec
smart-context-headless --client qwen --prompt "Review the persisted session and propose the next step" -- qwen -p
```

This is the current automation path for non-Claude CLI agents. GUI clients without hook support still rely on generated rules plus `smart_turn`.

### Qwen Code

Open the project in Qwen Code. The MCP server starts from `.qwen/settings.json`.

## Agent rules

`smart-context-init` generates agent rules that instruct AI agents to prefer devctx tools over their built-in equivalents. This is what makes agents use `smart_read` in outline/signatures mode instead of reading full files.

### Intent-based workflows

The `intent` parameter in `smart_search` and `smart_context` adjusts ranking and suggests optimal workflows:

| Intent | Ranking priority | Suggested workflow |
|--------|-----------------|-------------------|
| `debug` | Error messages, stack traces, logs | Search error → read signatures → inspect symbol → smart_shell |
| `implementation` | Source files, changed files | Read outline/signatures → focus on changed symbols |
| `tests` | Test files, spec files | Find tests → read symbol of function under test |
| `config` | Config files, env vars, YAML/JSON | Find settings → read full config files |
| `explore` | Entry points, main modules | Directory structure → outlines of key modules |

### Generated files per client

- **Cursor**: `.cursor/rules/devctx.mdc` (always-apply rule)
- **Codex**: `AGENTS.md` (devctx section with sentinel markers)
- **Claude Code**: `CLAUDE.md` (devctx section with sentinel markers) and `.claude/settings.json` (native hooks)

The generated files are idempotent — running `smart-context-init` again updates the devctx sections and Claude hook entries without duplicating them. Existing content in `AGENTS.md`, `CLAUDE.md`, and `.claude/settings.json` is preserved.

## Use against another repo

By default, `devctx` works against the repo where it is installed. You can point it at another repo without modifying that target project:

```bash
node ./src/mcp-server.js --project-root /path/to/target-repo
```

or:

```bash
DEVCTX_PROJECT_ROOT=/path/to/target-repo node ./src/mcp-server.js
```

or (recommended for MCP clients and generated configs):

```bash
DEVCTX_PROJECT_ROOT=/path/to/target-repo node ./src/mcp-server.js
```

Legacy configs that still set `MCP_PROJECT_ROOT` remain supported for backward compatibility.

`smart-context-init` automatically sets `DEVCTX_PROJECT_ROOT` in the generated client configs (`.cursor/mcp.json`, `.codex/config.toml`, `.mcp.json`, `.qwen/settings.json`), so the MCP server always launches from the correct project context, even in monorepos or when installed globally.

## What it is good at

| Level | Languages / Stack | Use cases |
|-------|------------------|-----------|
| **Strong** | JS/TS, React, Next.js, Node.js, Python | Modern web apps, monorepos, backend services, scripts |
| **Strong** | Terraform, Docker, YAML, shell, SQL | Infra/platform repos, config-heavy codebases |
| **Good** | Go, Rust, Java, C#/.NET, Kotlin, PHP, Swift | Services, libraries, Android/iOS, Laravel/Symfony |
| **Partial** | Enterprise Java/C# with heavy frameworks | Generated code, polyglot monorepos needing semantic ranking |
| **Limited** | Ruby, Elixir, Scala | Deep semantic understanding required, general shell needs |

## Tool behavior

### `smart_read`

Modes:

- `outline` — compact structural summary (~90% token savings)
- `signatures` — exported API surface only
- `range` — specific line range with line numbers (`startLine`, `endLine`)
- `symbol` — extract function/class/method by name; accepts a string or an array for batch extraction
- `full` — file content capped at 12k chars, with truncation marker when needed

The `symbol` mode supports nested methods (class methods, object methods), interface signatures, and multiline function signatures across all supported languages.

Cross-file symbol context:

- Pass `context: true` with `symbol` mode to include callers, tests, and referenced types from the dependency graph
- Callers: files that import the current file and reference the symbol (via graph + ripgrep)
- Tests: test files related to the current file that mention the symbol
- Types: type/interface names referenced in the symbol definition that exist in the index
- Requires `build_index` for graph data; without it, the definition is returned with an empty context and a hint
- Response includes `context: { callers, tests, types }` with counts, `graphCoverage: { imports, tests }` (`full|partial|none`), and `contextHints` if applicable
- `graphCoverage` indicates how reliable cross-file context is: `full` for JS/TS/Python/Go (imports resolved), `partial` for C#/Kotlin/PHP/Swift (imports extracted but namespace-based), `none` for other languages

Token budget mode:

- Pass `maxTokens` to let the tool auto-select the most detailed mode that fits the budget
- Cascade order: `full` -> `outline` -> `signatures` -> truncated
- If the requested mode (or default `outline`) exceeds the budget, the tool falls back to a more compact mode automatically
- `range` and `symbol` modes do not cascade but will truncate by tokens if needed
- When the mode changes, the response includes `chosenMode` (the mode actually used) and `budgetApplied: true`

Responses are cached in memory per session. If the same file+mode is requested again and the file's `mtime` has not changed, the cached result is returned without re-parsing. The response includes `cached: true` when served from cache.

Every response includes a `confidence` block:

```json
{ "parser": "ast|heuristic|fallback|raw", "truncated": false, "cached": false }
```

Additional metadata: `indexHint` (symbol mode), `chosenMode`/`budgetApplied` (token budget), `graphCoverage` (symbol+context mode).

**Example response (outline mode):**

```json
{
  "mode": "outline",
  "parser": "ast",
  "truncated": false,
  "cached": false,
  "tokens": 245,
  "confidence": { "parser": "ast", "truncated": false, "cached": false },
  "content": "import express from 'express';\nexport class AuthMiddleware { ... }\nexport function requireRole(role: string) { ... }"
}
```

Current support:

- First-class (AST): JS, JSX, TS, TSX
- Heuristic: Python, Go, Rust, Java, C#, Kotlin, PHP, Swift, shell, Terraform, HCL, Dockerfile, SQL, JSON, TOML, YAML
- Fallback: plain-text structural extraction for unsupported formats

### `smart_read_batch`

Read multiple files in one MCP call. Reduces round-trip latency for common patterns like "read the outline of these 5 files".

Parameters:

- `files` (required, max 20) — array of items, each with:
  - `path` (required) — file path
  - `mode` (optional) — `outline`, `signatures`, `full`, `range`, `symbol`
  - `symbol`, `startLine`, `endLine` (optional) — as in `smart_read`
  - `maxTokens` (optional) — per-file token budget with automatic mode cascade
- `maxTokens` (optional) — global token budget; stops reading more files once exceeded (at least 1 file is always read)

Response:

```json
{
  "results": [
    { "filePath": "...", "mode": "outline", "parser": "ast", "truncated": false, "content": "..." },
    { "filePath": "...", "mode": "signatures", "parser": "heuristic", "truncated": false, "content": "..." }
  ],
  "metrics": { "totalTokens": 450, "filesRead": 2, "filesSkipped": 0, "totalSavingsPct": 88 }
}
```

### `smart_search`

- Uses embedded ripgrep via `@vscode/ripgrep`
- Falls back to filesystem walking if rg is unavailable or fails
- Groups matches by file, ranks results to reduce noise
- Optional `intent` parameter adjusts ranking: `implementation`, `debug`, `tests`, `config`, `docs`, `explore`
- When a symbol index exists (via `build_index`), files with matching definitions get +50 ranking bonus, and related files (importers, tests, neighbors) get +25 graph boost
- Index is loaded from `projectRoot`, so subdirectory searches still benefit from the project-level index
- Returns `confidence` block: `{ "level": "high", "indexFreshness": "fresh" }`

**Example response:**

```json
{
  "engine": "rg",
  "retrievalConfidence": "high",
  "indexFreshness": "fresh",
  "confidence": { "level": "high", "indexFreshness": "fresh" },
  "sourceBreakdown": { "textMatch": 7, "indexBoost": 2, "graphBoost": 1 },
  "results": [
    { "file": "src/auth/middleware.js", "matches": 3, "rank": 150, "preview": "export class AuthMiddleware { ..." }
  ]
}
```

### `smart_context`

One-call context planner. Instead of the manual cycle of `smart_search` → `smart_read` → `smart_read` → ..., `smart_context` receives a task description and returns curated context in a single response.

**Pipeline:**

```
task input → intent detection → search/diff → graph expansion → smart_read_batch → symbol extraction → response
```

**Parameters:**
- `task` (required) — natural language description (e.g., `"debug the auth flow in AuthMiddleware"`)
- `intent` (optional) — override auto-detected intent
- `detail` (optional) — `minimal` | `balanced` (default) | `deep`
- `maxTokens` (optional, default 8000) — token budget
- `entryFile` (optional) — guarantee specific file inclusion
- `diff` (optional) — `true` (vs HEAD) or git ref (`"main"`) to scope to changed files only
- `include` (optional) — `["content","graph","hints","symbolDetail"]` to control response fields

**Detail modes:**

| Mode | Behavior | Use when |
|------|----------|----------|
| `minimal` | Index-first: paths, roles, evidence, signatures, symbol previews (no file reads) | Fastest exploration, budget-constrained |
| `balanced` | Batch read with smart compression (outline/signatures) | Default, most tasks |
| `deep` | Full content reads | Deep investigation, debugging |

**How it works:**

1. **Search or diff**: Extracts queries from task and runs `smart_search`, OR runs `git diff` when `diff` parameter provided
2. **Graph expansion**: Expands top results via relational graph (imports, importedBy, tests, neighbors)
3. **Read strategy**: Index-first mode (no file reads) OR batch read mode using `smart_read_batch` with role-based compression
4. **Symbol extraction**: Detects identifiers in task and extracts focused symbol details
5. **Deduplication**: In `minimal` mode, omits redundant outline when `symbolDetail` covers same file
6. **Assembly**: Returns curated context with `reasonIncluded` / `evidence` per item, graph summary, hints, and confidence block

Diff mode is ideal for PR review and debugging recent changes — reads only changed files plus their tests and dependencies.

Example response:

```json
{
  "task": "debug AuthMiddleware",
  "intent": "debug",
  "indexFreshness": "fresh",
  "confidence": { "indexFreshness": "fresh", "graphCoverage": { "imports": "full", "tests": "full" } },
  "context": [
    { "file": "src/auth/middleware.js", "role": "primary", "readMode": "outline", "reasonIncluded": "Matched task search: AuthMiddleware", "evidence": [{ "type": "searchHit", "query": "AuthMiddleware", "rank": 1 }, { "type": "symbolMatch", "symbols": ["AuthMiddleware"] }], "symbols": ["AuthMiddleware", "requireRole"], "symbolPreviews": [{ "name": "AuthMiddleware", "kind": "class", "signature": "export class AuthMiddleware", "snippet": "export class AuthMiddleware { ..." }], "content": "..." },
    { "file": "tests/auth.test.js", "role": "test", "readMode": "signatures", "reasonIncluded": "Test for src/auth/middleware.js", "evidence": [{ "type": "testOf", "via": "src/auth/middleware.js" }], "content": "..." },
    { "file": "src/utils/jwt.js", "role": "dependency", "readMode": "signatures", "reasonIncluded": "Imported by src/auth/middleware.js", "evidence": [{ "type": "dependencyOf", "via": "src/auth/middleware.js" }], "content": "..." },
    { "file": "src/auth/middleware.js", "role": "symbolDetail", "readMode": "symbol", "reasonIncluded": "Focused symbol detail: AuthMiddleware", "evidence": [{ "type": "symbolDetail", "symbols": ["AuthMiddleware"] }], "content": "..." }
  ],
  "graph": {
    "primaryImports": ["src/utils/jwt.js"],
    "tests": ["tests/auth.test.js"],
    "dependents": [],
    "neighbors": ["src/utils/logger.js"]
  },
  "graphCoverage": { "imports": "full", "tests": "full" },
  "metrics": { "totalTokens": 1200, "filesIncluded": 4, "filesEvaluated": 8, "savingsPct": 82 },
  "hints": ["Inspect symbols with smart_read: verifyJwt, createJwt"]
}
```

`graphCoverage` indicates how complete the relational context is: `full` for JS/TS/Python/Go (imports resolved to local files), `partial` for C#/Kotlin/PHP/Swift (imports extracted but namespace-based), `none` for other languages. When files from multiple languages are included, the level reflects the weakest coverage.

File roles: `primary` (search hits or changed files), `test` (related test files), `dependency` (imports), `dependent` (importedBy), `symbolDetail` (extracted symbol bodies). Each item also includes `reasonIncluded` and structured `evidence` so the agent knows why it was selected.

When using diff mode, the response includes a `diffSummary`:

```json
{
  "diffSummary": { "ref": "main", "totalChanged": 5, "included": 3, "skippedDeleted": 1 }
}
```

### `smart_summary`

Maintain compressed conversation state across sessions. Solves the context-loss problem when resuming work after hours or days.

**Actions:**

| Action | Purpose | Returns |
|--------|---------|---------|
| `get` | Retrieve current, explicit, or auto-resolved session | Resume summary (≤500 tokens) + compression metadata |
| `update` | Create or replace session | New session with compressed state |
| `append` | Add to existing session | Merged session state |
| `auto_append` | Add only when something meaningful changed | Merged session state or skipped no-op result |
| `checkpoint` | Event-driven orchestration for persistence decisions | Persisted update or skipped event with decision metadata |
| `reset` | Clear session | Confirmation |
| `list_sessions` | Show all available sessions | Array of sessions with metadata |
| `compact` | Apply retention/compaction to SQLite state | Counts for pruned sessions, events, and metrics |
| `cleanup_legacy` | Inspect or remove imported JSON/JSONL artifacts | Dry-run or deletion report |

**Parameters:**
- `action` (required) — one of the actions above
- `sessionId` (optional) — session identifier; auto-generated from `goal` if omitted. Pass `"auto"` to accept the recommended recent session when multiple candidates exist.
- `update` (required for update/append/auto_append/checkpoint) — object with:
  - `goal`: primary objective
  - `status`: current state (`planning` | `in_progress` | `blocked` | `completed`)
  - `pinnedContext`: critical context that should survive compression when possible
  - `unresolvedQuestions`: open questions that matter for the next turn
  - `currentFocus`: current work area in one short phrase
  - `whyBlocked`: blocker summary when status is `blocked`
  - `completed`: array of completed steps
  - `decisions`: array of key decisions with rationale
  - `blockers`: array of current blockers
  - `nextStep`: immediate next action
  - `touchedFiles`: array of modified files
- `maxTokens` (optional, default 500) — hard cap on summary size
- `event` (optional for `checkpoint`) — one of `manual`, `milestone`, `decision`, `blocker`, `status_change`, `file_change`, `task_switch`, `task_complete`, `session_end`, `read_only`, `heartbeat`
- `force` (optional, default false) — override a suppressed checkpoint event
- `retentionDays` (optional, default 30) — used by `compact`
- `keepLatestEventsPerSession` (optional, default 20) — used by `compact`
- `keepLatestMetrics` (optional, default 1000) — used by `compact`
- `vacuum` (optional, default false) — run SQLite `VACUUM` after deletions during `compact`
- `apply` (optional, default false) — required to actually delete files during `cleanup_legacy`

`update` replaces the stored session state for that `sessionId`, so omitted fields are cleared. Use `append` when you want to keep existing state and add progress incrementally. Use `auto_append` when the caller may fire checkpoint saves often and you want the tool to skip no-op updates automatically. Use `checkpoint` when the caller has a meaningful event and wants the tool to decide whether that event deserves persistence.

**Storage:**
- Session state, session events, summary cache, and metrics persist in `.devctx/state.sqlite`
- Legacy `.devctx/sessions/*.json`, `.devctx/sessions/active.json`, and `.devctx/metrics.jsonl` are imported idempotently when present
- `compact` enforces retention without deleting the active session
- `cleanup_legacy` is dry-run by default and only deletes imported legacy artifacts when `apply: true`

**Auto-resume behavior:**
- `get` returns the active session immediately when `active.json` exists
- If there is no active session, `get` auto-resumes the best saved session when there is a single clear candidate
- If multiple recent sessions are plausible, `get` returns ordered `candidates` plus `recommendedSessionId`
- Passing `sessionId: "auto"` accepts that recommendation and restores it as the active session

**Resume summary fields:**
- `status` and `nextStep` are preserved with highest priority
- `pinnedContext` and `unresolvedQuestions` preserve critical context and open questions
- `currentFocus` and `whyBlocked` are included when relevant
- `recentCompleted`, `keyDecisions`, and `hotFiles` are derived from the persisted state
- `completedCount`, `decisionsCount`, and `touchedFilesCount` preserve activity scale cheaply
- Empty fields are omitted to save tokens

**Response metadata:**
- `schemaVersion`: persisted session schema version
- `truncated`: whether the resume summary had to be compressed
- `compressionLevel`: `none` | `trimmed` | `reduced` | `status_only`
- `omitted`: fields dropped from the resume summary to fit the token budget
- `repoSafety`: git hygiene signal for `.devctx/state.sqlite` (`isIgnored`, `isTracked`, `isStaged`, warnings, recommended actions)
- mutating actions (`update`, `append`, `auto_append`, `checkpoint`, `reset`, `compact`) are blocked at runtime when `.devctx/state.sqlite` is tracked or staged

**Compression strategy:**
- Keeps the persisted session state intact and compresses only the resume summary
- Prioritizes `nextStep`, `status`, and active blockers over history
- Deduplicates repeated completed steps, decisions, and touched files
- Uses token-aware reduction until the summary fits `maxTokens`

**Example workflow:**

```javascript
// Start of work session
smart_summary({ action: "get" })
// → retrieves last active session or auto-resumes the best saved session

// After implementing auth middleware
smart_summary({ 
  action: "checkpoint",
  event: "milestone",
  update: {
    completed: ["auth middleware"],
    decisions: ["JWT with 1h expiry, refresh tokens in Redis"],
    touchedFiles: ["src/middleware/auth.js"],
    nextStep: "add role-based access control"
  }
})

// Monday after weekend - resume work
smart_summary({ action: "get" })
// → full context restored, continue from nextStep

// List all sessions
smart_summary({ action: "list_sessions" })
// → see all available sessions, pick one to resume

// Inspect git safety for project-local state from any smart_summary response
smart_summary({ action: "get" })
// → repoSafety warns if .devctx/state.sqlite is tracked or not ignored

// Suppress noisy read-only exploration checkpoints
smart_summary({
  action: "checkpoint",
  event: "read_only",
  update: { currentFocus: "inspect auth flow" }
})
// → skipped=true, no event persisted

// Compact old SQLite events while keeping recent history
smart_summary({ action: "compact", retentionDays: 30, keepLatestEventsPerSession: 20, keepLatestMetrics: 1000 })

// Inspect what legacy files are safe to remove
smart_summary({ action: "cleanup_legacy" })

// Remove imported legacy JSON/JSONL artifacts explicitly
smart_summary({ action: "cleanup_legacy", apply: true })
```

### `smart_metrics`

Inspect token metrics recorded in project-local SQLite storage without leaving MCP.

- Returns aggregated totals, savings percentage, and per-tool breakdowns
- Supports `window`: `24h` | `7d` | `30d` | `all`
- Supports filtering by `tool`
- Supports filtering by `sessionId`, including `sessionId: "active"`
- Includes `latestEntries` so an agent can explain recent savings without parsing storage manually
- Includes `overheadTokens` and `overheadTools` so hook/wrapper context cost stays measurable against the savings
- When `.devctx/state.sqlite` is tracked or staged, metric writes are skipped and reads fall back to a temporary read-only snapshot with `sideEffectsSuppressed: true`

**Example workflow:**

```javascript
smart_metrics({ window: "7d", sessionId: "active" })
// → totals and recent entries for the current task/session
```

### `smart_turn`

Orchestrate the start or end of a meaningful agent turn with one MCP call.

- `phase: "start"` rehydrates context, classifies whether the current prompt aligns with persisted work, and can auto-create a planning session for a substantial new task
- `phase: "end"` writes a checkpoint through `smart_summary` and can optionally include compact metrics
- Designed to make context usage almost mandatory without forcing the agent to chain `smart_summary(get)` and `smart_summary(checkpoint)` manually on every turn
- Claude Code can invoke this automatically through generated native hooks on `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop`
- Non-Claude CLI clients can approximate the same flow with `smart-context-headless`, which wraps one headless agent invocation around `smart_turn(start)` and `smart_turn(end)`

**Example workflow:**

```javascript
smart_turn({
  phase: "start",
  prompt: "Finish runtime repo-safety enforcement for smart metrics",
  ensureSession: true
})
// → summary + continuity classification + repoSafety

smart_turn({
  phase: "end",
  event: "milestone",
  update: {
    completed: ["Finished smart metrics repo-safety enforcement"],
    nextStep: "Update docs and run the full suite"
  }
})
// → checkpoint result + optional compact metrics
```

### `build_index`

- Builds a lightweight symbol index for the project (functions, classes, methods, types, etc.)
- Supports JS/TS (via TypeScript AST), Python, Go, Rust, Java, C#, Kotlin, PHP, Swift
- Extracts imports/exports and builds a dependency graph with `import` and `testOf` edges
- Test files are linked to source files via import analysis and naming conventions
- Index stored per-project in `.devctx/index.json`, invalidated by file mtime
- Each symbol includes a condensed `signature` (one line, max 200 chars) and a short `snippet` preview so agents can inspect likely definitions without opening files
- Accelerates `smart_search` (symbol + graph ranking) and `smart_read` symbol mode (line hints)
- Pass `incremental=true` to only reindex files with changed mtime — much faster for large repos (10k+ files). Falls back to full rebuild if no prior index exists.
- Incremental response includes `reindexed`, `removed`, `unchanged` counts
- Run once after checkout or when many files changed; not required but recommended for large projects

### `smart_shell`

- Runs only allowlisted diagnostic commands
- Executes from the effective project root
- Blocks shell operators and unsafe commands by design

## Evaluations (repo development only)

The eval harness and corpora are available in the [source repository](https://github.com/Arrayo/devctx-mcp-mvp) but are **not included in the npm package**. Clone the repo to run evaluations.

```bash
cd tools/devctx
npm run eval
npm run eval -- --baseline
npm run eval:self
npm run eval:context
npm run eval:both
npm run eval:report
```

Commands:
- `eval` — synthetic corpus with index + intent
- `eval -- --baseline` — baseline without index/intent
- `eval:self` — self-eval against the real devctx repo
- `eval:context` — evaluate smart_context alongside search
- `eval:both` — search + context evaluation
- `eval:report` — scorecard with delta vs baseline

The harness supports `--root=` and `--corpus=` for evaluating against any repo with custom task corpora. Use `--tool=search|context|both` to control which tools are evaluated. When `--tool=context`, pass/fail is determined by `smart_context` precision; when `--tool=both`, both search and context must pass.

Metrics include: P@5, P@10, Recall, wrong-file rate, retrieval honesty, follow-up reads, tokens-to-success, latency p50/p95, confidence calibration (accuracy, over-confident rate, under-confident rate), and smart_context metrics when applicable. smart_context reporting now includes precision, explanation coverage (`reasonIncluded` + `evidence`), preview coverage (`symbolPreviews`), and preview symbol recall. Token metrics (`totalTokens`) reflect the full JSON payload, not just content blocks.

## Notes

- `@vscode/ripgrep` provides a bundled `rg` binary, so a system install is not required.
- Persistent context and metrics live in `<projectRoot>/.devctx/state.sqlite`.
- `DEVCTX_METRICS_FILE` is now an explicit compatibility override for JSONL-based workflows and reports.
- Symbol index stored in `<projectRoot>/.devctx/index.json` when `build_index` is used.
- Legacy session JSON files in `<projectRoot>/.devctx/sessions/` are imported idempotently when present.
- This package is a navigation and diagnostics layer, not a full semantic code intelligence system.

## Repository

Source repository and full project documentation:

- https://github.com/Arrayo/devctx-mcp-mvp

## Author

**Francisco Caballero Portero**  
Email: fcp1978@hotmail.com  
GitHub: [@Arrayo](https://github.com/Arrayo)

## License

MIT License - see [LICENSE](LICENSE) file for details.
