# Usage Feedback System

## Overview

The usage feedback system provides **real-time visibility** into devctx tool usage within the current session. When enabled, it displays a summary at the end of agent responses showing which tools were used and how many tokens were saved.

## Problem Solved

**Before:** Users had no way to know if the agent was using devctx tools until running `npm run report:metrics` later.

**After:** Users see immediate feedback in every response when devctx tools are used.

## How It Works

### 1. Automatic Onboarding Mode

Feedback is **automatically enabled** for your first 10 tool calls.

**Why:** Helps new users verify devctx is working without manual configuration.

**What happens:**
- First 10 tool calls → feedback shown
- After 10 calls → auto-disables to reduce noise
- Message shows: `*Onboarding mode: showing for N more tool calls*`

### 2. Manual Control (Optional)

Override onboarding behavior:

```bash
# Keep feedback enabled permanently
export DEVCTX_SHOW_USAGE=true

# Disable immediately (skip onboarding)
export DEVCTX_SHOW_USAGE=false
```

Or in your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# Enable devctx usage feedback permanently
export DEVCTX_SHOW_USAGE=true
```

### 3. Use devctx Tools

When the agent uses devctx tools (`smart_read`, `smart_search`, `smart_context`, etc.), usage is automatically tracked.

### 4. See Feedback

At the end of the agent's response, you'll see:

```markdown
---

📊 **devctx usage this session:**
- **smart_read**: 3 calls | ~45.0K tokens saved (file1.js, file2.js, file3.js)
- **smart_search**: 1 call | ~12.0K tokens saved (query)

**Total saved:** ~57.0K tokens

*To disable this message: `export DEVCTX_SHOW_USAGE=false`*
```

## What's Tracked

For each tool:
- **Call count** - How many times the tool was used
- **Tokens saved** - Total tokens saved by that tool
- **Targets** - Last 3 files/queries (for context)

Overall:
- **Total tokens saved** - Cumulative savings across all tools

## Features

### Automatic Aggregation

Multiple calls to the same tool are aggregated:

```
smart_read: 5 calls | ~120.0K tokens saved (3 files)
```

### Smart Formatting

Token counts are formatted for readability:
- `1,234 tokens` → `1.2K tokens`
- `1,234,567 tokens` → `1.2M tokens`

### Target Truncation

Long file paths are truncated:
- `very/long/path/to/file.js` → `.../file.js`

### Sorted by Usage

Tools are sorted by call count (most used first).

## Configuration

### Onboarding Mode (Default)

**Automatically enabled** for first 10 tool calls, then auto-disables.

**Why:**
- New users see feedback immediately (verify it works)
- Experienced users don't see noise after onboarding
- Best of both worlds: helpful initially, quiet later

### Manual Enable

```bash
export DEVCTX_SHOW_USAGE=true
# or
export DEVCTX_SHOW_USAGE=1
# or
export DEVCTX_SHOW_USAGE=yes
```

**Effect:** Feedback always shown, even after 10+ tool calls.

### Manual Disable

```bash
export DEVCTX_SHOW_USAGE=false
# or
export DEVCTX_SHOW_USAGE=0
# or
export DEVCTX_SHOW_USAGE=no
# or
unset DEVCTX_SHOW_USAGE
```

**Effect:** Feedback never shown, even during onboarding.

### Priority

1. **Explicit env var** (`DEVCTX_SHOW_USAGE=true/false`) → overrides everything
2. **Onboarding mode** (first 10 calls) → auto-enable
3. **Default** → disabled after onboarding

## Use Cases

### 1. Verify Agent is Using devctx

**Problem:** Not sure if agent is following rules.

**Solution:** Enable feedback, see immediately if devctx tools are used.

### 2. Debug Adoption Issues

**Problem:** Agent not using devctx in complex tasks.

**Solution:** Enable feedback, see which tools are missing, adjust rules.

### 3. Measure Real-Time Savings

**Problem:** Want to see token savings as you work.

**Solution:** Enable feedback, see cumulative savings per session.

### 4. Validate Forcing Prompts

**Problem:** Used forcing prompt, not sure if it worked.

**Solution:** Enable feedback, confirm agent used devctx tools.

## Implementation Details

### Module: `src/usage-feedback.js`

**Functions:**
- `isFeedbackEnabled()` - Check if feedback is enabled
- `recordToolUsage({ tool, savedTokens, target })` - Record tool usage
- `getSessionUsage()` - Get current session stats
- `formatUsageFeedback()` - Format feedback as markdown
- `resetSessionUsage()` - Reset session (for testing)

### Integration Points

Feedback is recorded in each tool after `persistMetrics()`:

```javascript
await persistMetrics(metrics);

