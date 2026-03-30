# How It Works: The Complete Picture

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ You (User)                                                  │
│ "Fix the login bug"                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ AI Client (Cursor, Codex, Claude Desktop, Qwen)            │
│ - Reads agent rules (.cursor/rules/devctx.mdc, AGENTS.md)  │
│ - Processes your prompt                                     │
│ - Decides which tools to use                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ AI Agent (Claude, GPT-4, etc.)                              │
│ - Reads rules: "Debugging: smart_search(intent=debug)"     │
│ - Decides: "This is a debugging task"                       │
│ - Calls: smart_search({ query: 'login error', intent: ... })│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ MCP Server (smart-context-mcp)                              │
│ - Receives: smart_search call                               │
│ - Executes: ripgrep with intent-aware ranking               │
│ - Returns: Compressed, ranked results                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Local Storage (.devctx/)                                    │
│ - index.json: Symbol index                                  │
│ - state.sqlite: Sessions, metrics, patterns                 │
│ - metrics.jsonl: Legacy fallback                            │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step: Real Example

### Scenario: Debugging a Login Error

**User prompt:**
```
"The login endpoint is returning 401 even with valid credentials"
```

---

### Step 1: Agent Reads Rules

**What happens:**
- AI client loads `.cursor/rules/devctx.mdc` (or `AGENTS.md`, `CLAUDE.md`)
- Agent sees: "Debugging: smart_turn(start) → smart_search(intent=debug) → ..."
- Agent recognizes: "This is a debugging task"

**Agent decision:** "I'll follow the debugging workflow"

---

### Step 2: Context Recovery

**Agent calls:**
```javascript
smart_turn({ 
  phase: 'start', 
  userPrompt: 'Login endpoint returning 401 with valid credentials',
  ensureSession: true 
})
```

**MCP returns:**
```json
{
  "session": {
    "id": "abc123",
    "objective": "Debug authentication system",
    "status": "active",
    "filesAccessed": ["src/auth.js", "src/routes/login.js"],
    "decisions": ["Using JWT for auth", "Token expires in 1h"],
    "nextStep": "Check token validation logic"
  },
  "repoSafety": { "ok": true },
  "metrics": { "sessionsActive": 1 }
}
```

**Agent now knows:**
- Previous work context
- Files already accessed
- Decisions made
- Where to continue

---

### Step 3: Find Error Location

**Agent calls:**
```javascript
smart_search({ 
  query: 'login 401 authentication error',
  intent: 'debug'
})
```

**MCP executes:**
1. Runs ripgrep: `rg "login|401|authentication|error"`
2. Loads index: Checks symbol matches
3. Ranks results:
   - Error handlers (priority 1)
   - Recently changed files (priority 2)
   - Test files (priority 3)
   - Other matches (priority 4)
4. Groups by file
5. Compresses output

**MCP returns:**
```json
{
  "results": [
    {
      "file": "src/routes/login.js",
      "matches": 3,
      "preview": "validateCredentials → 401 if invalid",
      "rank": 1,
      "reason": "error handling + recently changed"
    },
    {
      "file": "src/auth.js",
      "matches": 2,
      "preview": "verifyToken → throws AuthError",
      "rank": 2,
      "reason": "error handling"
    }
  ],
  "metrics": {
    "rawTokens": 15000,
    "compressedTokens": 800,
    "savingsPct": 94.7
  }
}
```

**Agent now knows:** Error likely in `src/routes/login.js`

---

### Step 4: Understand Structure

**Agent calls:**
```javascript
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'signatures'
})
```

**MCP executes:**
1. Reads file
2. Parses AST (JavaScript)
3. Extracts exported functions only
4. Compresses

**MCP returns:**
```javascript
{
  "content": `
export async function loginHandler(req, res) { ... }
export async function validateCredentials(username, password) { ... }
export async function generateToken(user) { ... }
  `,
  "symbols": ["loginHandler", "validateCredentials", "generateToken"],
  "metrics": {
    "rawTokens": 5000,
    "compressedTokens": 300,
    "savingsPct": 94
  }
}
```

**Agent now knows:** File structure and exported API

