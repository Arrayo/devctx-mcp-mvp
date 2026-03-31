# Workflow Metrics

## Overview

Workflow metrics track token savings for **complete task workflows**, not just individual tool calls. This provides a more convincing story about real-world savings.

**Supported workflows:**
- Debugging
- Code Review
- Refactoring
- Testing
- Architecture Exploration

---

## Enabling Workflow Tracking

Workflow tracking is **opt-in** via environment variable:

```bash
export DEVCTX_WORKFLOW_TRACKING=true
```

**Why opt-in?**
- Adds minimal overhead (SQLite writes)
- Not needed for basic usage
- Useful for measuring real-world savings
- Recommended for production deployments

**Where to set:**
- Cursor: Add to `~/.zshrc` or `~/.bashrc`
- Claude Desktop: Add to MCP config `env` section
- Codex/Qwen: Add to shell profile

---

## How It Works

### 1. Auto-Detection

When workflow tracking integration is enabled in a wrapper or caller around `smart_turn(start)`, the system can:
1. Analyze the prompt for workflow patterns
2. Check tools used so far in the session
3. Detect workflow type (debugging, review, refactor, testing, architecture)
4. Start tracking for that session

**Example:**
```javascript
smart_turn({ 
  phase: 'start', 
  userPrompt: 'Fix TypeError in loginHandler',
  ensureSession: true 
})
// → Auto-detects "debugging" workflow
// → Starts tracking workflow_id
```

---

### 2. Metric Collection

During the workflow, all tool calls are tracked:
- `smart_search(intent=debug)` - Find error location
- `smart_read(mode=symbol)` - Read failing function
- `smart_shell('npm test')` - Reproduce error
- etc.

Each tool call records:
- Raw tokens (what would be sent without devctx)
- Compressed tokens (what was actually sent)
- Saved tokens (raw - compressed)

---

### 3. Workflow Completion

When a tracked workflow is closed, typically alongside `smart_turn(end)` with `event=milestone` or `event=task_complete`:
1. Workflow tracking ends
2. Metrics are aggregated
3. Savings are calculated vs baseline

**Example:**
```javascript
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed TypeError - added null check',
  nextStep: 'Add integration tests'
})
// → Ends workflow tracking
// → Returns workflow summary with token savings
```

---

## Workflow Definitions

### Debugging

**Pattern:** `debug|error|bug|fix|fail`

**Typical tools:**
- `smart_turn` - Session management
- `smart_search(intent=debug)` - Find error location
- `smart_read(mode=symbol)` - Read failing function
- `smart_shell` - Reproduce error, verify fix

**Baseline:** 150,000 tokens
- Read 10 full files
- Grep output (errors, logs)
- Test logs

**Expected savings:** 90% (150K → 15K)

---

### Code Review

**Pattern:** `review|pr|pull.?request|approve`

**Typical tools:**
- `smart_turn` - Session management
- `smart_context(diff=true)` - Get changed files
- `smart_read(mode=signatures)` - Review API surface
- `git_blame` - Check authorship
- `smart_shell` - Verify tests

**Baseline:** 200,000 tokens
- Read 15 full files
- Diff output
- Test logs

**Expected savings:** 87% (200K → 25K)

---

### Refactoring

**Pattern:** `refactor|extract|rename|move|restructure`

**Typical tools:**
- `smart_turn` - Session management
- `smart_context(entryFile)` - Build dependency graph
- `smart_read(mode=signatures)` - Understand structure
- `git_blame` - Check authorship
- `smart_shell` - Verify tests

**Baseline:** 180,000 tokens
- Read 12 full files
- Dependency graph
- Test logs

**Expected savings:** 89% (180K → 20K)

---

### Testing

**Pattern:** `test|spec|coverage|tdd`

**Typical tools:**
- `smart_turn` - Session management
- `smart_search(intent=tests)` - Find test patterns
- `smart_read(mode=symbol)` - Read function to test
- `smart_context` - Understand dependencies
- `smart_shell` - Run tests

**Baseline:** 120,000 tokens
- Read 8 full files
- Test patterns
- Test logs

**Expected savings:** 90% (120K → 12K)

---

### Architecture Exploration

**Pattern:** `architect|explore|understand|structure|design`

**Typical tools:**
- `smart_turn` - Session management
- `smart_context(detail=minimal)` - High-level overview
- `smart_search(intent=explore)` - Find patterns
- `smart_read(mode=signatures)` - Review API surface
- `cross_project` - Cross-project patterns

**Baseline:** 300,000 tokens
- Read 20 full files
- Explore structure

**Expected savings:** 90% (300K → 30K)

---

## Viewing Workflow Metrics

### Summary by Type

```bash
npm run report:workflows -- --summary
```

