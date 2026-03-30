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

**Workflow-level savings:**
- Debugging: 150K → 15K tokens (90% savings)
- Code Review: 200K → 25K tokens (87% savings)
- Refactoring: 180K → 20K tokens (89% savings)
- Testing: 120K → 12K tokens (90% savings)
- Architecture: 300K → 30K tokens (90% savings)

See [Workflow Metrics](./docs/workflow-metrics.md) for complete workflows.

## Why it exists

AI agents waste tokens in three ways:

1. **Reading full files** when they only need structure or specific functions
2. **Massive search results** with hundreds of irrelevant matches
3. **Repeating context** across conversation turns

This MCP solves all three by providing tools that return compressed, ranked, and cached context.

## Recommended Workflow

### The Entry Point: `smart_turn(start)`

For **non-trivial tasks** (debugging, review, refactor, testing, architecture), the optimal flow is:

```
1. smart_turn(start, userPrompt, ensureSession=true)
   ↓ recovers previous context, classifies task, checks repo safety
   
2. smart_context(...) or smart_search(intent=...)
   ↓ builds context or finds relevant code
   
3. smart_read(mode=outline|signatures|symbol)
   ↓ reads compressed, cascades to full only if needed
   
4. [work: make changes, analyze, review]
   
5. smart_shell('npm test')
   ↓ verifies changes safely
   
6. smart_turn(end, event=milestone|blocker|task_complete)
   ↓ checkpoints progress for recovery
```

**Why start with `smart_turn`?**
- ✅ Recovers previous task checkpoint (goal, status, decisions)
- ✅ Classifies task continuation vs new task
- ✅ Provides repo safety check
- ✅ Enables task recovery if interrupted
- ✅ Tracks metrics for optimization

**When to skip `smart_turn`:**
- ❌ Trivial tasks (read single file, simple search)
- ❌ One-off questions (no continuity needed)
- ❌ Quick diagnostics (no session context)

---

## How it Works in Practice

### The Reality

This MCP **does not intercept** your prompts magically. Here's what actually happens:

1. **You write a prompt:** "Fix the login bug"
2. **Agent reads rules:** Sees debugging workflow suggestion
3. **Agent decides:** "This is a debugging task, I'll start with `smart_turn(start)`"
4. **Agent calls:** `smart_turn({ phase: 'start', userPrompt: '...', ensureSession: true })`
5. **MCP returns:** Previous task checkpoint (if exists) + repo safety check
6. **Agent continues:** Calls `smart_search(intent=debug)` for error location
7. **Agent reads:** Calls `smart_read(mode=symbol)` for specific function
8. **Agent fixes bug:** Makes changes
9. **Agent verifies:** Calls `smart_shell('npm test')`
10. **Agent checkpoints:** Calls `smart_turn(end)` to persist progress

**Key points:**
- ✅ Agent **chooses** to use devctx tools (not forced)
- ✅ Rules **guide** the agent (not enforce)
- ✅ `smart_turn(start)` is **recommended entry point** for non-trivial tasks
- ✅ Agent can skip workflow for trivial tasks
- ✅ You control nothing directly—the agent decides

### What You Get

**Tools (12):** Efficient alternatives to built-in operations
- `smart_read` - Compressed file reading (outline, signatures, symbol)
- `smart_search` - Intent-aware code search with ranking
- `smart_context` - One-call context builder with graph
- `smart_shell` - Safe diagnostic commands
- `smart_turn` - Session persistence
- And 7 more

**Rules (5 profiles):** Task-specific workflows
- Debugging: Error-first, symbol-focused
- Code Review: Diff-aware, API-focused
- Refactoring: Graph-aware, test-verified
- Testing: Coverage-aware, TDD-friendly
- Architecture: Index-first, minimal-detail

**Storage (`.devctx/`):** Local context database
- `index.json` - Symbol index (functions, classes, imports)
- `state.sqlite` - Sessions, metrics, patterns (Node 22+)
- `metrics.jsonl` - Legacy fallback (Node 18-20)

### Persistent Task Context (When Supported)

**What gets persisted:**
- Task checkpoints (goal, status, decisions, blockers)
- File access patterns (for prediction)
- Token metrics (for optimization)
- Session summaries (~100 tokens compressed)