// Record usage for feedback
recordToolUsage({
  tool: 'smart_read',
  savedTokens: metrics.savedTokens,
  target: path.relative(projectRoot, fullPath),
});
```

**Tools integrated:**
- `smart_read`
- `smart_search`
- `smart_context`
- `smart_shell`
- `smart_summary`

### Session Scope

Feedback is **per-session** (lifetime of the MCP server process).

- Restarting Cursor → resets session
- Restarting MCP server → resets session
- Long-running session → cumulative stats

To reset manually (for testing):

```javascript
import { resetSessionUsage } from './src/usage-feedback.js';
resetSessionUsage();
```

## Example Outputs

### Single Tool

```markdown
📊 **devctx usage this session:**
- **smart_read**: 1 call | ~12.5K tokens saved (src/index.js)

**Total saved:** ~12.5K tokens
```

### Multiple Tools

```markdown
📊 **devctx usage this session:**
- **smart_search**: 3 calls | ~85.0K tokens saved (3 files)
- **smart_read**: 5 calls | ~45.0K tokens saved (3 files)
- **smart_context**: 1 call | ~28.0K tokens saved (task)

**Total saved:** ~158.0K tokens
```

### Large Savings

```markdown
📊 **devctx usage this session:**
- **smart_search**: 10 calls | ~1.2M tokens saved (10 files)
- **smart_read**: 25 calls | ~850.0K tokens saved (3 files)

**Total saved:** ~2.1M tokens
```

## Testing

### Run Tests

```bash
npm test -- tests/usage-feedback.test.js
```

### Test Coverage

- ✅ Enabled/disabled detection
- ✅ Tool usage recording
- ✅ Aggregation of multiple calls
- ✅ Feedback formatting
- ✅ Token count formatting
- ✅ Target truncation
- ✅ Sorting by usage
- ✅ Session reset

**530 tests total, 529 passing**

## Limitations

### 1. Session-Scoped Only

Feedback resets when MCP server restarts. Not persistent across sessions.

**Why:** Designed for real-time visibility, not historical tracking (use `npm run report:metrics` for that).

### 2. No Aggregation Across Sessions

Each Cursor restart = new session = reset counters.

**Why:** Keeps feedback focused on current work, not cluttered with old data.

### 3. Only Tracks devctx Tools

Native tools (`Read`, `Grep`, etc.) are not tracked.

**Why:** Feedback is specifically for devctx adoption visibility.

## Future Enhancements (Not Implemented)

### 1. Persistent Session Tracking

Store session stats in SQLite, survive restarts.

### 2. Per-Task Feedback

Show feedback per `smart_turn` session, not just overall.

### 3. Comparison with Baseline

Show "You saved X tokens vs native tools" with estimated baseline.

### 4. Feedback in Tool Output

Include feedback directly in tool response (not just at end).

## FAQ

### Q: Does this slow down the agent?

**A:** No. Recording is synchronous and takes <1ms per tool call.

### Q: Will I see feedback for every response?

**A:** Only if devctx tools were used in that response. If agent uses only native tools, no feedback is shown.

### Q: Can I customize the feedback format?

**A:** Not currently. Format is fixed for consistency.

### Q: Does this affect metrics reporting?

**A:** No. Feedback is separate from metrics. `npm run report:metrics` still works the same.

### Q: Can I see feedback for past sessions?

**A:** No. Feedback is session-scoped. Use `npm run report:metrics` for historical data.

## Related Features

- **Adoption Metrics** (`docs/adoption-metrics-design.md`) - Historical adoption analysis
- **Metrics Reporting** (`npm run report:metrics`) - Comprehensive token savings report
- **Forcing Prompts** (`README.md`) - How to force devctx usage

## Summary

**Usage feedback provides real-time visibility into devctx tool usage**, helping users:
1. Verify agent is using devctx
2. Debug adoption issues
3. Measure token savings as they work
4. Validate forcing prompts

**Enable with:** `export DEVCTX_SHOW_USAGE=true`

**See feedback immediately** in agent responses when devctx tools are used.
