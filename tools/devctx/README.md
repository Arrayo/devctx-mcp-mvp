# devctx-mcp

`devctx-mcp` is a local MCP server for AI coding agents that need less raw context and more useful signal.

It exposes:

- `smart_read`: compact file summaries instead of full-file dumps
- `smart_read_batch`: read multiple files in one call — reduces round-trip latency
- `smart_search`: ripgrep-first code search with grouped, ranked results and intent-aware ranking
- `smart_context`: one-call context planner that combines search + read + graph expansion
- `smart_shell`: safe diagnostic shell execution with a restricted allowlist
- `build_index`: lightweight symbol index for faster lookups and smarter ranking

## Quick start

```bash
npm install devctx-mcp
npx devctx-init --target .
```

This installs the MCP server and generates client configs for Cursor, Codex, Qwen, and Claude Code. Open the project with your IDE/agent and devctx starts automatically.

## Binaries

The package exposes two binaries:

- `devctx-server`
- `devctx-init`

Start the MCP server against the current project:

```bash
devctx-server
```

Start it against another repository:

```bash
devctx-server --project-root /path/to/target-repo
```

## Generate client configs

Generate MCP config files for a target project:

```bash
devctx-init --target /path/to/project
```

Limit the generated clients if needed:

```bash
devctx-init --target /path/to/project --clients cursor,codex,qwen,claude
```

Override the command used in generated configs:

```bash
devctx-init --target /path/to/project --command node --args '["./tools/devctx/src/mcp-server.js"]'
```

## Usage per client

After installing and running `devctx-init`, each client picks up devctx automatically:

### Cursor

Open the project in Cursor. The MCP server starts automatically. Enable it in **Cursor Settings > MCP** if needed. All six tools are available in Agent mode.

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

Claude Code reads `.mcp.json` from the project root.

### Qwen Code

Open the project in Qwen Code. The MCP server starts from `.qwen/settings.json`.

## Agent rules

`devctx-init` also generates agent rules that instruct AI agents to prefer devctx tools over their built-in equivalents. This is what makes agents actually use `smart_read` in outline/signatures mode instead of reading full files.

The rules include task-specific strategies with `intent` parameter for `smart_search`:

- **Debugging**: `intent=debug` → search error → read signatures → inspect symbol → smart_shell for errors
- **Review**: `intent=implementation` → read outline/signatures, focus on changed symbols, minimal changes
- **Refactor**: `intent=implementation` → signatures for public API, preserve behavior, small edits
- **Tests**: `intent=tests` → find existing tests (test files rank higher), read symbol of function under test
- **Config**: `intent=config` → find settings, env vars, infrastructure files (config files rank higher)
- **Architecture**: `intent=explore` → directory structure, outlines of key modules and API boundaries

Generated files per client:

- **Cursor**: `.cursor/rules/devctx.mdc` (always-apply rule)
- **Codex**: `AGENTS.md` (devctx section with sentinel markers)
- **Claude Code**: `CLAUDE.md` (devctx section with sentinel markers)

The rules are idempotent — running `devctx-init` again updates the section without duplicating it. Existing content in `AGENTS.md` and `CLAUDE.md` is preserved.

## What it is good at

Strong fit:

- JavaScript / TypeScript apps and monorepos
- React, Next.js, Node.js backends
- Python services and scripts
- Infra / platform repos with Terraform, Docker, YAML, shell, SQL

Good fit:

- Go services
- Rust services and libraries
- Java backends with straightforward structure

Partial fit:

- Large enterprise Java codebases with heavy framework magic
- Repos with a lot of generated code
- Polyglot monorepos where semantic ranking matters more than text structure

Not a strong fit yet:

- PHP, Ruby, C#, Kotlin, Swift, Elixir
- Codebases that need deep semantic understanding everywhere
- Use cases where `smart_shell` must behave like a general shell

## Tool behavior

### `smart_read`

Modes:

- `outline` — compact structural summary (~90% token savings)
- `signatures` — exported API surface only
- `range` — specific line range with line numbers (`startLine`, `endLine`)
- `symbol` — extract function/class/method by name; accepts a string or an array for batch extraction
- `full` — file content capped at 12k chars, with truncation marker when needed

The `symbol` mode supports nested methods (class methods, object methods), interface signatures, and multiline function signatures across all supported languages.

Token budget mode:

- Pass `maxTokens` to let the tool auto-select the most detailed mode that fits the budget
- Cascade order: `full` -> `outline` -> `signatures` -> truncated
- If the requested mode (or default `outline`) exceeds the budget, the tool falls back to a more compact mode automatically
- `range` and `symbol` modes do not cascade but will truncate by tokens if needed
- When the mode changes, the response includes `chosenMode` (the mode actually used) and `budgetApplied: true`

Responses are cached in memory per session. If the same file+mode is requested again and the file's `mtime` has not changed, the cached result is returned without re-parsing. The response includes `cached: true` when served from cache.

Every response includes confidence metadata:

- `parser` — `"ast"` (JS/TS via TypeScript compiler), `"heuristic"` (line-based patterns), `"fallback"` (structural text extraction), or `"raw"` (full and range modes only). Symbol mode reflects the actual extraction strategy (ast/heuristic/fallback).
- `truncated` — `true` when output was capped, so the agent knows to request a more targeted mode
- `indexHint` — (symbol mode only) `true` when the symbol index guided the extraction
- `chosenMode` — (token budget only) the mode that was actually used after cascade
- `budgetApplied` — (token budget only) `true` when the mode was downgraded to fit the budget

Current support:

