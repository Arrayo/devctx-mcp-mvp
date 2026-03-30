# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- **Base Rule Reduction (76% smaller):**
  - Reduced base rule from 42 lines to 10 lines (76% reduction in fixed context cost)
  - Moved all task-specific workflows to conditional profiles in `.cursor/rules/profiles-compact/`
  - Base rule now only shows: tool preference, smart_turn flow, reading cascade, pointer to profiles
  - Profiles (debugging, code-review, refactoring, testing, architecture) are conditionally applied based on file globs
  - Impact: Simple tasks see 10 lines instead of 42 lines; complex tasks see 50 lines (base + 1 profile) instead of 42 lines
  - Goal: Minimize fixed context cost, maximize coherence with token savings, improve agent learning
  - Updated: `.cursor/rules/devctx.mdc`, `AGENTS.md`, `CLAUDE.md`, `tools/devctx/agent-rules/base.md`, `tools/devctx/agent-rules/compact.md`, `tools/devctx/scripts/init-clients.js`
  - New doc: `docs/agent-rules/base-rule-reduction.md` with analysis and verification steps

### Added
- **Security Rejection Examples:**
  - New test file: `tests/smart-shell-security.test.js` with 60+ security tests
  - New doc: `docs/security/rejection-examples.md` with 50+ concrete rejection examples
  - Added "Real Rejection Examples" section to SECURITY.md
  - Enhanced README security section with actual rejection responses
  - Test categories: shell operators, dangerous commands, git writes, package installs, find args, malformed commands
  - All blocked commands return exitCode 126, blocked: true, and human-readable rejection reason
  - Verification: `npm test -- tests/smart-shell-security.test.js` proves documented behavior
  - New doc: `docs/security-examples-analysis.md` with design rationale
  - Goal: Build trust through concrete examples, verifiable behavior, and transparency

- **Enhanced Compatibility Matrix:**
  - Added comprehensive 8-column matrix to README with "Near-Automatic" levels and key limitations
  - New columns: MCP, Rules, Hooks, `smart_turn`, Persistence, Near-Automatic, Key Limitations
  - Added "What Near-Automatic Means" explanation section
  - Added "What It Does NOT Mean" clarification (no prompt interception, no forced usage)
  - Added "Which Client Should I Use?" decision guide
  - Updated docs/client-compatibility.md to reference main README matrix
  - New doc: docs/compatibility-matrix-design.md with design rationale
  - Goal: Make client differences explicit, avoid ambiguity, facilitate adoption decisions

### Changed
- **Quality Claim Matization:**
  - Replaced "Responses are faster and more accurate" with "Responses are faster and more focused on relevant context"
  - Replaced "Improves search and context quality" with "Improves search ranking and context relevance"
  - Added "What 'Better Context' Means" clarification section in README
  - Rationale: "Accurate" is subjective and hard to measure; "focused on relevant context" is honest and verifiable
  - New doc: docs/quality-claim-analysis.md with critical analysis and recommendations
  - Goal: Avoid over-promising, align marketing with evidence, maintain credibility

- **Naming Clarity: "Persistent Task Context" vs "Total Conversation Context":**
  - Replaced "context persistence" with "persistent task context" throughout docs
  - Replaced "session context" with "task checkpoint" for precision
  - Replaced "context recovery" with "checkpoint recovery" or "task recovery"
  - Added explicit "What is NOT persisted" sections in all key docs
  - Clarified that checkpoints are ~100 tokens (goal, status, decisions, next step), not full transcripts
  - Updated package.json description to mention "task checkpoint persistence"
  - Updated README, tools/devctx/README, docs/how-it-works.md, docs/smart-turn-entry-point.md
  - Updated docs/client-compatibility.md table headers
  - Updated all agent rules (base.md, compact.md, core.md, profiles/*.md)
  - New doc: docs/persistent-task-context.md explaining conceptual distinction
  - Goal: Maximum conceptual clarity, avoid over-promising, honest about what gets stored

### Added
- **Workflow Metrics System:**
  - Track token savings for complete task workflows (debugging, review, refactor, testing, architecture)
  - Auto-detect workflow type from session goal and tools used
  - Calculate savings vs realistic baselines (150K-300K tokens per workflow type)
  - New `workflow_metrics` table in SQLite (migration v5)
  - New `npm run report:workflows` command with `--summary`, `--type`, `--session`, `--json` options
  - Opt-in via `DEVCTX_WORKFLOW_TRACKING=true` environment variable
  - Auto-tracking when agent uses `smart_turn(start)` and `smart_turn(end)`
  - Workflow summary by type with avg savings, duration, steps
  - Comprehensive docs/workflow-metrics.md with baselines, examples, and limitations
  - Example workflow tracking in docs/examples/workflow-tracking-example.md
  - Baselines: Debugging (150K), Code Review (200K), Refactoring (180K), Testing (120K), Architecture (300K)
  - Expected savings: 87-90% per workflow type, 98%+ vs baseline
  - 16 new tests for workflow detection and baseline calculation
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
  - Benefits: Task checkpoint recovery, state persistence, metrics tracking, repo safety
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
