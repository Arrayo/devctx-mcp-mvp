# Changelog

All notable changes to this project will be documented in this file.

## [1.7.1] - 2026-04-01

### Fixed
- **Client Detection:** Auto-detect client from environment variables (`CURSOR_AGENT=1`, `CLAUDE_AGENT=1`, etc.)
  - `task-runner` and `headless-wrapper` now detect client automatically instead of defaulting to `generic`
  - Metrics now correctly distinguish `cursor` from `generic` based on `CURSOR_AGENT` env var
  - Added `detectClient()` utility with caching and reset capability
  - CLI scripts (`task-runner.js`, `headless-wrapper.js`) use auto-detection by default
  - Supports cursor, claude, gemini, codex, with fallback to generic

### Tests
- Added 8 unit tests for client detection
- Added 2 integration tests validating client metrics
- Added validation script: `scripts/validate-client-detection.sh`
- Total: 715/715 tests passing

## [1.7.1] - 2026-04-01

### Added
- **Inline Metrics Display:** All tools now include `metricsDisplay` field with human-readable summary
  - Format: `✓ {tool}, {target}, {files} files, {raw}→{compressed} tokens ({ratio})`
  - Examples:
    - `✓ smart_read, src/auth.js, 1.2K→120 tokens (10.0:1)`
    - `✓ smart_search, buildMetrics, 10 files, 1.7K→781 tokens (2.2:1)`
    - `✓ smart_context, analyze auth flow, 8 files, 15.0K→1.5K tokens (10.0:1)`
  - Agents can surface this directly without formatting
  - Addresses feedback: "No pude ver el proceso paso a paso, métricas ocultas"

- **Top Tools Visibility:** `smart_metrics` now includes `summary.topTools` field
  - Highlights top 3 tools by net savings (e.g., smart_context: 850 tokens, smart_read: 400 tokens)
  - Filters out tools with negative or zero net savings
  - Makes compression tool value immediately visible in session reports
  - Addresses feedback: "el valor práctico de smart_context y smart_read se notó durante el trabajo, pero no quedó tan visible en la métrica agregada"

### Changed
- **Documentation:** Removed version-specific references from README files
- **Repository:** Cleaned up local development files (.cursor/rules/, .cursorrules, .gitlab-ci.yml, PUBLISH.md)

### Tests
- Added 8 unit tests for `metricsDisplay` formatting
- Added test for `topTools` ordering and filtering
- 40/40 tests passing (metrics-display + smart-metrics + orchestration)

## [1.7.0] - 2026-04-01

### Added
- **Shared Orchestration Layer:** Centralized orchestration logic in `base-orchestrator.js` and `event-policy.js`
  - Managed start/end cycle with session isolation
  - Wrapped prompts with context overhead tracking
  - Preflight logic (smart_context/smart_search) with policy composition
  - Continuity guidance and automaticity signals
  - Eliminates 433 lines of duplication from task-runner and headless-wrapper

- **Client Adapter Pattern:** Reusable adapters for IDE-specific hooks
  - `claude-adapter.js`: SessionStart, UserPromptSubmit, PostToolUse, Stop events
  - `cursor-adapter.js`: ConversationStart, UserMessageSubmit, PostToolUse, ConversationEnd events
  - Full dependency injection for testability
  - Turn tracking in SQLite with checkpoint enforcement
  - Auto-append carryover on conversation end
  - Backward compatible: legacy hooks reduced to 1-line re-exports

- **Comparative Client Metrics:** Cross-client benchmarking in product quality analytics
  - Per-client aggregation: adapter events, auto-start/checkpoint coverage, context overhead
  - Comparative signals: lowest avg overhead client, best auto-start rate
  - Standardized metadata: client, managedByClientAdapter, autoStartTriggered, autoCheckpointTriggered, overheadTokens
  - New report section: "Client Adapter Signals" with per-client breakdown
  - Prevents double-counting: overheadTokens only from events that declare it