**Output:**
```
Workflow Metrics Summary
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

Total Workflows: 45
Total Raw Tokens: 6,750,000
Total Compressed Tokens: 810,000
Total Saved Tokens: 5,940,000 (88.00%)
Total Baseline Tokens: 8,100,000
Savings vs Baseline: 7,290,000 (90.00%)

By Workflow Type:
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Type                   Count  Avg Steps   Avg Duration    Avg Savings     vs Baseline
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Debugging                 15          8           4.2m          90.00%          90.00%
Code Review               12         10           6.5m          87.00%          87.50%
Refactoring               10          9           5.8m          89.00%          88.89%
Testing                    5          7           3.1m          90.00%          90.00%
Architecture               3         12           8.4m          90.00%          90.00%
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Detailed Breakdown:

Debugging:
  Workflows: 15
  Avg Steps: 8
  Avg Duration: 4.2m
  Total Raw Tokens: 2,250,000
  Total Compressed Tokens: 225,000
  Total Saved Tokens: 2,025,000 (90.00%)
  Baseline Tokens: 2,250,000
  Savings vs Baseline: 2,025,000 (90.00%)

...
```

---

### Recent Workflows

```bash
npm run report:workflows
```

**Output:**
```
Recent Workflows
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

Debugging (✓ Completed)
  Workflow ID: 123
  Session ID: abc123
  Started: 2026-03-28 14:30:00
  Ended: 2026-03-28 14:34:15
  Duration: 4.2m
  Steps: 8
  Tools Used: smart_turn, smart_search, smart_read, smart_shell
  Raw Tokens: 150,000
  Compressed Tokens: 15,000
  Saved Tokens: 135,000 (90.00%)
  Baseline Tokens: 150,000
  Savings vs Baseline: 135,000 (90.00%)

...
```

---

### Filter by Type

```bash
npm run report:workflows -- --type debugging
npm run report:workflows -- --type code-review
npm run report:workflows -- --type refactoring
npm run report:workflows -- --type testing
npm run report:workflows -- --type architecture
```

---

### Filter by Session

```bash
npm run report:workflows -- --session abc123
```

---

### JSON Output

```bash
npm run report:workflows -- --json
npm run report:workflows -- --summary --json
```

---

## Baseline Calculation

**Baseline tokens** represent typical token usage **without devctx** for each workflow type.

### Debugging Baseline (150K tokens)

**Typical operations:**
```
Read 10 full files (10 × 5K)                = 50,000 tokens
Grep output (errors, logs, stack traces)    = 40,000 tokens
Test logs (npm test output)                 = 30,000 tokens
Context switching (re-reading files)        = 30,000 tokens
Total                                       = 150,000 tokens
```

---

### Code Review Baseline (200K tokens)

**Typical operations:**
```
Read 15 full files (15 × 5K)                = 75,000 tokens
Diff output (git diff)                      = 50,000 tokens
Test logs (npm test output)                 = 30,000 tokens
Context switching (re-reading files)        = 45,000 tokens
Total                                       = 200,000 tokens
```

---

### Refactoring Baseline (180K tokens)

**Typical operations:**
```
Read 12 full files (12 × 5K)                = 60,000 tokens
Dependency graph (imports, exports)         = 40,000 tokens
Test logs (npm test output)                 = 30,000 tokens
Context switching (re-reading files)        = 50,000 tokens
Total                                       = 180,000 tokens
```

---

### Testing Baseline (120K tokens)

**Typical operations:**
```
Read 8 full files (8 × 5K)                  = 40,000 tokens
Test patterns (existing tests)              = 20,000 tokens
Test logs (npm test output)                 = 30,000 tokens
Context switching (re-reading files)        = 30,000 tokens
Total                                       = 120,000 tokens
```

---

### Architecture Baseline (300K tokens)

**Typical operations:**
```
Read 20 full files (20 × 5K)                = 100,000 tokens
Explore structure (directory tree, imports) = 80,000 tokens
Search results (grep output)                = 60,000 tokens
Context switching (re-reading files)        = 60,000 tokens
Total                                       = 300,000 tokens
```

---

## Metrics Stored

### `workflow_metrics` Table

```sql
CREATE TABLE workflow_metrics (
  workflow_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_type TEXT NOT NULL,              -- debugging, code-review, etc.
  session_id TEXT,                          -- Associated session
  start_time TEXT NOT NULL,                 -- When workflow started
  end_time TEXT,                            -- When workflow ended
  duration_ms INTEGER,                      -- Duration in milliseconds
  tools_used_json TEXT NOT NULL,            -- Array of tools used
  steps_count INTEGER NOT NULL,             -- Number of tool calls
  raw_tokens INTEGER NOT NULL,              -- Total raw tokens
  compressed_tokens INTEGER NOT NULL,       -- Total compressed tokens
  saved_tokens INTEGER NOT NULL,            -- Total saved tokens
  savings_pct REAL NOT NULL,                -- Savings percentage
  baseline_tokens INTEGER NOT NULL,         -- Baseline for this workflow type
  vs_baseline_pct REAL NOT NULL,            -- Savings vs baseline
  metadata_json TEXT NOT NULL,              -- Additional metadata
  created_at TEXT NOT NULL
);
```

---

## Limitations & Honest Truth

### What Workflow Metrics Can Do

✅ Track complete task workflows  
✅ Calculate token savings for real tasks  
✅ Compare against realistic baselines  
✅ Auto-detect workflow type  
✅ Aggregate metrics across sessions