**When it's consulted:**
- Agent calls `smart_turn(start)` - Recovers task checkpoint
- Agent calls `smart_context` - Uses patterns for prediction
- Agent calls `smart_summary` - Gets task summary

**What is NOT persisted:**
- ❌ Full conversation transcript
- ❌ Complete message history
- ❌ Agent reasoning or thoughts
- ❌ User prompts verbatim

**Limitations:**
- Only works if agent calls `smart_turn` (not automatic)
- Only persists within project (`.devctx/` is local)
- Only recovers if session ID matches (manual or auto)
- Client must support MCP (Cursor, Codex, Claude Desktop, Qwen)

**Honest truth:** Task context persistence is **opt-in** via agent behavior, not **automatic** via client interception.

### What This Means for You

**Best case scenario:**
- Agent follows rules consistently
- Uses devctx tools for 50-80% of operations
- Token usage drops 85-90%
- Responses are faster and more focused on relevant context

**Typical scenario:**
- Agent uses devctx tools for complex tasks
- Uses built-in tools for simple tasks
- Token usage drops 60-80%
- Noticeable improvement in efficiency

**Worst case scenario:**
- Agent ignores rules (rare but possible)
- Uses built-in tools exclusively
- Token usage unchanged
- No harm done (MCP is passive)

**You can check:** `npm run report:metrics` shows actual tool usage.

### What "Better Context" Means

**What we improve:**
- ✅ Context relevance (right files for the task)
- ✅ Signal-to-noise ratio (less boilerplate, more signal)
- ✅ Context efficiency (more relevant info in less space)
- ✅ Response speed (less data to process)

**What we don't guarantee:**
- ❌ Agent will always be correct
- ❌ Responses will be perfect
- ❌ Tasks will always succeed

**The benefit:** Agents work with better input, but output quality still depends on agent capability and task complexity.

---

## Workflow Examples

### Debugging

```javascript
// 1. Start session
smart_turn({ 
  phase: 'start', 
  userPrompt: 'TypeError: Cannot read property "user" of undefined',
  ensureSession: true 
})
// → Recovers: "Last worked on auth system, checked validateToken()"

// 2. Find error
smart_search({ 
  query: 'TypeError user undefined',
  intent: 'debug'
})
// → Returns: src/auth.js (error handling), src/routes/login.js (recent change)

// 3. Read structure
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'signatures'
})
// → Returns: loginHandler, validateCredentials, generateToken

// 4. Extract failing function
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'symbol',
  symbol: 'loginHandler'
})
// → Returns: Full function code (250 tokens vs 5K for full file)

// 5. Reproduce error
smart_shell({ command: 'npm test -- login.test.js' })
// → Returns: Test failure output

// [Fix bug]

// 6. Verify fix
smart_shell({ command: 'npm test -- login.test.js' })
// → Returns: Tests pass

// 7. Checkpoint
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed TypeError in loginHandler - null check added',
  nextStep: 'Consider adding integration tests'
})
```

**Token usage:** 150K → 15K (90% savings)

---

### Code Review

```javascript
// 1. Start session
smart_turn({ 
  phase: 'start',
  userPrompt: 'Review PR #123 - Add JWT refresh token support',
  ensureSession: true
})

// 2. Get changed files context
smart_context({ 
  diff: true,
  detail: 'moderate'
})
// → Returns: Changed files with graph, prioritizes API surface

// 3. Review API surface
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'signatures'
})
// → Returns: Exported functions only

// 4. Check implementation
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbol: 'refreshToken'
})

// 5. Check authorship
git_blame({ 
  mode: 'symbol',
  filePath: 'src/auth.js'
})
// → Returns: Who wrote each function

// 6. Verify tests
smart_shell({ command: 'npm test' })

// 7. Checkpoint
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'PR #123 approved - JWT refresh implemented correctly',
  nextStep: 'Monitor production metrics after deploy'
})
```

**Token usage:** 200K → 25K (87% savings)

---

### Refactoring