### Changed
- **task-runner.js:** Refactored to consume shared orchestration (-265 lines)
- **headless-wrapper.js:** Refactored to delegate to base orchestrator (-225 lines)
- **claude-hooks.js:** Reduced to 1-line re-export for backward compatibility
- **product-quality.js:** Extended with client adapter quality analysis
- **report-metrics.js:** Fixed bug that hid quality section when turnsMeasured was 0

### Tests
- Added 54 unit tests for base-orchestrator and event-policy
- Added 17 unit tests for claude-adapter and cursor-adapter
- Added 3 unit tests for product-quality
- Total: 93/93 tests passing

### Documentation
- `docs/auto-orchestration-design.md`: Architecture and implementation plan
- `docs/phase-1-consolidation.md`: Shared orchestration validation summary
- `docs/phase-2-client-adapters.md`: Client adapter pattern documentation
- `docs/auto-orchestration-summary.md`: Executive summary of all phases
- `docs/verification/benchmark.md`: Validation workflow for client comparison

## [1.6.2] - 2026-04-01

### Improved
- **smart_shell Security:** Fixed false positives for legitimate shell patterns
  - Allow pipe character inside quoted arguments: `rg "foo|bar" src`
  - Allow `eval`/`exec` in path names: `find evals -name "*.json"`, `npm run eval:report`
  - Block `eval`/`exec` as commands: `eval "code"`, `exec /bin/sh`
  - Properly handle escaped characters: `find -exec rm {} \;`
  - Test coverage: Added 3 new tests, updated 4 security tests

- **Runtime Preflight:** Check Node version on startup
  - New `runtime-check.js` utility validates Node 22+ requirement
  - Server and task runner exit early with clear error if Node < 22
  - Message: "Node X.Y.Z is below minimum requirement (22+). node:sqlite and node:test require Node 22+"
  - Test coverage: `runtime-check.test.js`

- **smart_doctor Impact Estimation:** Show estimated cleanup impact
  - Compaction recommendations now include: `~3247 rows, ~15.2MB (45% reduction)`
  - New `estimatedImpact` field in details: `{ rowsToDelete, bytesReclaimed, pctReduction }`
  - Helps users decide when to run compaction

- **Legacy Cleanup Workflow:** Guided cleanup with visual feedback
  - `smart-context-task cleanup --mode legacy` shows table of eligible files
  - Displays file names, sizes, and total impact before cleanup
  - Clear instruction: "To apply cleanup, run: smart-context-task cleanup --mode legacy --apply"

### Changed
- **Package Version:** Bumped to 1.6.2

## [1.6.1] - 2026-03-31

### Fixed
- **Task Runner CLI Project Root:** `runtime-config.js` now uses `process.cwd()` as default instead of deriving from installed package path
  - Result: `smart-context-task` and `cursor-devctx` launcher now correctly use `.devctx` from the project where they're invoked
  - Test coverage: `runtime-config.test.js` validates `projectRoot === cwd` when no `--project-root` or env is set

- **SQLite Lock Handling:** Improved resilience for transient database locks
  - `sqlite.js`: Added `busy_timeout=1000ms` and retry logic with 3 attempts and incremental backoff (75ms × attempt)
  - `task-runner.js`: Wrapped all `smart_turn`, `smart_doctor`, `smart_status` calls with retry (100ms × attempt)
  - Result: Task runner workflows tolerate brief SQLite contention without failing
  - Test coverage: `task runner review dry-run tolerates transient SQLite locks` simulates real lock with child process

- **Prompt Rendering:** Fixed `[object Object]` appearing in task runner prompts
  - New `extractContextTopFiles` function normalizes `topFiles` to string paths
  - Handles both object format (`{file, path}`) and string format
  - Result: `Refreshed top files: tests/robustness.test.js, src/task-runner/policy.js` instead of `[object Object]`
  - Applied to preflight and continuity guidance rendering

