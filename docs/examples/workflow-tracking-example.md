# Workflow Tracking Example

## Setup

Enable workflow tracking:

```bash
export DEVCTX_WORKFLOW_TRACKING=true
```

Restart your AI client.

---

## Example 1: Debugging Workflow

### User Prompt
```
"Fix TypeError: Cannot read property 'user' of undefined in loginHandler"
```

### Agent Workflow

**Step 1: Start session**
```javascript
smart_turn({ 
  phase: 'start', 
  userPrompt: 'Fix TypeError in loginHandler',
  ensureSession: true 
})
```

**Response:**
```json
{
  "phase": "start",
  "sessionId": "debug-login-001",
  "workflowId": 42,
  "continuity": {
    "state": "cold_start",
    "shouldReuseContext": false
  },
  "message": "Created new session for debugging task"
}
```

---

**Step 2: Find error location**
```javascript
smart_search({ 
  query: 'TypeError user undefined loginHandler', 
  intent: 'debug' 
})
```

**Metrics:**
- Raw: 15,000 tokens (grep output)
- Compressed: 800 tokens (ranked results)
- Saved: 14,200 tokens (94.7%)

---

**Step 3: Read file structure**
```javascript
smart_read({ 
  filePath: 'src/routes/login.js', 
  mode: 'signatures' 
})
```

**Metrics:**
- Raw: 5,000 tokens (full file)
- Compressed: 300 tokens (exports only)
- Saved: 4,700 tokens (94%)

---

**Step 4: Extract failing function**
```javascript
smart_read({ 
  filePath: 'src/routes/login.js', 
  mode: 'symbol',
  symbol: 'loginHandler'
})
```

**Metrics:**
- Raw: 5,000 tokens (full file)
- Compressed: 250 tokens (function only)
- Saved: 4,750 tokens (95%)

---

**Step 5: Reproduce error**
```javascript
smart_shell({ command: 'npm test -- login.test.js' })
```

**Metrics:**
- Raw: 8,000 tokens (full test output)
- Compressed: 150 tokens (summary)
- Saved: 7,850 tokens (98.1%)

---

**Step 6: Fix bug**
Agent edits `src/routes/login.js` to add null check.

---

**Step 7: Verify fix**
```javascript
smart_shell({ command: 'npm test -- login.test.js' })
```

**Metrics:**
- Raw: 3,000 tokens (success output)
- Compressed: 100 tokens (summary)
- Saved: 2,900 tokens (96.7%)

---

**Step 8: End session**
```javascript
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed TypeError - added null check for req.session',
  nextStep: 'Add integration tests for session handling'
})
```

**Response:**
```json
{
  "phase": "end",
  "sessionId": "debug-login-001",
  "workflow": {
    "workflowId": 42,
    "workflowType": "debugging",
    "durationMs": 252000,
    "toolsUsed": ["smart_turn", "smart_search", "smart_read", "smart_shell"],
    "stepsCount": 6,
    "rawTokens": 36000,
    "compressedTokens": 2300,
    "savedTokens": 33700,
    "savingsPct": 93.61,
    "baselineTokens": 150000,
    "vsBaselinePct": 98.47
  },
  "message": "Session checkpointed successfully"
}
```

---

## Workflow Summary

### Without devctx (Baseline)
```
Read 10 full files (10 × 5K)                = 50,000 tokens
Grep output (errors, logs)                  = 40,000 tokens
Test logs (npm test output)                 = 30,000 tokens
Context switching (re-reading files)        = 30,000 tokens
Total                                       = 150,000 tokens
```

### With devctx (Actual)
```
smart_search (ranked results)               = 800 tokens
smart_read (signatures)                     = 300 tokens
smart_read (symbol)                         = 250 tokens
smart_shell (test output)                   = 150 tokens
smart_shell (test output)                   = 100 tokens
Total                                       = 2,300 tokens
```

### Savings
```
Raw tokens: 36,000
Compressed tokens: 2,300
Saved tokens: 33,700 (93.6%)

Baseline tokens: 150,000 (typical debugging without devctx)
Savings vs Baseline: 147,700 (98.5%)
```

---

## View Workflow Metrics

```bash
npm run report:workflows -- --summary
```