---

### Step 5: Extract Failing Function

**Agent calls:**
```javascript
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'symbol',
  symbol: 'validateCredentials'
})
```

**MCP executes:**
1. Reads file
2. Parses AST
3. Extracts `validateCredentials` function only
4. Includes 3 lines of context

**MCP returns:**
```javascript
{
  "content": `
export async function validateCredentials(username, password) {
  const user = await db.findUser({ username });
  
  if (!user) {
    return { valid: false, error: 'User not found' };
  }
  
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  
  if (!passwordMatch) {
    return { valid: false, error: 'Invalid password' };
  }
  
  return { valid: true, user };
}
  `,
  "metrics": {
    "rawTokens": 5000,
    "compressedTokens": 250,
    "savingsPct": 95
  }
}
```

**Agent now sees:** The function logic

---

### Step 6: Reproduce Error

**Agent calls:**
```javascript
smart_shell({ command: 'npm test -- login.test.js' })
```

**MCP executes:**
1. Validates command (allowlist check)
2. Runs: `npm test -- login.test.js`
3. Captures output
4. Compresses (keeps errors, warnings)

**MCP returns:**
```json
{
  "command": "npm test -- login.test.js",
  "exitCode": 1,
  "output": "FAIL tests/login.test.js\n  ✗ should login with valid credentials\n    Expected: 200\n    Received: 401",
  "metrics": {
    "rawTokens": 8000,
    "compressedTokens": 150,
    "savingsPct": 98.1
  }
}
```

**Agent now knows:** Test fails as expected

---

### Step 7: Agent Fixes Bug

**Agent reasoning:**
```
The function returns { valid: false } but the handler might be 
checking for { valid: true } incorrectly. Let me check the handler.
```

**Agent calls:**
```javascript
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'symbol',
  symbol: 'loginHandler'
})
```

**Agent finds bug:**
```javascript
// Bug: checking result.valid === true instead of result.valid
if (result.valid === true) {  // ← Problem: strict equality
  return res.json({ token: generateToken(result.user) });
}
```

**Agent makes fix:**
```javascript
if (result.valid) {  // ← Fixed: truthy check
  return res.json({ token: generateToken(result.user) });
}
```

---

### Step 8: Verify Fix

**Agent calls:**
```javascript
smart_shell({ command: 'npm test -- login.test.js' })
```

**MCP returns:**
```json
{
  "exitCode": 0,
  "output": "PASS tests/login.test.js\n  ✓ should login with valid credentials"
}
```

**Agent confirms:** Fix works

---

### Step 9: Checkpoint Progress

**Agent calls:**
```javascript
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed login 401 error - strict equality bug in loginHandler',
  nextStep: 'Consider adding integration tests for auth flow'
})
```

**MCP persists:**
- Session updated with milestone
- Files accessed recorded
- Decision logged
- Next step saved

**Next time:** Agent can recover this context with `smart_turn(start)`

---

## Token Usage Breakdown

| Step | Tool | Raw Tokens | Compressed | Savings |
|------|------|------------|------------|---------|
| 1. Context recovery | `smart_turn` | 0 | 500 | - |
| 2. Find error | `smart_search` | 15,000 | 800 | 94.7% |
| 3. Read structure | `smart_read(signatures)` | 5,000 | 300 | 94% |
| 4. Extract function | `smart_read(symbol)` | 5,000 | 250 | 95% |
| 5. Run test | `smart_shell` | 8,000 | 150 | 98.1% |
| 6. Verify fix | `smart_shell` | 3,000 | 100 | 96.7% |
| 7. Checkpoint | `smart_turn` | 0 | 200 | - |
| **Total** | | **36,000** | **2,300** | **93.6%** |

**Without devctx:** ~150,000 tokens (read 10 full files, grep output, test logs)

**With devctx:** ~2,300 tokens

**Savings:** 93.6% (65x compression)

---

## What Gets Persisted

### `.devctx/index.json`

**Content:**
- Symbol index (functions, classes, imports)
- File metadata (size, mtime, language)
- Relationship graph (imports, exports, tests)