### Changed
- **Package Version:** Bumped to 1.6.1

## [1.6.0] - 2026-03-31

### Added
- **smart_doctor Tool:** Comprehensive health checks for devctx state
  - Repo safety checks (tracked/staged state.sqlite detection)
  - Storage diagnostics with SQLite integrity verification
  - Compaction recommendations (stale sessions, old events, oversized metrics)
  - Legacy state detection and cleanup guidance
  - CLI: `smart-context-doctor` with `--json` and `--no-integrity` flags
  - Overall status: ok/warning/error with prioritized recommended actions

- **Orchestration Benchmark:** Release gating for production quality
  - 5 core scenarios: aligned-resume, context-refresh, blocked-remediation, skipped-checkpoint, persisted-checkpoint
  - Baseline enforcement in `orchestration-release-baseline.json`
  - CI integration: `npm run benchmark:orchestration:release` blocks on regression
  - `prepublishOnly` hook prevents npm publish if benchmark fails

- **Product Quality Metrics:** Beyond token savings
  - Continuity alignment rate (% of turns with aligned context)
  - Blocked remediation coverage (% of blocked turns with recommendedActions)
  - Refresh top-file signal rate (% of refreshes with topFiles)
  - Checkpoint persistence rate (% of checkpoints actually persisted)
  - Average recommended actions when blocked
  - Exposed in `smart_metrics` and `report-metrics.js`

- **Operational Guidance:** `recommendedPath` in smart_turn
  - Modes: blocked_guided, guided_refresh, guided_context, lightweight, continue_until_milestone, checkpointed
  - `nextTools`: Array of recommended tools (e.g., ['repo_safety', 'smart_search', 'smart_read'])
  - `steps`: Array of instructions with priority (required/recommended)
  - Surfaced in Claude hooks and headless wrapper

### Enhanced
- **Uniform mutationSafety Contract:** Consistent across all tools
  - New `mutation-safety.js` utility with `buildMutationSafety`, `buildDegradedMode`, `attachSafetyMetadata`
  - All tools expose: `{ blocked, blockedBy, stateDbPath, recommendedActions, message }`
  - `degradedMode` when side effects are suppressed
  - Centralized subject/message generation

- **SQLite Diagnostics:** Structured recovery guidance
  - `diagnoseStateStorage()` with PRAGMA quick_check
  - `getStateStorageHealth()` for missing/oversized/corrupted detection
  - `classifyStateDbError()` for locked/permission/corrupted classification
  - Enriched error messages with recovery actions

- **Client Integration:** Consistent guidance across all clients
  - Updated `init-clients.js` to surface mutationSafety contract
  - New blocked-state remediation row in `client-compatibility.md`
  - All clients (Cursor, Claude Desktop, Codex, Qwen) get guidance on blockedBy and recommendedActions

### Changed
- **Test Suite:** Expanded to 598+ tests (99%+ coverage)
- **CI/CD:** Release gating with orchestration benchmark
- **Package Version:** Bumped to 1.6.0

## [1.5.0] - 2026-03-31

### Added
- **Session Isolation:** Automatic new session creation in `smart_turn(start)`
  - Triggers when `ensureSession=true`, no fixed `sessionId`, and prompt mismatches active session
  - Prevents context contamination between unrelated tasks
  - Returns `isolatedSession` and `previousSessionId` in response

- **Net Token Savings:** Honest accounting of overhead
  - Calculates `netSavedTokens = savedTokens - overheadTokens`
  - Tracks overhead from `smart_summary`, hooks, and wrapper operations
  - Exposed in `smart_metrics` and `report-metrics.js`
  - Shows both gross and net savings percentages

