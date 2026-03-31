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

## Quick Start: Which Client Should I Use?

### 🎯 Best Default: Cursor

**Use if:** You work in Cursor IDE and want the best balance of guidance and flexibility.

**Workflow:**
```
1. Install MCP → rules auto-load
2. Start task → agent reads .cursorrules
3. Agent decides when to use devctx
4. Use /prompt commands to force usage if needed
```

**Automaticity:** Medium - Rules guide the agent, but it decides based on task complexity.

---

### 🔄 Best Continuity: Claude Desktop

**Use if:** You want highest session continuity with automatic context recovery.

**Workflow:**
```
1. Install MCP + hooks
2. Start task → hook auto-triggers smart_turn(start)
3. Work with devctx tools
4. End task → hook auto-triggers smart_turn(end)
```

**Automaticity:** High (with hooks) - Can auto-trigger `smart_turn` on session start/end.

---

### 💻 Best Terminal: Codex CLI / Qwen Code

**Use if:** You prefer terminal-based workflows or scripting.

**Workflow:**
```
1. Install MCP
2. Rules embedded in prompts
3. Agent reads rules, decides when to use
4. Explicit instructions work best
```

**Automaticity:** Low-Medium - Rules are visible but require explicit prompting.

---

### 📊 Quick Comparison

| Client | Automaticity | smart_turn Value | Best Use Case |
|--------|--------------|------------------|---------------|
| **Cursor** | Medium | High | Complex IDE tasks, conditional workflows |
| **Claude Desktop** | High (hooks) | Very High | Session continuity, auto-recovery |
| **Codex CLI** | Low-Medium | Medium | Terminal workflows, scripting |
| **Qwen Code** | Low-Medium | Medium | Alternative to Cursor |

### ⚠️ What "Automaticity" Does NOT Mean

- ❌ Automatic prompt interception (none of these clients do this)
- ❌ Forced tool usage (agent always decides)
- ❌ Guaranteed adoption (agent may ignore rules if task seems simple)

The agent **always decides** whether to use devctx. Rules increase the probability, but don't guarantee it.

---

**📖 Detailed Setup:** See [Client Compatibility](./docs/client-compatibility.md) for installation instructions per client.

---

## 🚀 How to Invoke the MCP

The MCP doesn't intercept prompts automatically. **You need to tell the agent to use it.**

### Option 1: Use MCP Prompts (Easiest)

In Cursor, type in the chat:

```
/prompt use-devctx

[Your task here]
```

**Available prompts:**
- `/prompt use-devctx` - Force devctx tools for current task
- `/prompt devctx-workflow` - Full workflow (start → context → work → end)
- `/prompt devctx-preflight` - Preflight only (build_index + smart_turn start)

### Option 2: Explicit Instruction

Just tell the agent directly:

```
Use smart_turn(start) to recover context, then [your task]
```

Or:

```
Use the MCP to review this code
```

### Option 3: Automatic (via Rules)

The agent *should* use devctx automatically for complex tasks because:
- ✅ `.cursorrules` is active in Cursor
- ✅ `CLAUDE.md` is active in Claude Desktop (if you created it)
- ✅ `AGENTS.md` is active in other clients (if you created it)

**But it's not guaranteed** - the agent decides based on task complexity.

### ⚡ Quick Reference

| Scenario | Command |
|----------|---------|
| Start new task | `/prompt devctx-workflow` |
| Continue previous task | `smart_turn(start) and continue` |
| Force MCP usage | `/prompt use-devctx` |
| First time in project | `/prompt devctx-preflight` |
| Trust automatic rules | Just describe your task normally |

---

## ⚠️ If the Agent Ignored devctx

If the agent didn't use devctx for a complex task, **paste this in your next message:**

### Short Prompt (Recommended)

```
Use smart-context-mcp for this task.
Start with smart_turn(start), then use smart_context or smart_search before reading full files.
End with smart_turn(end) if you make progress.
```

### Ultra-Short

```
Use devctx: smart_turn(start) → smart_context → smart_turn(end)
```

### When to Use This

