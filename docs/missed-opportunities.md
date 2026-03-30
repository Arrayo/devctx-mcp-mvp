# Missed Opportunities Detector

## Overview

The missed opportunities detector identifies when devctx **should have been used but wasn't**, helping users understand adoption gaps and potential token savings.

## Problem Solved

**Before:** Users couldn't tell when the agent was using native tools instead of devctx in complex tasks.

**After:** System detects patterns indicating missed devctx opportunities and shows actionable warnings.

## How It Works

### 1. Enable Detection

Set the environment variable:

```bash
export DEVCTX_DETECT_MISSED=true
```

### 2. Use AI Agent Normally

The system tracks devctx operations in the background.

### 3. See Warnings

When opportunities are detected, you'll see:

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

**Total potential savings:** ~184.0K tokens

**How to fix:**
1. Use forcing prompt: `Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)`
2. Check if index is built: `ls .devctx/index.json`
3. Verify MCP is active in Cursor settings

*To disable: `export DEVCTX_DETECT_MISSED=false`*
```

## What's Detected

### 1. No devctx Usage in Long Session (High Severity 🔴)

**Pattern:** Session active >5 minutes with 0 devctx calls.

**Reason:** Agent is not using devctx at all.

**Suggestion:** Use forcing prompt or check if MCP is active.

**Estimated savings:** ~10K tokens per estimated operation.

### 2. Low devctx Adoption (Medium Severity 🟡)

**Pattern:** devctx used in <30% of operations.

**Reason:** Agent is using native tools more than devctx.

**Suggestion:** Consider forcing prompt for complex tasks.

**Estimated savings:** ~8K tokens per non-devctx operation.

### 3. devctx Usage Dropped (Medium Severity 🟡)

**Pattern:** devctx was used, then no calls for >3 minutes.

**Reason:** Agent switched to native tools mid-session.

**Suggestion:** Re-apply forcing prompt if task is still complex.

**Estimated savings:** ~5K tokens per minute without devctx.

## Detection Heuristics

### Operation Estimation

Since we can't intercept native tool calls, we estimate total operations:

**Method:**
- Track devctx operations directly (accurate)
- Estimate native operations from time gaps
- Heuristic: ~1 operation per 10 seconds of activity

**Accuracy:**
- ✅ devctx operations: 100% accurate (we track them)
- ⚠️ Total operations: Estimated (may be off by 20-30%)
- ⚠️ Native operations: Inferred (not directly measured)

### Complexity Inference

**Simple session:** <5 operations, <2 minutes
**Moderate session:** 5-15 operations, 2-10 minutes
**Complex session:** 15+ operations, >10 minutes

### Adoption Thresholds

- **Good:** >50% devctx adoption
- **Medium:** 30-50% devctx adoption
- **Low:** <30% devctx adoption

## Limitations

### 1. Can't Intercept Native Tools

We can't see when agent uses `Read`, `Grep`, `Shell`, etc.

**Why:** These tools are handled by Cursor/Claude, not by MCP.

**Workaround:** Estimate from time gaps and devctx usage patterns.

### 2. Estimates May Be Inaccurate

Total operations are estimated, not measured.

**Why:** We only see devctx calls, not native calls.

**Impact:** Savings estimates may be off by 20-30%.

### 3. Session-Scoped Only

Detection resets when MCP server restarts.

**Why:** Designed for real-time monitoring, not historical analysis.

### 4. False Positives Possible

Simple tasks may trigger "low adoption" warnings.

**Why:** Heuristics can't distinguish simple vs complex tasks perfectly.

**Mitigation:** Warnings show context (duration, operations) for user judgment.

## Use Cases

### 1. Verify Agent is Using devctx

**Problem:** Not sure if agent is following rules.

**Solution:** Enable detection, see if warnings appear. No warnings = good adoption.

### 2. Debug Adoption Issues

**Problem:** Agent not using devctx in complex tasks.

**Solution:** Enable detection, see specific patterns (no usage, low adoption, usage dropped).

### 3. Quantify Missed Savings

**Problem:** Want to know how much could be saved.

**Solution:** Enable detection, see estimated savings per opportunity.

### 4. Validate Forcing Prompts

**Problem:** Used forcing prompt, want to verify it worked.

**Solution:** Enable detection, check if adoption improved (warnings stop appearing).

## Configuration

### Enable

```bash
export DEVCTX_DETECT_MISSED=true
# or
export DEVCTX_DETECT_MISSED=1
# or
export DEVCTX_DETECT_MISSED=yes
```

### Disable

```bash
export DEVCTX_DETECT_MISSED=false
# or
unset DEVCTX_DETECT_MISSED
```

### Default

**Disabled by default** to avoid false positives and estimation errors.

## Combine with Other Features

For maximum visibility:

```bash
export DEVCTX_SHOW_USAGE=true    # See what's used
export DEVCTX_EXPLAIN=true       # Understand why
export DEVCTX_DETECT_MISSED=true # Detect missed opportunities
```

**Output:**
```markdown
---

