# Issue: Tool-Level Metrics Visibility

## Problem

User feedback: "Las métricas son útiles, pero todavía algo parciales. smart_metrics reflejó sobre todo smart_summary/smart_turn; el valor práctico de smart_context y smart_read se notó durante el trabajo, pero no quedó tan visible en la métrica agregada de sesión."

**Root cause:** The `smart_metrics` tool returns detailed per-tool breakdown in `summary.tools[]`, but agents typically only surface the aggregate numbers (`summary.savedTokens`, `summary.netSavingsPct`). The real value from `smart_context`, `smart_read`, and `smart_search` is buried in the array.

## Current Behavior

When an agent calls `smart_metrics`, the response includes:

```json
{
  "summary": {
    "count": 9,
    "savedTokens": 578,
    "netSavedTokens": 426,
    "netSavingsPct": 26.19,
    "tools": [
      { "tool": "smart_context", "count": 2, "savedTokens": 450, "netSavingsPct": 85.2 },
      { "tool": "smart_read", "count": 3, "savedTokens": 120, "netSavingsPct": 78.5 },
      { "tool": "smart_turn", "count": 2, "savedTokens": 8, "overheadTokens": 152 }
    ]
  }
}
```

But agents typically only show: "9 eventos, 578 tokens ahorrados, 26.19% ahorro neto" without breaking down **which tools delivered the value**.

## Expected Behavior

The per-tool breakdown should be **prominently surfaced** so users can see:
- `smart_context` and `smart_read` delivered 570 of 578 tokens saved (98.6%)
- `smart_turn` added 152 tokens overhead but only saved 8 tokens
- Net value comes from compression tools, not orchestration tools

## Proposed Solutions

### Option 1: Enhanced Summary Format (Recommended)

Add a `topTools` field to the summary that highlights the 3 tools with highest net savings:

```json
{
  "summary": {
    "count": 9,
    "savedTokens": 578,
    "netSavedTokens": 426,
    "netSavingsPct": 26.19,
    "topTools": [
      { "tool": "smart_context", "netSavedTokens": 298, "netSavingsPct": 85.2 },
      { "tool": "smart_read", "netSavedTokens": 120, "netSavingsPct": 78.5 },
      { "tool": "smart_search", "netSavedTokens": 8, "netSavingsPct": 12.3 }
    ],
    "tools": [ /* full array */ ]
  }
}
```

This makes it trivial for agents to show: "Top savings: smart_context (298 tokens, 85%), smart_read (120 tokens, 78%)"

### Option 2: Separate Compression vs Orchestration Metrics

Split the summary into two categories:

```json
{
  "summary": {
    "compression": {
      "count": 5,
      "savedTokens": 570,
      "netSavingsPct": 82.1,
      "tools": ["smart_context", "smart_read", "smart_search"]
    },
    "orchestration": {
      "count": 4,
      "savedTokens": 8,
      "overheadTokens": 152,
      "netSavingsPct": -18.5,
      "tools": ["smart_turn", "smart_summary"]
    }
  }
}
```

This makes the value proposition crystal clear: compression tools deliver the savings, orchestration tools add overhead but provide continuity.

### Option 3: Agent Rule Enhancement

Update agent rules to explicitly instruct agents to surface the per-tool breakdown when showing metrics:

```markdown
When showing smart_metrics results, ALWAYS include the top 3 tools by net savings:
- Tool name, net saved tokens, net savings %
- Example: "smart_context: 298 tokens (85%), smart_read: 120 tokens (78%)"
```

## Recommendation

Implement **Option 1** (enhanced summary with `topTools`) because:
1. Minimal code change (just add a derived field to the summary)
2. Backward compatible (existing `tools` array unchanged)
3. Makes it trivial for agents to surface the right information
4. Works across all clients (MCP response format)

Then add **Option 3** (agent rule) as a fallback to ensure agents actually use it.

## Implementation

1. Add `topTools` field to `aggregateMetrics()` in `metrics.js`
2. Update `smart_metrics` return value to include it
3. Update agent rules to show `topTools` when displaying metrics
4. Add test coverage for `topTools` ordering and filtering

## Impact

Users will immediately see which tools delivered value:
- "smart_context saved 298 tokens (85%), smart_read saved 120 tokens (78%)"
- Instead of: "9 eventos, 578 tokens ahorrados, 26.19% ahorro neto"

This addresses the feedback: "el valor práctico de smart_context y smart_read se notó durante el trabajo, pero no quedó tan visible en la métrica agregada de sesión."
