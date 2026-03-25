# devctx MCP

`devctx` is a local MCP server for agents that need less raw context and more useful signal.

It provides six focused tools:

- `smart_read`: compact file summaries instead of full file dumps
- `smart_read_batch`: read multiple files in one call — reduces round-trip latency
- `smart_search`: ripgrep-first code search with intent-aware, grouped, ranked results
- `smart_context`: one-call context planner — search + read + graph expansion in a single response
- `smart_shell`: safe diagnostic shell execution with restricted commands
- `build_index`: lightweight symbol index for faster lookups and smarter ranking

The project is already useful across real repos. It is strongest in modern web/backend codebases and infra-heavy repositories. It is not fully universal yet.

## Best fit

### Strong fit

- JavaScript / TypeScript apps and monorepos
- React, Next.js, Node.js backends
- Python services and scripts
- Infra / platform repos with Terraform, Docker, YAML, shell, SQL
- Mixed repos where the agent mostly needs navigation, discovery, and diagnostics

### Good fit

- Go services
- Rust services and libraries
- Java backends with straightforward structure
- Repos with a lot of config and operational code

### Partial fit

- Large enterprise Java codebases with heavy framework magic
- Repos with a lot of generated code
- Polyglot monorepos where semantic ranking matters more than text structure

### Not a strong fit yet

- PHP, Ruby, C#, Kotlin, Swift, Elixir
- Codebases that require deep language-aware semantic understanding everywhere
- Cases where `smart_shell` needs to behave like a general shell

## Install in your project

```bash
npm install devctx-mcp
npx devctx-init --target .
```

This installs the MCP server and generates client configs for all supported clients. `npm install` downloads a platform-specific `rg` binary via `@vscode/ripgrep`. No system ripgrep is required.

To install only for a specific client:

```bash
npx devctx-init --target . --clients cursor
npx devctx-init --target . --clients codex
npx devctx-init --target . --clients codex,claude
```

## Usage per client

After installing, each client picks up devctx automatically:

### Cursor

Open the project in Cursor. The MCP server starts automatically. Enable it in **Cursor Settings > MCP** if needed. All tools (`smart_read`, `smart_read_batch`, `smart_search`, `smart_context`, `smart_shell`, `build_index`) are available in Agent mode.

Config: `.cursor/mcp.json`

### Codex CLI

```bash
cd /path/to/your-project
codex
```

Codex reads `.codex/config.toml` and starts the MCP server on launch.

Config: `.codex/config.toml`

### Claude Code

```bash
cd /path/to/your-project
claude
```

Claude Code reads `.mcp.json` from the project root.

Config: `.mcp.json`

### Qwen Code

Open the project in Qwen Code. The MCP server starts from `.qwen/settings.json`.

Config: `.qwen/settings.json`

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

## Quick start (from source)

```bash
cd tools/devctx
npm install
npm start
```

For normal IDE use, the MCP client should start the server automatically from its project config.

The package exposes two binaries: `devctx-server` and `devctx-init`.

## Use against another repo

By default, `devctx` works against the repo where it is installed. You can point it at another repo without modifying that target project:

```bash
node ./src/mcp-server.js --project-root /path/to/target-repo
```

or:

```bash
DEVCTX_PROJECT_ROOT=/path/to/target-repo node ./src/mcp-server.js
```

This is the basis for non-invasive validation before writing client config into another repository.

## Generate client configs

To generate or update MCP config files for a target project:

```bash
cd tools/devctx
npm run init:clients -- --target ../..
```

Limit clients or override the command if needed:

```bash
node ./scripts/init-clients.js --target /path/to/project --clients cursor,codex,qwen,claude
node ./scripts/init-clients.js --target /path/to/project --command node --args '["./tools/devctx/src/mcp-server.js"]'
```

If installed as a binary, the same initializer is available as:

```bash
devctx-init --target /path/to/project
```

The MCP server binary is:

```bash
devctx-server --project-root /path/to/target-repo
```

## Validation

Human-readable smoke test:

```bash
cd tools/devctx
npm run smoke
```

JSON smoke test for CI:

```bash
cd tools/devctx
npm run smoke:json
```

Multi-language fixture validation:

```bash
cd tools/devctx
npm run smoke:formats
```

`smoke:formats` validates local fixtures for:

- Go
- Rust
- Java
- Shell
- Terraform / HCL
- Dockerfile
- SQL

You can also validate `devctx` against an external repo without modifying it:

```bash
node ./scripts/smoke-test.js --json \
  --project-root /path/to/project \
  --read-file package.json \
  --read-mode outline \
  --read-expect name \
  --search-query jsonwebtoken \
  --search-cwd . \
  --search-expect jsonwebtoken
```

The JSON variant returns a stable object with `ok`, timestamps, and per-check results, and exits non-zero on failure.

## Tool behavior

### `smart_read`

Modes:

- `outline`: imports, exports, declarations, structure (~90% token savings)
- `signatures`: function/class signatures (~90% token savings)
- `range`: read specific lines by number — pass `startLine` and `endLine`
- `symbol`: extract a function/class/method by name — pass `symbol` parameter (string or array of strings for batch extraction). Uses language-aware parsing (AST for JS/TS including class methods, indent-tracking for Python, brace-counting for Go/Rust/Java). Handles multiline signatures.
- `full`: file content capped at 12k chars, with truncation marker when needed
- `maxTokens`: token budget — the tool auto-selects the most detailed mode that fits (`full` -> `outline` -> `signatures` -> truncated). Response includes `chosenMode` and `budgetApplied` when the mode was downgraded.