**When built:**
- First `smart_context` call
- Or manually: `npm run build-index`

**When updated:**
- Incremental on file changes
- Or manually: `build_index({ incremental: true })`

**Size:** ~500KB for medium project (5K files)

---

### `.devctx/state.sqlite` (Node 22+)

**Schema:**

```sql
-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  objective TEXT,
  status TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Session events
CREATE TABLE session_events (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  event_type TEXT,
  summary TEXT,
  next_step TEXT,
  created_at INTEGER
);

-- Metrics
CREATE TABLE metrics_events (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  tool_name TEXT,
  target TEXT,
  raw_tokens INTEGER,
  compressed_tokens INTEGER,
  created_at INTEGER
);

-- Context patterns
CREATE TABLE context_patterns (
  id INTEGER PRIMARY KEY,
  task_hash TEXT,
  intent TEXT,
  files_accessed TEXT,
  access_count INTEGER,
  last_accessed INTEGER
);

-- Context access
CREATE TABLE context_access (
  id INTEGER PRIMARY KEY,
  file_path TEXT,
  access_count INTEGER,
  last_accessed INTEGER
);
```

**What gets stored:**
- Session history (objectives, decisions, blockers)
- Turn checkpoints (summaries, next steps)
- Tool usage metrics (token savings per tool)
- File access patterns (for prediction)
- File access frequency (for cache warming)

**When consulted:**
- `smart_turn(start)` - Recovers session
- `smart_summary` - Gets session summary
- `smart_context` - Uses patterns for prediction
- `warm_cache` - Preloads frequent files
- `smart_metrics` - Reports usage

**Size:** ~2-10MB after 1000 operations

---

### `.devctx/metrics.jsonl` (Node 18-20 fallback)

**Content:**
```jsonl
{"tool":"smart_read","target":"src/auth.js","rawTokens":5000,"compressedTokens":300,"timestamp":1234567890}
{"tool":"smart_search","target":"login error","rawTokens":15000,"compressedTokens":800,"timestamp":1234567891}
```

**When used:**
- Node 18-20 (no SQLite support)
- Fallback if SQLite unavailable

**Limitations:**
- No sessions
- No patterns
- No predictions
- Metrics only

---

## Context Persistence: The Reality

### What It Is

A **local database** (`.devctx/state.sqlite`) that stores:
- Session history
- File access patterns
- Token metrics
- Turn checkpoints

### What It's NOT

❌ **Not automatic prompt interception** - Agent must call `smart_turn`  
❌ **Not cross-session memory** - Only within project  
❌ **Not guaranteed recovery** - Depends on agent behavior  
❌ **Not client-level persistence** - MCP-level only

### When It Works

✅ Agent calls `smart_turn(start)` at task start  
✅ Agent calls `smart_turn(end)` at milestones  
✅ Session ID matches (manual or auto)  
✅ Node 22+ (SQLite support)

### When It Doesn't Work