```javascript
// 1. Start session
smart_turn({ 
  phase: 'start',
  userPrompt: 'Extract authentication logic into separate service',
  ensureSession: true
})

// 2. Build dependency graph
smart_context({ 
  entryFile: 'src/routes/login.js',
  detail: 'moderate'
})
// → Returns: Dependencies, imports, exports

// 3. Understand current structure
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'signatures'
})

// 4. Extract target function
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'symbol',
  symbol: 'validateCredentials'
})

// 5. Check authorship
git_blame({ 
  mode: 'symbol',
  filePath: 'src/routes/login.js'
})

// [Refactor: create src/services/auth.js, move logic]

// 6. Verify tests still pass
smart_shell({ command: 'npm test' })

// 7. Checkpoint
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Extracted auth logic to AuthService - tests pass',
  nextStep: 'Update other routes to use AuthService'
})
```

**Token usage:** 180K → 20K (89% savings)

---

### Testing

```javascript
// 1. Start session
smart_turn({ 
  phase: 'start',
  userPrompt: 'Write tests for validateToken function',
  ensureSession: true
})

// 2. Find existing test patterns
smart_search({ 
  query: 'validateToken test',
  intent: 'tests'
})
// → Returns: Existing test files, test patterns

// 3. Read function to test
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbol: 'validateToken'
})

// 4. Understand dependencies
smart_context({ 
  entryFile: 'src/auth.js',
  detail: 'minimal'
})
// → Returns: Dependencies (jwt, bcrypt, db)

// [Write test]

// 5. Run tests
smart_shell({ command: 'npm test -- auth.test.js' })

// 6. Checkpoint
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Added 5 tests for validateToken - all pass',
  nextStep: 'Add edge case tests for expired tokens'
})
```

**Token usage:** 120K → 12K (90% savings)

---

### Architecture Exploration

```javascript
// 1. Start session
smart_turn({ 
  phase: 'start',
  userPrompt: 'Understand how authentication works in this codebase',
  ensureSession: true
})

// 2. Get high-level overview
smart_context({ 
  detail: 'minimal'
})
// → Returns: Project structure, key modules

// 3. Find auth-related code
smart_search({ 
  query: 'authentication authorization',
  intent: 'explore'
})
// → Returns: Ranked files by relevance

// 4. Review API surface
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'signatures'
})
// → Returns: Exported functions only

// 5. Check cross-project patterns (if monorepo)
cross_project({ 
  mode: 'search',
  query: 'AuthService'
})
// → Returns: Similar auth patterns in other projects

// 6. Checkpoint
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Auth uses JWT with 1h expiry, refresh tokens in Redis',
  nextStep: 'Document auth flow in architecture.md'
})
```

**Token usage:** 300K → 30K (90% savings)

---

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

**When to use:** Once after checkout, or after major changes. Improves search ranking and context relevance.

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

Maintain compressed task state across sessions.

```javascript
// Save checkpoint
{ action: 'update', update: { goal: '...', status: 'in_progress', nextStep: '...' }}

// Resume later
{ action: 'get' }
```

Compresses task context to ~100 tokens (goal, status, decisions, blockers). Critical for long tasks.

---

### smart_turn

Orchestrate turn start/end with automatic task checkpoint recovery.

```javascript
{ phase: 'start', prompt: '...' }  // Recovers task checkpoint
{ phase: 'end', event: 'milestone', update: {...} }  // Saves checkpoint
```

Recovers task state (goal, status, decisions, next step), not full conversation history.

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

## Client Compatibility