- **Workflow Tracking in Core:** Integrated into `smart_turn`
  - Enabled via `DEVCTX_WORKFLOW_TRACKING=true` environment variable
  - `smart_turn(start)` auto-tracks workflow (debugging, code review, etc.)
  - `smart_turn(end)` closes workflow for events: milestone, task_complete, session_end, blocker
  - Persists `overheadTokens`, `netSavedTokens`, `netSavingsPct` in workflow metadata

- **Context Refresh:** Lightweight rehydration in `smart_turn(start)`
  - Calls `smart_context(minimal)` to rehydrate context for current prompt
  - Incrementally refreshes index if stale or unavailable
  - Returns `refreshedContext` with `topFiles`, `hints`, `indexRefreshed`
  - Propagated to Claude hooks and headless wrapper

- **Net Metrics Coverage API:** Transparency for historical data
  - `netMetricsCoverage` per workflow: `{ available, source }` (persisted/derived/none)
  - `netMetricsCoverage` in summary: `{ coveredWorkflows, totalWorkflows, coveragePct, complete }`
  - Exposed in `workflow-tracker.js` public API

### Enhanced
- **Selective Context Refresh:** Optimized to avoid unnecessary overhead
  - Only triggers for: new/isolated sessions, ambiguous cases, real continuity changes
  - Skips refresh for aligned or trivial prompts
  - Reduces token cost for routine operations

- **Anti-Commit Enforcement:** Hardened for SQLite state
  - Centralized policy in `repo-safety.js` with `getRepoMutationSafety()`
  - Closes bypasses in `workflow-tracker.js`, `context-patterns.js`, `metrics.js`
  - `smart_turn` exposes `workflow.blocked` when writes are blocked
  - Claude hooks avoid persisting state when repo safety blocks SQLite

### Changed
- **Documentation:** Aligned for workflow tracking, net savings, session isolation
- **Test Suite:** Expanded coverage for new features
- **Package Version:** Bumped to 1.5.0

## [1.4.0] - 2026-03-31

### Added
- **smart_edit Tool:** Batch file editing with pattern replacement
  - Edit multiple files in one call with literal or regex patterns
  - Supports `dryRun` mode for preview without modifications
  - Returns match count and detailed results per file
  - Use cases: bulk refactoring, removing console.log, pattern cleanup
  - Example: Remove all `console.log` from 10 files in one call
  - Max 50 files per call for safety

- **smart_status Tool:** Session context visibility
  - Displays current session: goal, status, nextStep, currentFocus
  - Shows recent decisions, touched files, pinned context, unresolved questions
  - Progress stats: completed count, decisions count, files count
  - Two formats: `detailed` (formatted with emojis) and `compact` (minimal JSON)
  - Updates automatically with each MCP operation
  - Fallback to most recent session if no active session exists

### Enhanced
- **smart_summary Flat API:** Simplified parameter structure (backward compatible)
  - New: `{ action: 'update', goal: '...', status: '...' }` (flat)
  - Old: `{ action: 'update', update: { goal: '...', status: '...' } }` (nested)
  - Both formats supported - nested takes priority if both provided
  - No breaking changes - existing code continues to work
  - Makes API more intuitive and easier to use

- **smart_context Pattern Detection:** Automatically detects and prioritizes literal patterns
  - Detects: `/**`, `/*`, `// TODO`, `// FIXME`, `// XXX`, `// HACK`
  - Detects: `console.log`, `console.error`, `debugger`
  - When task mentions these patterns, they're prioritized in search results
  - No manual search needed - smart_context handles it automatically
  - Example: "Find all TODO comments" → automatically searches for `// TODO`

- **smart_read Range with Outline:** Support line ranges in outline/signatures mode
  - Previously: `{ mode: 'outline', startLine, endLine }` would extract raw text
  - Now: Applies outline summarization to the specified range
  - Useful for large files - get outline of specific section only
  - Reduces tokens when you know which part of file is relevant

## [1.3.1] - 2026-03-30