❌ Agent skips `smart_turn` (no persistence)  
❌ Node 18-20 (no SQLite, metrics only)  
❌ Session ID mismatch (can't recover)  
❌ Agent doesn't follow rules (no workflow)

### How to Check

```bash
# View sessions
sqlite3 .devctx/state.sqlite "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 5"

# View metrics
npm run report:metrics

# View patterns
sqlite3 .devctx/state.sqlite "SELECT * FROM context_patterns ORDER BY access_count DESC LIMIT 10"
```

---

## Agent Decision Flow

### 1. Agent Receives Prompt

```
User: "Fix the login bug"
```

**Agent thinks:**
- "This is a debugging task"
- "Rules suggest: smart_search(intent=debug)"
- "I'll follow that workflow"

---

### 2. Agent Calls Tool

```javascript
smart_search({ 
  query: 'login error authentication',
  intent: 'debug'
})
```

**Why agent chose this:**
- Rules recommend it
- Task matches debugging profile
- Likely to find error quickly

---

### 3. MCP Executes

**MCP process:**
1. Validate input
2. Load index (if exists)
3. Run ripgrep
4. Rank results by intent
5. Compress output
6. Persist metrics

**MCP returns:** Compressed, ranked results

---

### 4. Agent Continues

**Agent calls:**
```javascript
smart_read({ 
  filePath: 'src/routes/login.js',
  mode: 'symbol',
  symbol: 'validateCredentials'
})
```

**Why agent chose this:**
- Rules suggest symbol mode for debugging
- Needs specific function, not full file
- 95% token savings

---

### 5. Agent Makes Fix

**Agent edits file** (using built-in tools)

**MCP is passive** - Does not intercept edits

---

### 6. Agent Verifies

**Agent calls:**
```javascript
smart_shell({ command: 'npm test' })
```

**MCP executes:**
1. Validates command (allowlist)
2. Runs npm test
3. Compresses output
4. Returns result

---

### 7. Agent Checkpoints

**Agent calls:**
```javascript
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed login 401 - strict equality bug',
  nextStep: 'Add integration tests'
})
```

**MCP persists:**
- Session updated
- Milestone logged
- Next step saved
- Metrics recorded

---

## What Determines Tool Usage

### Factors That Increase devctx Usage

✅ **Complex tasks** - Debugging, refactoring, architecture  
✅ **Large codebases** - More files = more benefit from compression  
✅ **Clear task type** - Matches a profile (debug, review, etc.)  
✅ **Agent follows rules** - Reads and applies workflows  
✅ **Token budget constraints** - Agent wants to save tokens

### Factors That Decrease devctx Usage

❌ **Simple tasks** - Single file read, trivial search  
❌ **Small codebases** - Few files = less benefit  
❌ **Unclear task type** - Doesn't match any profile  
❌ **Agent ignores rules** - Rare but possible  
❌ **Built-in tools sufficient** - Agent prefers familiar

---

## Realistic Expectations

### Best Case (80-90% tool adoption)

**Scenario:** Complex debugging in large codebase

**Agent behavior:**
- Follows debugging workflow
- Uses `smart_search(intent=debug)`
- Uses `smart_read(symbol)` for functions
- Uses `smart_shell` for tests
- Checkpoints with `smart_turn`

**Result:** 85-90% token savings

---

### Typical Case (50-70% tool adoption)

**Scenario:** Mixed tasks (debug + review + refactor)

**Agent behavior:**
- Uses devctx for complex tasks
- Uses built-in tools for simple tasks
- Follows workflows when clear
- Skips workflows when unclear

**Result:** 60-80% token savings

---

### Worst Case (0-20% tool adoption)

**Scenario:** Simple tasks in small codebase

**Agent behavior:**
- Uses built-in tools (sufficient)
- Skips devctx tools (unnecessary overhead)
- No workflow needed

**Result:** 0-20% token savings (and that's fine)

---

## How to Verify It's Working

### 1. Check Metrics

```bash
npm run report:metrics
```

**Look for:**
- Tool usage counts (should be > 0)
- Token savings (should be 85-90%)
- Compression ratios (should be 3x-46x)

**Example output:**
```
devctx metrics report
─────────────────────────────────────────────────────
Total operations: 3,666
Total raw tokens: 14,500,000
Total compressed tokens: 1,600,000
Overall savings: 89.87%

By tool:
  smart_read: 1,842 calls, 91.2% savings
  smart_search: 1,156 calls, 94.7% savings
  smart_context: 428 calls, 84.3% savings
  smart_shell: 240 calls, 97.8% savings
```

---

### 2. Check Rules Installed

```bash
cat .cursor/rules/devctx.mdc
```

**Should contain:**
- Tool preferences
- Context recovery
- Reading strategy
- Task workflows

---

### 3. Check Index Built

```bash
ls -lh .devctx/index.json
```

**Should exist:** ~500KB file

**If missing:** Agent will build on first `smart_context` call

---

### 4. Check Storage

```bash
ls -lh .devctx/state.sqlite
```

**Should exist:** ~2-10MB file (Node 22+)

**If missing:** Node 18-20 (fallback to `metrics.jsonl`)

---

## Troubleshooting

### Agent not using devctx tools

**Check:**
1. Rules installed: `cat .cursor/rules/devctx.mdc`
2. MCP running: Cursor Settings → MCP → Check "smart-context" active
3. Metrics: `npm run report:metrics` (should show usage)

**If still not working:**
- Agent might prefer built-in tools (this is fine for simple tasks)
- Rules might not match task type
- Agent might be in Ask mode (read-only, no MCP access)

---

### High token usage despite devctx

**Possible causes:**
1. Agent using `full` mode instead of `outline`/`signatures`
2. Agent not following workflows
3. Task doesn't benefit from compression (e.g., single file read)

**Check metrics:**
```bash
npm run report:metrics
```

**Look for:**
- Low tool usage counts
- Low compression ratios
- High `full` mode usage

---

### Context not persisting

**Check:**
1. Node version: `node --version` (need 22+ for SQLite)
2. SQLite exists: `ls .devctx/state.sqlite`
3. Agent calling `smart_turn`: Check metrics

**If Node 18-20:**
- Context persistence disabled (no SQLite)
- Metrics still work (fallback to JSONL)
- Upgrade to Node 22+ for full features

---

## Limitations & Honest Truth

### What This MCP Can Do

✅ Provide efficient tools for reading, searching, diagnostics  
✅ Compress output 85-90% while preserving signal  
✅ Persist context locally (`.devctx/state.sqlite`)  
✅ Guide agents with task-specific workflows  
✅ Track metrics and token savings

### What This MCP Cannot Do

❌ Force agents to use tools (agent decides)  
❌ Intercept prompts automatically (not how MCP works)  
❌ Persist context across projects (local only)  
❌ Guarantee 90% savings (depends on task and agent behavior)  
❌ Replace built-in tools entirely (nor should it)

### What This Means

**The MCP is a layer that optimizes the prompt → context → response flow:**

```
Without devctx:
  Prompt → Agent reads 10 full files → 150K tokens → Response

With devctx:
  Prompt → Agent uses smart_search + smart_read(symbol) → 15K tokens → Response
```

**But the agent still decides** which path to take based on:
- Task complexity
- Rules guidance
- Token budget
- Its own reasoning

This is **by design**. Flexibility > rigidity.

---

## Success Metrics

### How to Know It's Working

**Good signs:**
- ✅ `npm run report:metrics` shows 50%+ tool usage
- ✅ Token savings 60-90%
- ✅ Agent responses faster
- ✅ Fewer round-trips
- ✅ Sessions persist across turns

**Bad signs:**
- ❌ Metrics show 0 tool usage
- ❌ Token usage unchanged
- ❌ Agent always uses built-in tools
- ❌ No `.devctx/` directory created

**If bad signs:** Check installation, rules, and MCP status.

---

## Real-World Usage Patterns

### Pattern 1: Debugging (High devctx usage)

**Task:** Complex bug in large codebase

**Agent behavior:**
- Uses `smart_search(intent=debug)` - 95% savings
- Uses `smart_read(symbol)` - 95% savings
- Uses `smart_shell` - 98% savings

**Result:** 90% overall savings

---

### Pattern 2: Simple Read (Low devctx usage)

**Task:** Read single file

**Agent behavior:**
- Uses built-in Read tool
- No devctx tools needed

**Result:** 0% savings (and that's fine)

---

### Pattern 3: Mixed Tasks (Medium devctx usage)

**Task:** Review + refactor + test

**Agent behavior:**
- Uses `smart_context(diff)` for review
- Uses built-in tools for simple edits
- Uses `smart_read(symbol)` for testing

**Result:** 60-70% overall savings

---

## Conclusion

**This MCP is a layer, not magic:**

1. **Provides tools** - Efficient alternatives to built-ins
2. **Provides guidance** - Task-specific workflows
3. **Provides persistence** - Local context database
4. **Provides metrics** - Track actual savings

**The agent decides** when to use them based on:
- Your prompts
- Rules guidance
- Task complexity
- Token budget

**You verify** it's working with:
- `npm run report:metrics`
- `.devctx/state.sqlite` inspection
- Token cost reduction

**The goal:** Optimize prompt → context → response flow without forcing rigid behavior.

This is **practical AI engineering**, not magic.
