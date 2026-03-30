# Preflight Visibility: Making build_index Prominent

## Problem

`build_index` is critical for devctx quality, but it's easy to miss:
- Not mentioned in base agent rules
- Buried in "Day 1" instructions
- Agent doesn't know to run it first
- Users don't realize it's required

**Result:** Users install MCP, agent tries to use tools, but:
- `smart_search` has no ranking data → returns unranked results
- `smart_context` has no symbol graph → can't build optimal context
- Quality is degraded → agent perceives less value → prefers native tools
- No token savings → user thinks MCP doesn't work

## Solution

Make `build_index` **highly visible** at three levels:

### 1. Base Agent Rule (Always Visible)

Added to `.cursor/rules/devctx.mdc`:

```markdown
**First time in project?** Run build_index to enable search/context quality.
```

This appears in **every** agent interaction, making it impossible to miss.

### 2. README Preflight Section (Prominent)

Added new section "⚠️ Preflight: Build Index First" immediately after "Recommended Workflow" header, before "The Entry Point: smart_turn(start)".

**Key messages:**
- Without index: degraded quality, agent prefers native tools, no savings
- With index: ranked search, optimal context, 90% savings
- When to run: first time, after refactors, after adding files
- How agents know: base rule + feedback rule

### 3. Updated Workflow (Step 0)

Changed recommended flow from:

```
1. smart_turn(start)
2. smart_context/smart_search
3. smart_read
...
```

To:

```
0. build_index (if first time in project)
1. smart_turn(start)
2. smart_context/smart_search
3. smart_read
...
```

**Step 0** makes it clear: index comes **before** everything else.

## Why This Matters

### Without Index

```
User: "Debug this error"
Agent: [tries smart_search]
Agent: [gets unranked results, hard to find error]
Agent: [falls back to Grep]
Agent: [uses Read instead of smart_read]
Result: No token savings, user confused
```

### With Index

```
User: "Debug this error"
Agent: [sees "First time? Run build_index"]
Agent: [calls build_index]
Agent: [calls smart_search with intent=debug]
Agent: [gets ranked results, error at top]
Agent: [calls smart_read(mode=symbol)]
Result: 90% token savings, user happy
```

## Impact on Fixed Context Cost

**Before:** 13 lines (base rule + feedback)  
**After:** 14 lines (base rule + preflight + feedback)  
**Increase:** 1 line (7.7% increase)

**Trade-off:** 1 extra line for:
- Ensuring index is built
- Preventing quality degradation
- Maximizing token savings
- Reducing agent confusion

**Verdict:** Worth it. The 1 line prevents the most common setup failure.

## Expected Agent Behavior

### Scenario 1: First Time in Project (No Index)

```
User: "Debug this authentication error"
Agent: [sees "First time in project? Run build_index"]
Agent: "I'll build the index first to enable search quality."
Agent: [calls build_index]
Agent: [waits for completion]
Agent: [calls smart_turn(start)]
Agent: [calls smart_search(intent=debug)]
Agent: [finds error with ranked results]
```

### Scenario 2: Index Already Built

```
User: "Debug this authentication error"
Agent: [sees "First time in project? Run build_index"]
Agent: [checks if index exists in .devctx/]
Agent: [index exists, skips build_index]
Agent: [calls smart_turn(start)]
Agent: [calls smart_search(intent=debug)]
Agent: [finds error with ranked results]
```

### Scenario 3: Index Stale (After Major Refactor)

```
User: "Find the new UserService class"
Agent: [calls smart_search]
Agent: [doesn't find it - index is stale]
Agent: "I'll rebuild the index to include recent changes."
Agent: [calls build_index with incremental=false]
Agent: [calls smart_search again]
Agent: [finds UserService]
```

### Scenario 4: Agent Skips Index (Feedback Catches It)

```
User: "Debug this error"
Agent: [ignores build_index, uses Grep]
Agent: [finds error but uses Read for full file]
Agent: "Note: devctx not used because: index not built. 
       To use devctx next time: 'Use smart-context-mcp: smart_turn(start) → ...'"
User: [sees feedback, knows to build index]
User: "Run build_index tool"
Agent: [builds index]
User: "Now debug the error"
Agent: [uses smart_search with ranking, smart_read with compression]
```

## User Experience

### Before (Index Not Visible)

```
Day 1:
User: Installs MCP
User: "Debug this error"
Agent: [uses Grep, Read, Shell]
Agent: [no token savings]
User: "Why isn't this working?"

Day 2:
User: Reads docs more carefully
User: Finds "npm run build-index" buried in Day 1 section
User: Runs build-index
User: "Debug this error"
Agent: [uses smart_search, smart_read]
Agent: [90% token savings]
User: "Oh, now it works!"
```

### After (Index Highly Visible)

```
Day 1:
User: Installs MCP
User: "Debug this error"
Agent: "I'll build the index first to enable search quality."
Agent: [builds index]
Agent: [uses smart_search, smart_read]
Agent: [90% token savings]
User: "This is great!"
```

## Documentation Updates

### Files Changed

1. `.cursor/rules/devctx.mdc` - Added preflight line (+1 line)
2. `tools/devctx/agent-rules/base.md` - Added preflight section with rationale
3. `tools/devctx/agent-rules/compact.md` - Added preflight line
4. `tools/devctx/scripts/init-clients.js` - Updated generator
5. `README.md` - Added "⚠️ Preflight" section, updated workflow to include Step 0
6. `README.md` - Changed "Day 1" to "Getting Started" with emphasis on index

### Key Messages

**Base rule (always visible):**
```
First time in project? Run build_index to enable search/context quality.
```

**README preflight (prominent):**
```
⚠️ Preflight: Build Index First

Without index:
- ❌ smart_search has no ranking data
- ❌ smart_context has no symbol graph
- ❌ Quality degraded → agent prefers native tools

With index:
- ✅ smart_search ranks by relevance
- ✅ smart_context builds optimal context
- ✅ 90% token savings enabled
```

**Workflow (step 0):**
```
0. build_index (if first time in project)
   ↓ enables search ranking and context quality
```

## Metrics to Track

To measure the impact of this change, track:

1. **Index build rate** - How often do users build index in first session?
2. **Time to first build** - How long after install do users build index?
3. **Tool usage before/after index** - Does usage increase after index is built?
4. **Feedback frequency** - How often does "index not built" appear in feedback?

These metrics will show whether the visibility changes are working.

## Next Steps

This preflight visibility is **Step 3** of the adoption optimization plan. Next steps:

1. ✅ **Reduce base rule** (Step 1 - completed)
2. ✅ **Add feedback when devctx not used** (Step 2 - completed)
3. ✅ **Make preflight (build_index) more visible** (Step 3 - this document)
4. 🔄 **Matize "faster and more accurate" claim** (Step 4 - next)

## References

- Base rule reduction: `docs/agent-rules/base-rule-reduction.md`
- Feedback when not used: `docs/agent-rules/feedback-when-not-used.md`
- Design rationale: `docs/agent-rules/design-rationale.md`