### What Workflow Metrics Cannot Do

❌ Force agent to follow workflows  
❌ Guarantee workflow detection (depends on prompt)  
❌ Track workflows without `smart_turn`  
❌ Measure response quality (only token savings)  
❌ Track workflows across projects

---

## Verification

### Check Workflows are Being Tracked

```bash
# View recent workflows
npm run report:workflows

# View summary
npm run report:workflows -- --summary
```

**Good signs:**
- Workflows > 0
- Savings 85-90%
- Multiple workflow types

**Bad signs:**
- Workflows = 0
- Check: Agent using `smart_turn`? Prompts meaningful?

---

### Check Workflow Detection

```bash
# View workflows by type
npm run report:workflows -- --type debugging
```

**If no workflows detected:**
- Check prompts match patterns (debug, error, bug, fix, etc.)
- Check agent is calling `smart_turn(start)` with `ensureSession=true`
- Check agent is calling `smart_turn(end)` with `event=milestone`

---

## Example: Real Debugging Workflow

### Prompt
```
"Fix TypeError: Cannot read property 'user' of undefined in loginHandler"
```

### Workflow Steps

1. **Start tracking**
   ```javascript
   smart_turn({ phase: 'start', userPrompt: '...', ensureSession: true })
   // → Detects "debugging" workflow
   // → Starts tracking workflow_id=123
   ```

2. **Find error location**
   ```javascript
   smart_search({ query: 'TypeError user undefined', intent: 'debug' })
   // → Raw: 15K tokens (grep output)
   // → Compressed: 800 tokens
   // → Saved: 14.2K tokens
   ```

3. **Read structure**
   ```javascript
   smart_read({ filePath: 'src/routes/login.js', mode: 'signatures' })
   // → Raw: 5K tokens (full file)
   // → Compressed: 300 tokens
   // → Saved: 4.7K tokens
   ```

4. **Extract failing function**
   ```javascript
   smart_read({ filePath: 'src/routes/login.js', mode: 'symbol', symbol: 'loginHandler' })
   // → Raw: 5K tokens (full file)
   // → Compressed: 250 tokens
   // → Saved: 4.75K tokens
   ```

5. **Reproduce error**
   ```javascript
   smart_shell({ command: 'npm test -- login.test.js' })
   // → Raw: 8K tokens (full test output)
   // → Compressed: 150 tokens
   // → Saved: 7.85K tokens
   ```

6. **Fix bug** (agent edits file)

7. **Verify fix**
   ```javascript
   smart_shell({ command: 'npm test -- login.test.js' })
   // → Raw: 3K tokens (success output)
   // → Compressed: 100 tokens
   // → Saved: 2.9K tokens
   ```

8. **End tracking**
   ```javascript
   smart_turn({ 
     phase: 'end',
     event: 'milestone',
     summary: 'Fixed TypeError - added null check',
     nextStep: 'Add integration tests'
   })
   // → Ends workflow tracking
   // → Calculates totals
   ```

### Workflow Summary

```
Debugging Workflow (✓ Completed)
  Duration: 4.2 minutes
  Steps: 8
  Tools Used: smart_turn, smart_search, smart_read, smart_shell

  Raw Tokens: 36,000
  Compressed Tokens: 2,300
  Saved Tokens: 33,700 (93.6%)

  Baseline Tokens: 150,000 (typical debugging without devctx)
  Savings vs Baseline: 147,700 (98.5%)
```

**Key insight:** Without devctx, this would have taken ~150K tokens (reading 10 full files, grep output, test logs). With devctx, it took 2.3K tokens. **98.5% savings vs baseline.**

---

## Integration with Existing Metrics

Workflow metrics **complement** (not replace) tool-level metrics:

**Tool-level metrics:**
- Show savings per tool call
- Useful for optimizing individual tools
- Example: `smart_read` saves 90% per call

**Workflow metrics:**
- Show savings for complete tasks
- Useful for product story
- Example: Debugging saves 90% overall

**Both are valuable:**
- Tool metrics: Technical optimization
- Workflow metrics: Product value proposition

---

## Future Enhancements

**Planned:**
- Workflow templates (user-defined patterns)
- Custom baselines (per project)
- Workflow recommendations (suggest optimal flow)
- Workflow comparison (A/B testing)
- Response quality metrics (not just token savings)

**Not planned:**
- Cross-project workflow tracking (privacy concerns)
- Automatic workflow enforcement (agent decides)
- Real-time workflow suggestions (too intrusive)

---

## Conclusion

**Workflow metrics provide a more convincing story:**

**Before (tool-level only):**
> "smart_read saves 90% tokens per call"

**After (workflow-level):**
> "Debugging workflow saves 90% tokens (150K → 15K) across 8 steps"

**Key benefits:**
- ✅ More relatable (complete tasks vs individual tools)
- ✅ More convincing (real-world scenarios)
- ✅ More actionable (optimize workflows, not just tools)
- ✅ More honest (includes baseline comparison)

**And it's automatic** - just use `smart_turn(start)` and `smart_turn(end)`.