**Output:**
```
Workflow Metrics Summary
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

Total Workflows: 1
Total Raw Tokens: 36,000
Total Compressed Tokens: 2,300
Total Saved Tokens: 33,700 (93.61%)
Total Baseline Tokens: 150,000
Savings vs Baseline: 147,700 (98.47%)

By Workflow Type:
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Type                   Count  Avg Steps   Avg Duration    Avg Savings     vs Baseline
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Debugging                  1          6           4.2m          93.61%          98.47%
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Detailed Breakdown:

Debugging:
  Workflows: 1
  Avg Steps: 6
  Avg Duration: 4.2m
  Total Raw Tokens: 36,000
  Total Compressed Tokens: 2,300
  Total Saved Tokens: 33,700 (93.61%)
  Baseline Tokens: 150,000
  Savings vs Baseline: 147,700 (98.47%)
```

---

## Example 2: Code Review Workflow

### User Prompt
```
"Review PR #123 - Add user authentication"
```

### Workflow Steps

1. `smart_turn(start)` - Start session
2. `smart_context({ diff: true })` - Get changed files (15K → 1.2K)
3. `smart_read({ mode: 'signatures' })` - Review API surface (8K → 500)
4. `smart_read({ mode: 'symbol' })` × 3 - Deep dive on key functions (15K → 900)
5. `git_blame` × 2 - Check authorship (4K → 200)
6. `smart_shell('npm test')` - Verify tests (12K → 300)
7. `smart_turn(end)` - Checkpoint

**Total:**
- Raw: 54,000 tokens
- Compressed: 3,100 tokens
- Saved: 50,900 tokens (94.3%)
- Baseline: 200,000 tokens
- Savings vs Baseline: 196,900 tokens (98.5%)

---

## Example 3: Refactoring Workflow

### User Prompt
```
"Extract validation logic from UserController to separate service"
```

### Workflow Steps

1. `smart_turn(start)` - Start session
2. `smart_context({ entryFile: 'src/controllers/UserController.js' })` - Build graph (20K → 1.5K)
3. `smart_read({ mode: 'signatures' })` - Understand structure (6K → 400)
4. `smart_read({ mode: 'symbol' })` × 4 - Extract functions (20K → 1.2K)
5. `git_blame` - Check authorship (3K → 150)
6. `smart_shell('npm test')` - Verify tests (10K → 250)
7. `smart_turn(end)` - Checkpoint

**Total:**
- Raw: 59,000 tokens
- Compressed: 3,500 tokens
- Saved: 55,500 tokens (94.1%)
- Baseline: 180,000 tokens
- Savings vs Baseline: 176,500 tokens (98.1%)

---

## Key Insights

### 1. Workflow Metrics Tell a Better Story

**Tool-level metrics:**
> "smart_read saves 90% tokens per call"

**Workflow-level metrics:**
> "Debugging workflow saves 98.5% tokens vs baseline (150K → 2.3K)"

### 2. Baselines are Conservative

Baselines assume typical operations **without devctx**:
- Reading full files multiple times
- Large grep outputs
- Test logs
- Context switching

Real-world usage might be even worse (more files, more re-reads).

### 3. Savings Compound

Each tool call saves tokens, but the **workflow** compounds savings:
- No re-reading files (context recovery)
- No massive search results (intent-aware ranking)
- No full file reads (compressed modes)

### 4. Automatic Tracking

Workflow tracking is **automatic** when:
- `DEVCTX_WORKFLOW_TRACKING=true`
- Agent uses `smart_turn(start)` and `smart_turn(end)`
- Prompt matches workflow pattern

No manual instrumentation needed.

---

## Limitations

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

## Troubleshooting

### No workflows tracked

**Check:**
1. `DEVCTX_WORKFLOW_TRACKING=true` is set
2. Agent is using `smart_turn(start)` and `smart_turn(end)`
3. Prompt matches workflow pattern (debug, review, refactor, test, explore)

### Workflow not detected

**Check:**
1. Prompt includes workflow keywords (debug, error, fix, review, refactor, test, etc.)
2. At least 3 devctx tools used in session
3. Session has meaningful goal

### Metrics seem low

**Check:**
1. Baseline is conservative (might be higher in real usage)
2. Workflow completed successfully
3. All tool calls tracked in session

---

## Next Steps

1. Enable workflow tracking: `export DEVCTX_WORKFLOW_TRACKING=true`
2. Use `smart_turn(start)` and `smart_turn(end)` for tasks
3. View metrics: `npm run report:workflows -- --summary`
4. Share results with team to demonstrate value
