# Decision Explainer System

## Overview

The decision explainer system provides **transparency into agent decision-making** by explaining why devctx tools were used and what benefits are expected.

## Problem Solved

**Before:** Users couldn't understand why the agent chose `smart_read` over `Read`, or why `smart_search` was used instead of `Grep`.

**After:** Agent explains each decision with reasoning, alternatives considered, and expected benefits.

## How It Works

### 1. Enable Explanations

Set the environment variable:

```bash
export DEVCTX_EXPLAIN=true
```

### 2. Use devctx Tools

When the agent uses devctx tools, decisions are automatically tracked with explanations.

### 3. See Explanations

At the end of the agent's response, you'll see:

```markdown
---

🤖 **Decision explanations:**

**smart_read** (read src/server.js (outline mode))
- **Why:** File is large (>500 lines), outline mode extracts structure only
- **Instead of:** Read (full file)
- **Expected benefit:** ~45.0K tokens saved
- **Context:** 2500 lines, 50000 tokens → 5000 tokens

**smart_search** (search "authentication" (intent: debug))
- **Why:** Intent-aware search prioritizes relevant results (debug/implementation/tests)
- **Instead of:** Grep (unranked results)
- **Expected benefit:** ~12.0K tokens saved, Better result ranking
- **Context:** 156 matches in 23 files, ranked by relevance

*To disable: `export DEVCTX_EXPLAIN=false`*
```

## What's Explained

For each tool usage:

### smart_read
- **Why:** Large file / Symbol extraction / Token budget / etc.
- **Instead of:** Read (full file)
- **Expected benefit:** Token savings
- **Context:** Line count, token compression ratio

### smart_search
- **Why:** Multiple files / Intent-aware / Index boost / etc.
- **Instead of:** Grep (unranked results)
- **Expected benefit:** Token savings + Better ranking
- **Context:** Match count, file count, ranking applied

### smart_context
- **Why:** Task context / Related files / Diff analysis / etc.
- **Instead of:** Multiple smart_read + smart_search calls
- **Expected benefit:** Token savings + Complete context
- **Context:** File count, compression ratio

### smart_shell
- **Why:** Command output compression / Relevant lines extraction / etc.
- **Instead of:** Shell (uncompressed output)
- **Expected benefit:** Token savings
- **Context:** Output line reduction

### smart_summary
- **Why:** Checkpoint / Resume / Persistence / etc.
- **Instead of:** Start from scratch (lose context)
- **Expected benefit:** Session recovery
- **Context:** Goal, status, recovered state

## Use Cases

### 1. Understand Agent Decisions

**Problem:** Not sure why agent used smart_read instead of Read.

**Solution:** Enable explanations, see reasoning:
```
**smart_read** (read file.js (outline mode))
- **Why:** File is large (2500 lines), outline mode extracts structure only
- **Expected benefit:** ~45.0K tokens saved
```

### 2. Debug Adoption Issues

**Problem:** Agent not using devctx in complex tasks.