- The agent read multiple large files with native `Read` tool
- The agent used `Grep` repeatedly instead of `smart_search`
- You see no devctx tools in the response
- The task was clearly non-trivial (debugging, refactoring, multi-file work)

**Why this happens:**
- Task seemed too simple to the agent
- No index built yet (run `build_index` first)
- Native tools appeared more direct
- Rules weren't strong enough for this specific task

---

## Recommended Workflow

### ✅ Setup Checklist (First Time in Project)

Before starting complex tasks, ensure:

```bash
# 1. MCP is installed
npm list -g smart-context-mcp  # or check your MCP client

# 2. Build the index (IMPORTANT)
npm run build-index
# or tell the agent: "Run build_index tool"

# 3. Rules are active
# - Cursor: .cursorrules exists
# - Claude Desktop: CLAUDE.md exists
# - Other clients: AGENTS.md exists

# 4. Start with smart_turn
# Tell the agent: "Use smart_turn(start) to begin"
```

**Copy-paste to agent (first time):**
```
Run build_index, then use smart_turn(start) to begin this task.
```

---

### ⚠️ Why Index Matters

**Without index:**
- ❌ `smart_search` returns unranked results
- ❌ `smart_context` can't build optimal context
- ❌ Agent may prefer native tools → no savings

**With index:**
- ✅ `smart_search` ranks by relevance
- ✅ `smart_context` includes related files
- ✅ 90% token savings enabled

**When to rebuild:**
- ✅ First time in project
- ✅ After major refactors (file moves, renames)
- ✅ After adding many new files
- ❌ Not needed every session (index persists in `.devctx/`)

---

### The Entry Point: `smart_turn(start)`

For **non-trivial tasks** (debugging, review, refactor, testing, architecture), the optimal flow is:

```
0. build_index (if first time in project)
   ↓ enables search ranking and context quality
   
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
- Token usage drops 85-90% (proven, measured)
- Responses often faster due to less data to process (inferred from token savings)

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
- ❌ Responses will be "more accurate" (accuracy depends on agent, not just context)

**The benefit:** Agents work with better input, but output quality still depends on agent capability and task complexity.

**Honest claim:** We provide **better context** (more relevant, less noise), which **can help** agents respond more efficiently in complex tasks when the workflow is followed. 

**What's proven:** 90% token savings (measured across 3,666 operations).  
**What's inferred:** Quality improvement (better input → potentially better output, but not explicitly measured).  
**What we don't control:** Agent correctness, task success, response accuracy.

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

**Smart pattern detection:** Automatically detects literal patterns in your task (TODO, FIXME, /**, console.log, debugger) and prioritizes them in search results.

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
// Save checkpoint (flat API - recommended)
{ action: 'update', goal: '...', status: 'in_progress', nextStep: '...' }

// Or nested format (backward compatible)
{ action: 'update', update: { goal: '...', status: 'in_progress', nextStep: '...' }}

// Resume later
{ action: 'get' }
```

Compresses task context to ~100 tokens (goal, status, decisions, blockers). Critical for long tasks. Supports both flat and nested formats.

---

### smart_status

Display current session context with progress visibility.

```javascript
{ format: 'detailed' }  // Full formatted output with emojis
{ format: 'compact' }   // Minimal JSON
```

Shows goal, status, recent decisions, touched files, pinned context, and progress stats. Updates automatically with each MCP operation.

---

### smart_edit

Batch edit multiple files with pattern replacement.

```javascript
{
  pattern: 'console.log',
  replacement: 'logger.info',
  files: ['src/a.js', 'src/b.js'],
  mode: 'literal'  // or 'regex'
}
```

Supports `dryRun: true` for preview. Useful for bulk refactoring, removing patterns, or renaming across files.

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

### Step 1: Install the MCP Server

#### Minimal (Any Client)

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
- `.cursor/rules/devctx.mdc` - Base agent rules (10 lines, always active)
- `.cursor/rules/profiles-compact/*.mdc` - Task profiles (conditional)
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

---

### Step 2: Set Up Agent Rules (Recommended)

To ensure agents use devctx automatically, set up client-specific rules:

#### Cursor Users