- First-class (AST): JS, JSX, TS, TSX
- Heuristic: Python, Go, Rust, Java, shell, Terraform, HCL, Dockerfile, SQL, JSON, TOML, YAML
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
- Returns `retrievalConfidence`: `"high"` (rg), `"medium"` (walk, no skips), `"low"` (walk with skipped files)
- Returns `indexFreshness`: `"fresh"`, `"stale"` (files modified since last build), or `"unavailable"`
- Returns `sourceBreakdown`: how many top-10 results came from text match, index boost, or graph boost
- When fallback is used, includes `provenance` with `fallbackReason`, `caseMode`, `partial`, skip counts, and `warnings`

Example response:

```json
{
  "engine": "rg",
  "retrievalConfidence": "high",
  "indexFreshness": "fresh",
  "sourceBreakdown": { "textMatch": 7, "indexBoost": 2, "graphBoost": 1 },
  "intent": "tests",
  "indexBoosted": 2
}
```

### `smart_context`

One-call context planner. Instead of the manual cycle of `smart_search` → `smart_read` → `smart_read` → ..., `smart_context` receives a task description and returns curated context in a single response.

Parameters:

- `task` (required) — natural language task description (e.g., `"debug the auth flow in AuthMiddleware"`)
- `intent` (optional) — override auto-detected intent (`implementation`, `debug`, `tests`, `config`, `docs`, `explore`)
- `maxTokens` (optional, default 8000) — token budget for the response; fewer files are included with tighter budgets
- `entryFile` (optional) — hint file to guarantee inclusion as primary context
- `diff` (optional) — scope context to changed files only. Pass `true` for uncommitted changes vs HEAD, or a git ref string (`"main"`, `"HEAD~1"`, `"origin/main"`) to diff against that ref. Requires a git repository.

Pipeline:

1. **Search mode** (default): Extracts search queries and symbol candidates from the task, runs `smart_search` with the best query and intent
2. **Diff mode** (when `diff` is provided): Runs `git diff --name-only <ref>` to get changed files, skips search entirely
3. Expands top results via the relational graph (`queryRelated`): imports, importedBy, tests, neighbors
4. Allocates read modes per file role: `outline` for primary files, `signatures` for tests/dependencies
5. Extracts symbol details when identifiers (camelCase/PascalCase/snake_case) are detected in the task
6. Assembles everything into a single response with graph summary and actionable hints

Diff mode is ideal for PR review and debugging recent changes — instead of searching the full codebase, it reads only the changed files plus their tests and dependencies.

Example response:

```json
{
  "task": "debug AuthMiddleware",
  "intent": "debug",
  "indexFreshness": "fresh",
  "context": [
    { "file": "src/auth/middleware.js", "role": "primary", "readMode": "outline", "symbols": ["AuthMiddleware", "requireRole"], "content": "..." },
    { "file": "tests/auth.test.js", "role": "test", "readMode": "signatures", "content": "..." },
    { "file": "src/utils/jwt.js", "role": "dependency", "readMode": "signatures", "content": "..." },
    { "file": "src/auth/middleware.js", "role": "symbolDetail", "readMode": "symbol", "content": "..." }
  ],
  "graph": {
    "primaryImports": ["src/utils/jwt.js"],
    "tests": ["tests/auth.test.js"],
    "dependents": [],
    "neighbors": ["src/utils/logger.js"]
  },
  "metrics": { "totalTokens": 1200, "filesIncluded": 4, "filesEvaluated": 8, "savingsPct": 82 },
  "hints": ["Inspect symbols with smart_read: verifyJwt, createJwt"]
}
```

File roles: `primary` (search hits or changed files), `test` (related test files), `dependency` (imports), `dependent` (importedBy), `symbolDetail` (extracted symbol bodies).

When using diff mode, the response includes a `diffSummary`:

```json
{
  "diffSummary": { "ref": "main", "totalChanged": 5, "included": 3, "skippedDeleted": 1 }
}
```

### `build_index`

- Builds a lightweight symbol index for the project (functions, classes, methods, types, etc.)
- Supports JS/TS (via TypeScript AST), Python, Go, Rust, Java
- Extracts imports/exports and builds a dependency graph with `import` and `testOf` edges
- Test files are linked to source files via import analysis and naming conventions
- Index stored per-project in `.devctx/index.json`, invalidated by file mtime
- Accelerates `smart_search` (symbol + graph ranking) and `smart_read` symbol mode (line hints)
- Pass `incremental=true` to only reindex files with changed mtime — much faster for large repos (10k+ files). Falls back to full rebuild if no prior index exists.
- Incremental response includes `reindexed`, `removed`, `unchanged` counts
- Run once after checkout or when many files changed; not required but recommended for large projects

### `smart_shell`

- Runs only allowlisted diagnostic commands
- Executes from the effective project root
- Blocks shell operators and unsafe commands by design

## Evaluations

The project includes an eval harness with a synthetic corpus of 26 tasks (find-definition, debug, review, tests, refactor, config, onboard, explore). Current results:

- **P@5**: 0.962 | **Pass rate**: 25/26 (96%) | **Wrong-file rate**: 0.115
- **Latency p50/p95**: 9/11ms | **Retrieval honesty**: 0.962

```bash
npm run eval                # full run with index + intent
npm run eval -- --baseline  # baseline without index/intent
npm run eval:report         # scorecard with delta vs baseline
```

The harness supports `--root=` and `--corpus=` for evaluating against real repos with custom task corpora.

## Notes

- `@vscode/ripgrep` provides a bundled `rg` binary, so a system install is not required.
- Metrics are written under `.devctx/metrics.jsonl` in the package root.
- Symbol index stored in `.devctx/index.json` when `build_index` is used.
- This package is a navigation and diagnostics layer, not a full semantic code intelligence system.

## Repository

Source repository and full project documentation:

- https://github.com/Arrayo/devctx-mcp-mvp