| Client | MCP | Rules | Hooks | `smart_turn` | Persistence | Near-Automatic | Key Limitations |
|--------|-----|-------|-------|--------------|-------------|----------------|-----------------|
| **Cursor** | ✅ Full | ✅ Conditional<br>(`.cursor/rules/*.mdc`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Medium**<br>Agent decides when | • No auto `smart_turn`<br>• Agent must follow rules<br>• Requires Agent mode |
| **Claude Desktop** | ✅ Full | ✅ Embedded<br>(`CLAUDE.md`) | ✅ SessionStart<br>PostToolUse<br>Stop | ✅ Can auto-trigger<br>via hooks | ✅ SQLite<br>(Node 22+) | 🟢 **High**<br>Hooks auto-trigger | • Hooks are opt-in<br>• No conditional rules<br>• Fixed context: 200t |
| **Codex CLI** | ✅ Full | ✅ Embedded<br>(`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Low-Medium**<br>Agent decides when | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |
| **Qwen Code** | ✅ Full | ✅ Embedded<br>(`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Low-Medium**<br>Agent decides when | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |

**Legend:**
- 🟢 High: Hooks can auto-trigger tools at specific moments
- 🟡 Medium/Low: Agent reads rules and decides when to use tools
- ✅ Supported | ⚠️ Partial | ❌ Not supported

---

### What "Near-Automatic" Means

**🟢 High (Claude Desktop with hooks):**
- Hooks can auto-trigger `smart_turn(start)` when you start a session
- Hooks can auto-checkpoint after significant tool use
- Agent still decides which devctx tools to use for each task
- **This is the closest to "automatic" behavior available**

**🟡 Medium (Cursor):**
- Agent reads base rules automatically (always active, 150 tokens)
- Conditional profiles activate based on file globs (debugging, review, etc.)
- Agent decides when to use devctx tools based on task
- Agent must manually call `smart_turn` (not auto-triggered)

**🟡 Low-Medium (Codex, Qwen):**
- Agent reads embedded rules automatically (always active, 200 tokens)
- Agent decides when to use devctx tools based on task
- Agent must manually call `smart_turn` (not auto-triggered)
- No conditional activation or hooks

---

### What "Near-Automatic" Does NOT Mean

❌ **Not automatic prompt interception** - MCP cannot intercept or modify your prompts before the agent sees them  
❌ **Not forced tool usage** - Agent always has autonomy to decide which tools to use  
❌ **Not guaranteed workflow** - Agent may skip devctx tools for simple tasks (this is fine)  
❌ **Not client-level magic** - Behavior depends on agent following rules and making good decisions

---

### The Reality

**All clients work the same way:**
1. Agent reads rules (guidance about when devctx tools are useful)
2. Agent decides tool usage (autonomy to choose best approach)
3. MCP provides tools (passive, only responds when called)
4. You verify with metrics (`npm run report:metrics`)

**The differences:**
- **Hooks** (Claude Desktop) can auto-trigger specific tools at specific moments (e.g., `smart_turn(start)` on session start)
- **Conditional rules** (Cursor) reduce fixed context cost and activate task-specific profiles when relevant
- **Embedded rules** (Codex, Qwen) are simple, always active, and work everywhere

---

### Which Client Should I Use?

**Choose Cursor if:**
- ✅ You want lowest fixed context cost (150 tokens base + 120 tokens profile when active)
- ✅ You work on complex, multi-file tasks (debugging, refactoring, architecture)
- ✅ You want conditional rules that activate based on file patterns

**Choose Claude Desktop if:**
- ✅ You want closest to "automatic" behavior (hooks can auto-trigger `smart_turn`)
- ✅ You want session-aware workflows with automatic checkpointing
- ✅ You're okay with opt-in hook configuration

**Choose Codex or Qwen if:**
- ✅ You want simple, embedded rules (no separate config files)
- ✅ You prefer lightweight setup (single `AGENTS.md` file)
- ✅ You're okay with manual `smart_turn` calls and no conditional activation

**Bottom line:** All clients work well. The choice depends on your preference for automation level vs simplicity.

See [Client Compatibility Guide](./docs/client-compatibility.md) for detailed comparison.

---

## Installation

### Minimal (Any Client)

```bash
npm install -g smart-context-mcp
npx smart-context-init --target .
```

Restart your AI client. Done.

---

### Cursor

```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients cursor
```

Restart Cursor. Tools appear in Agent mode.

**Files created:**
- `.cursor/mcp.json` - MCP server config
- `.cursor/rules/devctx.mdc` - Agent rules
- `.git/hooks/pre-commit` - Safety hook
- `.gitignore` - Adds `.devctx/`

---

### Codex CLI

```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients codex
```

Restart Codex.

**Files created:**
- `.codex/config.toml` - MCP server config
- `AGENTS.md` - Agent rules
- `.git/hooks/pre-commit` - Safety hook
- `.gitignore` - Adds `.devctx/`

---

### Claude Desktop

```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients claude
```

Restart Claude Desktop.

**Files created:**
- `.mcp.json` - MCP server config
- `.claude/settings.json` - Hook config
- `CLAUDE.md` - Agent rules
- `.git/hooks/pre-commit` - Safety hook
- `.gitignore` - Adds `.devctx/`

---

### Qwen Code

```bash
npm install -g smart-context-mcp
npx smart-context-init --target . --clients qwen
```

Restart Qwen Code.

**Files created:**
- `.qwen/settings.json` - MCP server config
- `AGENTS.md` - Agent rules
- `.git/hooks/pre-commit` - Safety hook
- `.gitignore` - Adds `.devctx/`

## Agent Rules: The Secret Sauce

What makes this MCP different is **task-specific agent guidance**. Installation generates rules that teach agents optimal workflows:

### Debugging Profile
```
smart_turn(start) → smart_search(intent=debug) → smart_read(symbol) → 
smart_shell('npm test') → fix → smart_turn(end)
```
**Savings:** 90% (150K → 15K tokens)

### Code Review Profile
```
smart_turn(start) → smart_context(diff=true) → smart_read(signatures) → 
review → smart_turn(end)
```
**Savings:** 87% (200K → 25K tokens)

### Refactoring Profile
```
smart_turn(start) → smart_context(entryFile) → smart_read(signatures) → 
refactor → smart_shell('npm test') → smart_turn(end)
```
**Savings:** 89% (180K → 20K tokens)

### Testing Profile
```
smart_turn(start) → smart_search(intent=tests) → smart_read(symbol) → 
write test → smart_shell('npm test') → smart_turn(end)
```
**Savings:** 90% (120K → 12K tokens)

### Architecture Profile
```
smart_turn(start) → smart_context(detail=minimal) → smart_read(signatures) → 
analyze → smart_turn(end)
```
**Savings:** 90% (300K → 30K tokens)

**Key insight:** The value isn't just in the tools—it's in teaching agents **when** and **how** to use them.

See [agent-rules/](./tools/devctx/agent-rules/) for complete profiles.

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

### Check it's working

```bash
npm run report:metrics
```

**Good signs:**
- Tool usage > 0 (agent using devctx)
- Savings 60-90% (compression working)
- Multiple tools used (workflows followed)

**Bad signs:**
- Tool usage = 0 (agent not using devctx)
- Check: Rules installed? MCP running? Task complexity?

**Example output:**

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
npm test        # Unit tests (435 tests)
npm run eval    # Synthetic corpus
npm run eval:self  # Real project
```

## Troubleshooting

### Agent not using devctx tools

**Check:**
```bash
# 1. Rules installed?
cat .cursor/rules/devctx.mdc

# 2. MCP running?
# Cursor: Settings → MCP → Check "smart-context" active

# 3. Metrics show usage?
npm run report:metrics
```

**Possible causes:**
- Rules not installed → Run `npx smart-context-init --target .`
- MCP not running → Restart client
- Task too simple → Built-in tools sufficient (this is fine)
- Agent in Ask mode → Read-only, no MCP access

---

### Enable Workflow Tracking

To track complete workflows (debugging, review, refactor, testing, architecture):

```bash
export DEVCTX_WORKFLOW_TRACKING=true
```

Then restart your AI client. View workflow metrics:

```bash
npm run report:workflows -- --summary
```

See [Workflow Metrics](./docs/workflow-metrics.md) for details.

---

### High token usage despite devctx

**Check:**
```bash
npm run report:metrics
```

**Look for:**
- Low tool usage (< 20% of operations)
- High `full` mode usage (agent not cascading)
- Low compression ratios (< 50%)

**Possible causes:**
- Agent not following workflows
- Task doesn't benefit from compression
- Rules unclear for this task type

---

### Context not persisting

**Check:**
```bash
# 1. Node version (need 22+ for SQLite)
node --version

# 2. SQLite exists?
ls -lh .devctx/state.sqlite

# 3. Agent calling smart_turn?
sqlite3 .devctx/state.sqlite "SELECT COUNT(*) FROM sessions"
```

**Possible causes:**
- Node 18-20 → No SQLite (upgrade to 22+)
- Agent not calling `smart_turn` → No task checkpoints
- Session ID mismatch → Can't recover checkpoint

---

### Rules not applied

**Check:**
```bash
cat .cursor/rules/devctx.mdc  # or AGENTS.md, CLAUDE.md
```

**If missing:**
```bash
npx smart-context-init --target .
```

**If exists but agent ignores:**
- This is expected (rules are guidance, not enforcement)
- Agent decides based on task
- Check metrics to see actual usage

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
- [Workflow Metrics](./docs/workflow-metrics.md) - Complete workflow savings

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