Already included: `.cursorrules` is committed in the project.

**Verify it's working:**
- Agent should mention devctx usage policy
- Agent should use devctx tools automatically

#### Claude Desktop Users

Create `CLAUDE.md` in your project root:

```bash
# Copy template
cp docs/agent-rules-template.md CLAUDE.md
# Edit to keep only the CLAUDE.md section
```

Or copy the content from `docs/agent-rules-template.md`.

#### Other Agent Clients

Create `AGENTS.md` in your project root using the same template.

**Why these rules matter:**
- ✅ Agents use devctx automatically (no manual forcing)
- ✅ Consistent behavior across all clients
- ✅ Visible feedback when devctx is used
- ✅ Warnings when devctx should be used but isn't

See [Agent Rules Template](./docs/agent-rules-template.md) for complete setup.

---

### Feedback When Not Used

If the agent doesn't use devctx tools in a non-trivial task, it will add a note:

```
Note: devctx not used because: [reason]
To use devctx next time: "Use smart-context-mcp: smart_turn(start) → ..."
```

**Why this matters:**
- Makes non-usage visible
- Educates about when devctx adds value
- Provides forcing prompt for next turn
- Identifies setup issues (MCP unavailable, index not built)

---

### How to Force devctx Usage

**When to use these prompts:**
- Agent didn't use devctx in a non-trivial task
- You want to recover persisted task context
- Task is complex (debugging, review, refactor, testing, architecture)

**Official prompt (complete workflow):**
```
Use smart-context-mcp for this task:
1. Start with smart_turn(start, userPrompt, ensureSession=true) to recover context
2. Use smart_context or smart_search before reading files
3. Use smart_read(outline|signatures|symbol) instead of full reads
4. Close with smart_turn(end) when you reach a milestone
```

**Ultra-short prompt (copy-paste ready):**
```
Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)
```

**Example usage:**
```
User: "Debug the authentication error"
Agent: [uses native tools]
Agent: "Note: devctx not used because: already had sufficient context..."

User: "Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)"
Agent: [uses smart_turn, smart_search, smart_read]
Agent: "Found the issue in validateToken()..."
```

See [agent-rules/](./tools/devctx/agent-rules/) for complete profiles.

## Getting Started

### Day 1: Install + Build Index (Critical)

1. **Install:**
   ```bash
   npm install smart-context-mcp
   npx smart-context-init --target .
   ```

2. **Build index (REQUIRED for quality):**
   ```bash
   npm run build-index
   # or tell agent: "Run build_index tool"
   ```
   
   **Why critical:** Without index, `smart_search` and `smart_context` are degraded. Agent may prefer native tools. No token savings.

3. **Use core tools:**
   - `smart_read` for file structure
   - `smart_search` for finding code
   - `smart_context` for comprehensive context
   - `smart_metrics` to verify savings

4. **Let the agent decide:** Don't force tool usage. The generated rules will guide the agent naturally.

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

Adoption Analysis (Inferred from Tool Usage)

Total sessions:        156
Sessions with devctx:  89 (57%)
Sessions without:      67 (43%)

Non-Trivial Tasks Only:
Total:                 112
With devctx:           78 (70%)
Without devctx:        34 (30%)

By Inferred Complexity:
- complex      56/68 (82%)
- moderate     25/52 (48%)
- simple       8/36 (22%)

When devctx IS used:
Avg tools/session:     2.8
Avg token savings:     146,337 tokens

Top Tools Used:
- smart_read            89 sessions
- smart_search          67 sessions
- smart_context         45 sessions