### Changed
- **All Visibility Features Now Enabled by Default:**
  - `DEVCTX_SHOW_USAGE` - Changed from opt-in to **enabled by default**
  - `DEVCTX_EXPLAIN` - Changed from opt-in to **enabled by default**
  - `DEVCTX_DETECT_MISSED` - Changed from opt-in to **enabled by default**
  - Rationale: Make devctx usage visible by default, ensure agents use MCP when installed
  - Users can still disable: `export DEVCTX_SHOW_USAGE=false` (etc.)
  - Updated all tests to reflect new default behavior
  - Updated all documentation (README, tool README, feature docs)
  - Goal: Maximize visibility, drive adoption, make non-usage immediately obvious

### Added
- **Multi-Client Agent Rules:**
  - New `.cursorrules` file for Cursor (committed to git)
  - Updated `CLAUDE.md` for Claude Desktop (gitignored, user-specific)
  - Updated `AGENTS.md` for other agents (gitignored, user-specific)
  - New `docs/agent-rules-template.md` with templates for all clients
  - All rules enforce MANDATORY devctx usage policy
  - Enforces: Use smart_read instead of Read, smart_search instead of Grep, etc.
  - Provides recommended workflow and preflight checklist
  - Explains when to use devctx vs native tools
  - Requires agent to explain if native tools are used
  - Goal: Ensure agents use devctx when MCP is installed, across all clients

- **MCP Prompts (Automatic Forcing):**
  - New MCP prompts feature allows automatic injection of forcing instructions
  - 3 prompts available: `use-devctx`, `devctx-workflow`, `devctx-preflight`
  - Invoke with `/prompt use-devctx` in Cursor chat
  - `use-devctx`: Ultra-short forcing prompt (injects: `Use devctx: smart_turn(start) → ...`)
  - `devctx-workflow`: Complete step-by-step workflow template
  - `devctx-preflight`: Preflight checklist (build index + init session)
  - Implemented in `src/server.js` using MCP SDK `server.prompt()` API
  - Benefits: No manual typing, centrally managed, no typos, discoverable
  - New doc: `docs/mcp-prompts.md` with complete guide
  - Updated: `README.md` and `tools/devctx/README.md` with prompts section
  - Goal: Make forcing devctx usage effortless and automatic
  - Replaces need for manual forcing prompts or `.cursorrules`