Responses are cached in memory per session and invalidated by file `mtime`. `cached: true` appears when the response is served from cache without re-parsing.

Every response includes confidence metadata:

- `parser` — `"ast"` (JS/TS via TypeScript compiler), `"heuristic"` (line-based patterns), `"fallback"` (structural text extraction), or `"raw"` (full and range modes only). Symbol mode reflects the actual extraction strategy (ast/heuristic/fallback).
- `truncated` — `true` when output was capped, so the agent knows to request a more targeted mode
- `indexHint` — (symbol mode only) `true` when the symbol index guided the extraction

Current language / format support:

- First-class (AST): JS, JSX, TS, TSX
- Heuristic: Python, Go, Rust, Java, shell, Terraform, HCL, Dockerfile, SQL, JSON, TOML, YAML
- Symbol extraction: JS, TS, Python, Go, Rust, Java (+ generic fallback)
- Fallback: plain-text structural extraction for unsupported formats

### `smart_read_batch`

- Read multiple files in one MCP call (max 20 per call)
- Each item accepts `path`, `mode`, `symbol`, `startLine`, `endLine`, `maxTokens` (per-file budget)
- Optional global `maxTokens` budget with early stop when exceeded
- Returns aggregated `metrics`: `totalTokens`, `filesRead`, `filesSkipped`, `totalSavingsPct`

### `smart_search`

- Uses `rg` first, falls back to filesystem walking if rg is unavailable or fails
- Groups matches by file, ranks results to reduce noise
- Optional `intent` parameter: `implementation`, `debug`, `tests`, `config`, `docs`, `explore`
- When a symbol index exists (via `build_index`), files containing matching definitions get a ranking bonus (+50), and related files (importers, tests, neighbors) get a graph boost (+25)
- Returns `retrievalConfidence`: `"high"` (rg), `"medium"` (walk, no skips), `"low"` (walk with skipped files)
- Returns `indexFreshness`: `"fresh"`, `"stale"` (files modified since last `build_index`), or `"unavailable"`
- Returns `sourceBreakdown`: `{ textMatch, indexBoost, graphBoost }` — how many top-10 results came from each source
- When fallback is used, includes `provenance` with `fallbackReason`, `caseMode`, `partial`, skip counts, and `warnings`
- Index is loaded from `projectRoot`, not from `cwd`, so subdirectory searches still benefit from the project-level index

### `smart_context`

One-call context planner that replaces the manual `smart_search` → `smart_read` → `smart_read` cycle.

- Receives a natural language `task` description (e.g., `"debug the auth flow in AuthMiddleware"`)
- Auto-detects `intent` from keywords, or accepts explicit override
- Runs `smart_search` internally, then expands results via the relational graph
- Reads each relevant file with the optimal mode (`outline` for primary files, `signatures` for tests/dependencies)
- Extracts symbol details when identifiers are detected in the task
- Returns curated context, graph summary, metrics, and actionable `hints`
- Accepts `maxTokens` budget (default 8000) to control response size and `entryFile` to guarantee a specific file in context
- **Diff mode**: pass `diff=true` (vs HEAD) or `diff="main"` to scope context to changed files only — ideal for PR review and debugging recent changes
- Saves multiple round-trips and exploration tokens in a single MCP call

### `build_index`

- Builds a lightweight symbol index (functions, classes, methods, types, etc.)
- Supports JS/TS (via TypeScript AST), Python, Go, Rust, Java
- Extracts imports/exports and builds a dependency graph with `import` and `testOf` edges
- Test files are linked to their source files via import analysis and naming conventions
- Index stored per-project in `.devctx/index.json`, invalidated by file mtime
- `incremental=true`: only reindex files with changed mtime — much faster for large repos. Falls back to full rebuild if no prior index exists.
- Run once after checkout or when many files changed; not required but recommended

### `smart_shell`

- Runs only allowlisted diagnostic commands
- Resolves execution from the effective project root
- Intentionally blocks shell operators and unsafe commands
- Useful for `pwd`, `git status`, `rg`, `ls`, `find`, and other low-risk diagnostics

## Evaluations

The project includes an eval harness with a synthetic corpus of 26 tasks. Current results with intent + index:

- **P@5**: 0.962 | **Pass rate**: 25/26 (96%) | **Wrong-file rate**: 0.115
- **Latency p50/p95**: 9/11ms | **Retrieval honesty**: 0.962

```bash
cd tools/devctx
npm run eval              # full run with index + intent
npm run eval -- --baseline  # baseline without index/intent for comparison
npm run eval:report       # scorecard with delta vs baseline
```

The harness supports `--root=` and `--corpus=` for evaluating against real repos with custom task corpora.

## Notes

- Paths are resolved relative to the effective project root, not the caller cwd.
- Metrics are written to `tools/devctx/.devctx/metrics.jsonl`.
- Symbol index stored in `.devctx/index.json` when `build_index` is used.
- `smart_shell` is intentionally conservative by design.
- Today this is a strong navigation and diagnostics layer, not a full semantic code intelligence system.