**Solution:** Enable explanations, see if agent is even considering devctx (if no explanations appear, agent isn't using devctx).

### 3. Validate Tool Selection

**Problem:** Want to verify agent is choosing the right tool for the task.

**Solution:** Enable explanations, review reasoning:
```
**smart_search** (search "bug" (intent: debug))
- **Why:** Intent-aware search prioritizes relevant results (debug/implementation/tests)
- **Expected benefit:** Better result ranking
```

### 4. Learn Best Practices

**Problem:** Want to understand when to use which tool.

**Solution:** Enable explanations, learn from agent's decisions:
- Large files → `smart_read` (outline mode)
- Symbol extraction → `smart_read` (symbol mode)
- Multi-file search → `smart_search` (with intent)
- Task context → `smart_context`

## Configuration

### Enable

```bash
export DEVCTX_EXPLAIN=true
# or
export DEVCTX_EXPLAIN=1
# or
export DEVCTX_EXPLAIN=yes
```

### Disable

```bash
export DEVCTX_EXPLAIN=false
# or
unset DEVCTX_EXPLAIN
```

### Default

**Disabled by default** to avoid verbose output for users who don't need it.

## Decision Reasons (Predefined)

The system uses predefined reasons for consistency:

### smart_read
- `LARGE_FILE` - File is large (>500 lines), outline mode extracts structure only
- `SYMBOL_EXTRACTION` - Extracting specific symbol, smart_read can locate and extract it efficiently
- `TOKEN_BUDGET` - Token budget constraint, cascading to more compressed mode
- `MULTIPLE_SYMBOLS` - Reading multiple symbols, smart_read can batch them

### smart_search
- `MULTIPLE_FILES` - Query spans 50+ files, smart_search ranks by relevance
- `INTENT_AWARE` - Intent-aware search prioritizes relevant results
- `INDEX_BOOST` - Symbol index available, boosting relevant matches
- `PATTERN_SEARCH` - Complex pattern search, smart_search handles regex efficiently

### smart_context
- `TASK_CONTEXT` - Building complete context for task
- `RELATED_FILES` - Need related files (callers, tests, types)
- `ONE_CALL` - Single call to get all context, more efficient
- `DIFF_ANALYSIS` - Analyzing git diff, expanding changed symbols

### smart_shell
- `COMMAND_OUTPUT` - Command output needs compression
- `RELEVANT_LINES` - Extracting relevant lines from command output
- `SAFE_EXECUTION` - Using allowlist-validated command execution

### smart_summary
- `CHECKPOINT` - Saving task checkpoint for session recovery
- `RESUME` - Recovering previous task context
- `PERSISTENCE` - Maintaining task state across agent restarts

## Expected Benefits (Predefined)

- `TOKEN_SAVINGS(n)` - ~N tokens saved
- `FASTER_RESPONSE` - Faster response due to less data to process
- `BETTER_RANKING` - Better result ranking, relevant items first
- `COMPLETE_CONTEXT` - Complete context in single call
- `SESSION_RECOVERY` - Can recover task state if agent restarts
- `FOCUSED_RESULTS` - Focused on relevant code only

## Implementation Details

### Module: `src/decision-explainer.js`

**Functions:**
- `isExplainEnabled()` - Check if explanations are enabled
- `recordDecision({ tool, action, reason, alternative, expectedBenefit, context })` - Record decision
- `getSessionDecisions()` - Get all decisions for current session
- `formatDecisionExplanations()` - Format explanations as markdown
- `resetSessionDecisions()` - Reset session (for testing)

**Constants:**
- `DECISION_REASONS` - Predefined reasons for consistency
- `EXPECTED_BENEFITS` - Predefined benefits for consistency

### Integration Points

Decisions are recorded in each tool after `persistMetrics()`:

```javascript
recordDecision({
  tool: 'smart_read',
  action: `read ${filePath} (${mode} mode)`,
  reason: DECISION_REASONS.LARGE_FILE,
  alternative: 'Read (full file)',
  expectedBenefit: EXPECTED_BENEFITS.TOKEN_SAVINGS(savedTokens),
  context: `${lineCount} lines, ${rawTokens} tokens → ${compressedTokens} tokens`,
});
```

**Tools integrated:**
- `smart_read`
- `smart_search`
- `smart_context`
- `smart_shell`
- `smart_summary`

### Session Scope

Explanations are **per-session** (lifetime of the MCP server process).

- Restarting Cursor → resets session
- Restarting MCP server → resets session
- Long-running session → cumulative explanations

## Combine with Usage Feedback

For maximum visibility, enable both:

```bash
export DEVCTX_SHOW_USAGE=true
export DEVCTX_EXPLAIN=true
```

**Output:**
```markdown
---

📊 **devctx usage this session:**
- **smart_read**: 3 calls | ~45.0K tokens saved (file1.js, file2.js, file3.js)
- **smart_search**: 1 call | ~12.0K tokens saved (query)

**Total saved:** ~57.0K tokens

---

🤖 **Decision explanations:**

**smart_read** (read file1.js (outline mode))
- **Why:** File is large (2500 lines), outline mode extracts structure only
- **Expected benefit:** ~45.0K tokens saved

**smart_search** (search "query" (intent: debug))
- **Why:** Intent-aware search prioritizes relevant results
- **Expected benefit:** ~12.0K tokens saved, Better result ranking
```

## Testing

### Run Tests

```bash
npm test -- tests/decision-explainer.test.js
```

### Test Coverage

- ✅ Enabled/disabled detection
- ✅ Decision recording
- ✅ Explanation formatting
- ✅ Multiple decisions
- ✅ Optional fields handling
- ✅ Token count formatting
- ✅ Session reset

**542 tests total, 541 passing**

## Limitations

### 1. Session-Scoped Only

Explanations reset when MCP server restarts. Not persistent across sessions.

**Why:** Designed for real-time transparency, not historical analysis.

### 2. Only Tracks devctx Tools

Native tools (`Read`, `Grep`, etc.) are not explained.

**Why:** Explanations are specifically for devctx decision transparency.

### 3. Verbose Output

Can add 5-10 lines per tool call to agent responses.

**Why:** Disabled by default. Enable only when debugging or learning.

## FAQ

### Q: Does this slow down the agent?

**A:** No. Recording is synchronous and takes <1ms per tool call.

### Q: Will I see explanations for every response?

**A:** Only if devctx tools were used in that response. If agent uses only native tools, no explanations are shown.

### Q: Can I customize the reasons?

**A:** Not currently. Reasons are predefined for consistency.

### Q: Does this affect metrics reporting?

**A:** No. Explanations are separate from metrics. `npm run report:metrics` still works the same.

### Q: Can I see explanations for past sessions?

**A:** No. Explanations are session-scoped. They're for real-time transparency, not historical analysis.

## Related Features

- **Usage Feedback** (`docs/usage-feedback.md`) - Real-time usage visibility
- **Adoption Metrics** (`docs/adoption-metrics-design.md`) - Historical adoption analysis
- **Forcing Prompts** (`README.md`) - How to force devctx usage

## Summary

**Decision explainer provides transparency into agent decision-making**, helping users:
1. Understand why devctx tools were chosen
2. Learn best practices from agent decisions
3. Debug tool selection issues
4. Validate agent is making good choices

**Enable with:** `export DEVCTX_EXPLAIN=true`

**See explanations immediately** in agent responses when devctx tools are used.