- **Missed Opportunities Detector:**
  - New detector identifies when devctx should have been used but wasn't
  - Analyzes session patterns to detect adoption gaps and potential token savings
  - Enable with `export DEVCTX_DETECT_MISSED=true`
  - Detects: No devctx usage in long sessions (>5 min), Low adoption (<30%), Usage dropped (>3 min gap)
  - Shows session stats: duration, devctx operations, estimated total, adoption rate
  - Estimates potential token savings per opportunity
  - Provides actionable suggestions: forcing prompt, check index, verify MCP
  - Severity levels: 🔴 High (no usage), 🟡 Medium (low adoption, dropped)
  - Session-scoped tracking (resets on MCP server restart)
  - Heuristic-based: estimates total operations from time gaps (can't intercept native tools)
  - New module: `src/missed-opportunities.js` with detection and formatting functions
  - New tests: `tests/missed-opportunities.test.js` (11 tests covering all scenarios)
  - Integrated into all major tools after `persistMetrics()`
  - New doc: `docs/missed-opportunities.md` with complete guide
  - Updated: `README.md` and `tools/devctx/README.md` with missed opportunities section
  - Goal: Identify adoption gaps, quantify potential savings, validate forcing prompts
  - Benefits: Detect when agent switches to native tools, see missed savings, verify rules working
  - Disabled by default to avoid false positives
  - Can combine with usage feedback and decision explainer for maximum visibility
  - Limitations: Total operations estimated (not measured), may have false positives, session-scoped only

- **Decision Explainer System:**
  - New decision explainer provides transparency into agent decision-making
  - Explains why devctx tools were used, what alternatives were considered, and expected benefits
  - Enable with `export DEVCTX_EXPLAIN=true`
  - Tracks smart_read, smart_search, smart_context, smart_shell, smart_summary
  - Shows reasoning: "Why was smart_read used instead of Read?"
  - Shows expected benefits: "~45.0K tokens saved"
  - Shows context: "2500 lines, 50000 tokens → 5000 tokens"
  - Predefined reasons for consistency (LARGE_FILE, INTENT_AWARE, TASK_CONTEXT, etc.)
  - Predefined benefits for consistency (TOKEN_SAVINGS, BETTER_RANKING, COMPLETE_CONTEXT, etc.)
  - Session-scoped tracking (resets on MCP server restart)
  - New module: `src/decision-explainer.js` with tracking and formatting functions
  - New tests: `tests/decision-explainer.test.js` (11 tests covering all scenarios)
  - Integrated into all major tools after `persistMetrics()`
  - New doc: `docs/decision-explainer.md` with complete guide
  - Updated: `README.md` and `tools/devctx/README.md` with decision explainer section and examples
  - Goal: Provide transparency to understand agent decisions, learn best practices, debug tool selection
  - Benefits: Understand why tools were chosen, learn when to use which tool, validate agent behavior
  - Disabled by default to avoid verbose output
  - Can combine with usage feedback for maximum visibility

- **Real-Time Usage Feedback:**
  - New usage feedback system provides immediate visibility into devctx tool usage
  - Shows which tools were used, call counts, and tokens saved at end of agent responses
  - **Auto-enabled for first 10 tool calls (onboarding mode)**, then auto-disables
  - Manual control: `export DEVCTX_SHOW_USAGE=true` (keep enabled) or `false` (disable immediately)
  - Tracks smart_read, smart_search, smart_context, smart_shell, smart_summary
  - Automatic aggregation of multiple calls to same tool
  - Smart formatting of token counts (K/M) and target paths
  - Session-scoped tracking (resets on MCP server restart)
  - Onboarding message shows remaining calls: `*Onboarding mode: showing for N more tool calls*`
  - New module: `src/usage-feedback.js` with tracking, formatting, and onboarding logic
  - New tests: `tests/usage-feedback.test.js` (14 tests covering all scenarios including onboarding)
  - Integrated into all major tools after `persistMetrics()`
  - New doc: `docs/usage-feedback.md` with complete guide
  - Updated: `README.md` and `tools/devctx/README.md` with usage feedback section and examples
  - Goal: Provide real-time visibility to verify agent is using devctx, debug adoption issues, measure impact
  - Benefits: Know immediately if devctx is used, see savings in real-time, validate forcing prompts
  - Onboarding mode ensures new users see feedback without manual configuration

- **Adoption Metrics (Experimental):**
  - New adoption analytics to measure how often devctx is actually used in practice
  - Analyzes sessions with/without devctx tools, adoption rate by inferred complexity
  - Tracks tool usage count, average tools per session, token savings when used
  - Integrated into `npm run report:metrics` output
  - Honest limitations: complexity inferred (not actual), can't measure feedback or forcing prompts
  - New module: `src/analytics/adoption.js` with `analyzeAdoption()` and `formatAdoptionReport()`
  - New tests: `tests/adoption-analytics.test.js` (9 tests covering all scenarios)
  - Updated: `src/tools/smart-metrics.js` to include adoption analysis
  - Updated: `scripts/report-metrics.js` to display adoption report
  - Updated: `README.md` with adoption metrics section and example output
  - New doc: `docs/adoption-metrics-design.md` with complete design rationale
  - Goal: Complement compression metrics with usage metrics, verify rules are working
  - Limitations: Can only measure when devctx IS used (tool calls visible), not when ignored

- **Adoption Improvements Phase 2:**
  - Added "Quick Start: Which Client Should I Use?" table in README with automaticity levels and recommendations
  - Added "How to Force devctx Usage" section with official prompts (complete + ultra-short)
  - Added 3 concrete feedback examples to docs/agent-rules/feedback-when-not-used.md
  - Enhanced Troubleshooting section with forcing prompt and index check
  - Goal: Make adoption easier, provide standardized forcing prompts, show concrete examples
  - New doc: docs/adoption-improvements-phase2.md with complete analysis

### Changed
- **Quality Claim Further Matization (Phase 2):**
  - Changed "Responses are often faster and more context-efficient" to "Token usage drops 85-90% (proven, measured) + Responses often faster due to less data to process (inferred)"
  - Expanded "Honest claim" to explicitly separate: What's proven (90% tokens) | What's inferred (quality) | What we don't control (accuracy)
  - Added "can help" instead of "can improve" (more conservative)
  - Goal: Maximum honesty, clear separation of proven vs inferred, manage expectations
  - Updated: README.md (best case scenario, honest claim section)

- **Quality Claim Final Matization:**
  - Changed "Responses are faster and more focused on relevant context" to "Responses are often faster and more context-efficient"
  - Added qualifier "often" to acknowledge variability (not always)
  - Changed "focused" to "context-efficient" (more precise, describes mechanism)
  - Added explicit disclaimer: "Responses will NOT be 'more accurate' (accuracy depends on agent, not just context)"
  - Added honest claim: "We provide better context, which CAN improve response quality in complex tasks when the agent follows the workflow"
  - Separated proven (token savings 90%) from inferred (quality improvement)
  - Goal: Manage expectations, reduce risk of disappointment, align marketing with evidence
  - Updated: `README.md` (best case scenario wording, "What 'Better Context' Means" section)
  - New doc: `docs/agent-rules/quality-claim-final-matization.md` with evolution analysis and rationale

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
- **Preflight Visibility (build_index Prominence):**
  - New preflight line in base rule: "First time in project? Run build_index to enable search/context quality."
  - New README section: "⚠️ Preflight: Build Index First" with clear without/with comparison
  - Updated workflow: Added Step 0 (build_index) before Step 1 (smart_turn)
  - Changed "Day 1" to "Getting Started" with emphasis on index being REQUIRED for quality
  - Without index: smart_search has no ranking, smart_context has no graph, quality degraded, agent prefers native tools
  - With index: ranked search, optimal context, 90% token savings enabled
  - Impact: Prevents most common setup failure, ensures quality from first use
  - Fixed context cost: +1 line (13 → 14 lines, still 66% smaller than original 42 lines)
  - Goal: Make index build impossible to miss, prevent quality degradation, maximize token savings
  - Updated: `.cursor/rules/devctx.mdc`, `tools/devctx/agent-rules/base.md`, `tools/devctx/agent-rules/compact.md`, `tools/devctx/scripts/init-clients.js`, `README.md`
  - New doc: `docs/agent-rules/preflight-visibility.md` with rationale, scenarios, and expected behavior

- **Feedback When devctx Not Used:**
  - New rule: Agent adds note when not using devctx tools in non-trivial programming tasks
  - Feedback format: "Note: devctx not used because: [reason]. To use devctx next time: [prompt]"
  - Allowed reasons (constrained): task too simple | MCP unavailable | index not built | already had sufficient context | native tool more direct
  - Forcing prompt: "Use smart-context-mcp: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)"
  - Impact: Makes non-usage visible, educates users, increases adoption, identifies setup issues
  - Fixed context cost: +3 lines (10 → 13 lines, still 68% smaller than original 42 lines)
  - Goal: Maximize adoption by making ignoring devctx rare, visible, and easy to correct
  - Updated: `.cursor/rules/devctx.mdc`, `tools/devctx/agent-rules/base.md`, `tools/devctx/agent-rules/compact.md`, `tools/devctx/scripts/init-clients.js`
  - New doc: `docs/agent-rules/feedback-when-not-used.md` with rationale, examples, and expected behavior

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