Limitations:
- Complexity inferred from operation count (not actual task complexity)
- Can only measure when devctx IS used (tool calls visible)
- Cannot measure feedback shown or forcing prompts (requires agent cooperation)
- Sessions without devctx may be simple tasks (not adoption failures)
```

### Adoption Metrics (Experimental)

The metrics report now includes **adoption analysis** to measure how often devctx is actually used.

**What we measure:**
- ✅ Sessions with devctx tool usage (automatic, from tool calls)
- ✅ Adoption rate overall and by inferred complexity
- ✅ Top tools used per session
- ✅ Average token savings when devctx is used

**What we DON'T measure:**
- ❌ Feedback frequency (requires agent to report it)
- ❌ Feedback reasons (requires agent cooperation)
- ❌ Forcing prompt usage (can't detect from metrics)
- ❌ Actual task complexity (only inferred from operation count)

**Limitations:**
- Complexity is inferred (operation count), not actual
- Can only measure when devctx IS used (tool calls visible)
- Can't detect non-usage unless agent reports it
- Sessions without devctx may be simple tasks (not failures)

**Why this is useful:**
- See if devctx is being adopted in practice
- Identify patterns (complex tasks → higher adoption)
- Verify rules and onboarding are working
- Complement compression metrics with usage metrics

See [Adoption Metrics Design](./docs/adoption-metrics-design.md) for complete analysis.

---

### Real-Time Usage Feedback (New!)

Get **immediate visibility** into devctx tool usage in every agent response.

**ENABLED BY DEFAULT** - Shows feedback after every devctx tool call.

**Disable if too verbose:**
```bash
export DEVCTX_SHOW_USAGE=false
```

**What you'll see:**
```markdown
---

📊 **devctx usage this session:**
- **smart_read**: 3 calls | ~45.0K tokens saved (file1.js, file2.js, file3.js)
- **smart_search**: 1 call | ~12.0K tokens saved (query)

**Total saved:** ~57.0K tokens

*To disable this message: `export DEVCTX_SHOW_USAGE=false`*
```

**Benefits:**
- ✅ Know immediately if agent is using devctx
- ✅ See token savings in real-time
- ✅ Verify forcing prompts worked
- ✅ Debug adoption issues instantly

**When to use:**
- Verifying agent follows rules
- Debugging why devctx isn't used
- Measuring real-time impact
- Validating setup after installation

See [Usage Feedback Documentation](./docs/usage-feedback.md) for complete guide.

---

### Decision Explanations (New!)

Understand **why** the agent chose devctx tools and what benefits are expected.

**ENABLED BY DEFAULT** - Shows decision explanations for every devctx tool call.

**Disable if too verbose:**
```bash
export DEVCTX_EXPLAIN=false
```

**What you'll see:**
```markdown
---

🤖 **Decision explanations:**

**smart_read** (read src/server.js (outline mode))
- **Why:** File is large (2500 lines), outline mode extracts structure only
- **Instead of:** Read (full file)
- **Expected benefit:** ~45.0K tokens saved
- **Context:** 2500 lines, 50000 tokens → 5000 tokens

**smart_search** (search "authentication" (intent: debug))
- **Why:** Intent-aware search prioritizes relevant results
- **Instead of:** Grep (unranked results)
- **Expected benefit:** ~12.0K tokens saved, Better result ranking

*To disable: `export DEVCTX_EXPLAIN=false`*
```

**Benefits:**
- ✅ Understand agent decision-making
- ✅ Learn when to use which tool
- ✅ Debug tool selection issues
- ✅ Validate agent is making good choices

**When to use:**
- Learning how devctx works
- Debugging why certain tools were chosen
- Validating agent behavior
- Understanding best practices

**Combine with usage feedback** for maximum visibility:
```bash
export DEVCTX_SHOW_USAGE=true
export DEVCTX_EXPLAIN=true
```

See [Decision Explainer Documentation](./docs/decision-explainer.md) for complete guide.

---

### Missed Opportunities Detection (New!)

Detect when devctx **should have been used but wasn't**.

**ENABLED BY DEFAULT** - Shows warnings when devctx adoption is low.

**Disable if not needed:**
```bash
export DEVCTX_DETECT_MISSED=false
```

**What you'll see:**
```markdown
---

⚠️ **Missed devctx opportunities detected:**

**Session stats:**
- Duration: 420s
- devctx operations: 2
- Estimated total operations: 25
- devctx adoption: 8%

🟡 **low devctx adoption**
- **Issue:** Low devctx adoption: 2/25 operations (8%). Target: >50%.
- **Suggestion:** Agent may be using native tools. Consider forcing prompt.
- **Potential savings:** ~184.0K tokens

