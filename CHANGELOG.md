# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Client Compatibility Matrix & Recommended Modes:**
  - Created comprehensive docs/client-compatibility.md
  - Compatibility matrix comparing all 4 clients
  - Recommended mode per client (Cursor, Claude Desktop, Codex, Qwen)
  - Feature comparison (rules, hooks, persistence, automaticity)
  - Quick start guides per client
  - Honest limitations per client
  - Troubleshooting per client
  - Migration guides between clients
  - Added summary table to README

### Changed
- **`smart_turn(start)` as Recommended Entry Point:**
  - Emphasized as optimal flow for non-trivial tasks
  - Added 5 complete workflow examples (debugging, review, refactor, testing, architecture)
  - Updated base rules to highlight `smart_turn` benefits
  - Updated all task profiles to start with `smart_turn(start)`
  - Created comprehensive docs/smart-turn-entry-point.md
  - Benefits: Context recovery, session persistence, metrics tracking, repo safety
  - When to use: Debugging, review, refactor, testing, architecture
  - When to skip: Trivial tasks, one-off questions, simple reads
- **Two-Layer Agent Rules Architecture:**
  - Base rule ultra-short (~150 tokens, always active)
  - Task-specific profiles compact (~100-150 tokens, conditional)
  - Reduces fixed context cost by 75% (600 → 150 tokens)
  - Profiles: debugging, code-review, refactoring, testing, architecture
  - Cursor: `.cursor/rules/devctx.mdc` + `.cursor/rules/profiles-compact/*.mdc`
  - Codex/Qwen/Claude: Updated `AGENTS.md` and `CLAUDE.md` with base rules
  - Maintains compatibility with existing installations

### Added
- **Simplified Installation Experience:**
  - Direct, copy-paste installation blocks per client (Cursor, Codex, Claude, Qwen)
  - Clear "How it Works in Practice" section explaining real flow
  - Honest documentation about what MCP can/cannot do
  - `docs/how-it-works.md` - Complete step-by-step example with token breakdown
  - Realistic expectations (best/typical/worst case scenarios)
  - Troubleshooting guide for common issues
- **Agent Rules as Core Product Feature:**
  - Task-specific workflow profiles (debugging, code review, refactoring, testing, architecture)
  - Compact core rules auto-generated during installation
  - Detailed profile documentation in `tools/devctx/agent-rules/`
  - Design rationale document explaining rule philosophy
  - README for agent rules explaining structure and usage
- Agent rules now highlight **when** and **how** to use tools, not just what they do
- Token savings quantified per profile (87-90% reduction)

### Security
- Enhanced command validation with dangerous pattern detection (`rm -rf`, `sudo`, `curl|`, `eval`)
- Added `DEVCTX_SHELL_DISABLED` environment variable to disable shell execution
- Improved error messages showing allowed commands and subcommands
- Added 16 new security tests (435 total, 26 security-focused)
- Comprehensive security documentation:
  - `SECURITY.md` - Security policy and threat model
  - `docs/security/threat-model.md` - Attack surface analysis
  - `docs/security/configuration.md` - Hardening guide
  - `docs/security/risk-mitigation-summary.md` - Mitigation summary
- Graceful error handling in `smart_read` (returns `{ error }` instead of throwing)
- Error isolation in `smart_read_batch` (partial results on failure)
- Security sections added to both READMEs

### Changed
- Agent rules refactored from verbose to compact, workflow-oriented format
- Rules now organized by task type (debugging, review, refactor, test, architecture)
- `smart_read` now returns error objects instead of throwing exceptions
- `smart_read_batch` continues processing after individual file errors
- Command length limited to 500 characters
- `git blame` added to allowed git subcommands
- `eval` added to allowed npm script patterns
- Both READMEs updated to highlight agent rules as key differentiator

## [1.1.0] - 2026-03-29

### Added

- **Cache Warming**: Preload frequently accessed files into OS cache for 5x faster cold start
  - `warm_cache` tool with automatic frequency analysis
  - SQLite-based access tracking
  - Configurable via `DEVCTX_CACHE_WARMING` and `DEVCTX_WARM_FILES`
  - See [docs/features/cache-warming.md](./docs/features/cache-warming.md)

- **Symbol-Level Git Blame**: Function-level code attribution
  - `git_blame` tool with multiple modes (symbol, file, author, recent)
  - Primary author detection with contribution percentages
  - Multi-contributor tracking
  - See [docs/features/git-blame.md](./docs/features/git-blame.md)

- **Cross-Project Context**: Share context across monorepos and microservices
  - `cross_project` tool with search, read, symbol, and dependency modes
  - `.devctx-projects.json` configuration support
  - Cross-project dependency graph
  - See [docs/features/cross-project.md](./docs/features/cross-project.md)

- **Repository Metadata**: Updated all URLs to point to `Arrayo/smart-context-mcp`

- **Documentation**: Refactored README for clarity with Core vs Advanced tool separation

### Changed

- Incremented package version to 1.1.0
- Reorganized documentation into `/docs` structure

### Fixed

- All tests passing (421 tests)
- End-to-end feature verification working

## [1.0.4] - 2026-03-28

### Added

- **Streaming Progress Notifications**: Real-time updates for long-running operations
  - Progress reporting for indexing, cache warming, and batch operations
  - See [docs/features/streaming.md](./docs/features/streaming.md)

- **Diff-Aware Context**: Intelligent git change analysis
  - Analyze diffs vs HEAD, branches, or tags
  - Prioritize changes by impact (high/medium/low)
  - Expand context with related files (tests, importers, dependencies)
  - Symbol-level change detection
  - See [docs/features/diff-aware.md](./docs/features/diff-aware.md)

- **Context Prediction**: Learn from usage patterns and predict needed files
  - Jaccard similarity-based pattern matching
  - Automatic file prediction after 3+ similar tasks
  - 40-60% fewer round-trips, 15-20% additional token savings
  - See [docs/features/context-prediction.md](./docs/features/context-prediction.md)

### Changed

- SQLite schema version updated to 4 (added `context_access` table)
- Improved test coverage and CI pipeline compatibility

## [1.0.3] - 2026-03-27

### Added

- Session management with `smart_summary`
- Turn orchestration with `smart_turn`
- Batch file reading with `smart_read_batch`

### Changed

- Migrated from JSONL to SQLite for state management (Node 22+)
- Improved metrics tracking and reporting

## [1.0.2] - 2026-03-26

### Added

- Symbol index with `build_index`
- Graph-based context expansion
- Intent-aware search ranking

### Changed

- Enhanced `smart_context` with graph relationships
- Improved parser support for multiple languages

## [1.0.1] - 2026-03-25

### Added

- `smart_shell` for safe command execution
- `smart_metrics` for usage inspection

### Fixed

- Various bug fixes and performance improvements

## [1.0.0] - 2026-03-24

### Added

- Initial release with core tools:
  - `smart_read`: Compressed file reading
  - `smart_search`: Intent-aware code search
  - `smart_context`: One-call context builder
- Multi-client support (Cursor, Codex, Claude Code, Qwen)
- Automatic client configuration generation
- Real-time metrics tracking

---

For detailed changes per feature, see:
- [Diff-Aware Context](./docs/changelog/diff-aware.md)
- [Cache Warming](./docs/changelog/cache-warming.md)
- [Git Blame](./docs/changelog/git-blame.md)
- [Cross-Project Context](./docs/changelog/cross-project.md)