📊 **devctx usage this session:**
- **smart_read**: 2 calls | ~20.0K tokens saved

**Total saved:** ~20.0K tokens

---

🤖 **Decision explanations:**

**smart_read** (read file.js (outline mode))
- **Why:** File is large (2500 lines)
- **Expected benefit:** ~20.0K tokens saved

---

⚠️ **Missed devctx opportunities detected:**

**Session stats:**
- Duration: 180s
- devctx operations: 2
- Estimated total operations: 12
- devctx adoption: 17%

🟡 **low devctx adoption**
- **Issue:** Low devctx adoption: 2/12 operations (17%). Target: >50%.
- **Potential savings:** ~80.0K tokens
```

## Implementation Details

### Module: `src/missed-opportunities.js`

**Functions:**
- `isMissedDetectionEnabled()` - Check if detection is enabled
- `recordDevctxOperation()` - Track devctx tool usage
- `analyzeMissedOpportunities()` - Analyze session and detect patterns
- `formatMissedOpportunities()` - Format warnings as markdown
- `getSessionActivity()` - Get session stats
- `resetSessionActivity()` - Reset session (for testing)

**Detection Logic:**
1. Track devctx operations (accurate)
2. Estimate total operations from time + devctx calls
3. Calculate adoption ratio
4. Detect patterns (no usage, low adoption, usage dropped)
5. Estimate potential savings

### Integration Points

Tracking is added in each tool after `persistMetrics()`:

```javascript
recordDevctxOperation();
```

**Tools integrated:**
- `smart_read`
- `smart_search`
- `smart_context`
- `smart_shell`
- `smart_summary`

### Session Scope

Detection is **per-session** (lifetime of the MCP server process).

- Restarting Cursor → resets session
- Restarting MCP server → resets session
- Long-running session → cumulative tracking

## Testing

### Run Tests

```bash
npm test -- tests/missed-opportunities.test.js
```

### Test Coverage

- ✅ Enabled/disabled detection
- ✅ Operation tracking
- ✅ No usage detection
- ✅ Low adoption detection
- ✅ Usage dropped detection
- ✅ Short session handling
- ✅ Warning formatting
- ✅ Estimated savings calculation

**553 tests total, 552 passing**

## FAQ

### Q: How accurate are the estimates?

**A:** devctx operations are 100% accurate. Total operations are estimated (may be off by 20-30%). Savings estimates are conservative.

### Q: Will I see warnings for every response?

**A:** No. Warnings only appear when patterns are detected (no usage, low adoption, usage dropped).

### Q: Can I customize the thresholds?

**A:** Not currently. Thresholds are fixed (5 min for no usage, 30% for low adoption, 3 min for dropped).

### Q: Does this slow down the agent?

**A:** No. Tracking is synchronous and takes <1ms per tool call. Analysis is only done when formatting output.

### Q: Can I see missed opportunities for past sessions?

**A:** No. Detection is session-scoped. For historical analysis, use adoption metrics: `npm run report:metrics`.

## Related Features

- **Usage Feedback** (`docs/usage-feedback.md`) - See what's used
- **Decision Explainer** (`docs/decision-explainer.md`) - Understand why
- **Adoption Metrics** (`docs/adoption-metrics-design.md`) - Historical analysis

## Summary

**Missed opportunities detector identifies adoption gaps**, helping users:
1. Verify agent is using devctx
2. Detect when agent switches to native tools
3. Quantify potential token savings
4. Validate forcing prompts worked

**Enable with:** `export DEVCTX_DETECT_MISSED=true`

**See warnings** when patterns indicate devctx should have been used.