**How to fix:**
1. Use forcing prompt
2. Check if index is built
3. Verify MCP is active
```

**Detects:**
- 🔴 No devctx usage in long sessions (>5 min)
- 🟡 Low adoption (<30% of operations)
- 🟡 Usage dropped (no calls for >3 min)

**Benefits:**
- ✅ Identify adoption gaps
- ✅ Quantify potential savings
- ✅ Validate forcing prompts worked
- ✅ Detect when agent switches to native tools

**Limitations:**
- Total operations are estimated (not measured)
- May have false positives for simple tasks
- Session-scoped only (resets on restart)

**All features enabled by default.** To disable all:
```bash
export DEVCTX_SHOW_USAGE=false
export DEVCTX_EXPLAIN=false
export DEVCTX_DETECT_MISSED=false
```

See [Missed Opportunities Documentation](./docs/missed-opportunities.md) for complete guide.

---

### Agent Rules (Multi-Client Support)

The project includes **agent rules** that enforce devctx usage across different clients:

- **Cursor:** `.cursorrules` (committed to git)
- **Claude Desktop:** `CLAUDE.md` (create from template in `docs/agent-rules-template.md`)
- **Other agents:** `AGENTS.md` (create from template in `docs/agent-rules-template.md`)

**All rules enforce the same policy:**
- Use `smart_read` instead of `Read`
- Use `smart_search` instead of `Grep`
- Use `smart_context` instead of multiple reads
- Explain if native tools are used

See [Agent Rules Template](./docs/agent-rules-template.md) for setup instructions.

---

### MCP Prompts (Automatic Forcing)

The MCP server provides **prompts** that automatically inject forcing instructions:

**Quick forcing:**
```
/prompt use-devctx
```

This injects: `Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)`

**Available prompts:**
- `/prompt use-devctx` - Ultra-short forcing prompt
- `/prompt devctx-workflow` - Complete workflow template
- `/prompt devctx-preflight` - Preflight checklist (index + session init)

**Benefits:**
- ✅ No need to remember/type forcing syntax
- ✅ Centrally managed (updates automatically)
- ✅ Discoverable in Cursor prompts menu
- ✅ No typos

See [MCP Prompts Documentation](./docs/mcp-prompts.md) for complete guide.

---

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

# 3. Index built?
ls .devctx/index.json

# 4. Metrics show usage?
npm run report:metrics
```

**Possible causes:**
- Rules not installed → Run `npx smart-context-init --target .`
- MCP not running → Restart client
- Index not built → Run `npm run build-index` or tell agent "Run build_index tool"
- Task too simple → Built-in tools sufficient (this is fine)
- Agent in Ask mode → Read-only, no MCP access

**Force devctx usage (copy-paste ready):**
```
Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)
```

See [How to Force devctx Usage](#how-to-force-devctx-usage) for complete workflow.

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

**Real rejection examples:**

```javascript
// Shell operator blocked
smartShell({ command: "ls | grep secret" })
→ { exitCode: 126, blocked: true, output: "Shell operators are not allowed..." }

// Dangerous command blocked
smartShell({ command: "rm -rf /" })
→ { exitCode: 126, blocked: true, output: "Dangerous pattern detected..." }

// Git write blocked
smartShell({ command: "git commit -m 'test'" })
→ { exitCode: 126, blocked: true, output: "Git subcommand not allowed: commit..." }

// Package install blocked
smartShell({ command: "npm install malicious" })
→ { exitCode: 126, blocked: true, output: "Package manager subcommand not allowed: install..." }
```

**Verification:**

```bash
# Run 60+ security tests to verify behavior
cd tools/devctx && npm test -- tests/smart-shell-security.test.js
```

**Configuration:**

```bash
# Disable shell execution entirely
export DEVCTX_SHELL_DISABLED=true

# Disable cache warming
export DEVCTX_CACHE_WARMING=false
```

**Complete security documentation:**
- [SECURITY.md](./SECURITY.md) - Full security policy
- [Security Rejection Examples](./docs/security/rejection-examples.md) - 50+ concrete examples

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
