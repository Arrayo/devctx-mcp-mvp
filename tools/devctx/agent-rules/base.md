# Base Agent Rules (Always Active)

## Preflight (First Time in Project)

**First time in project?** Run `build_index` to enable search/context quality.

Without index:
- `smart_search` has no ranking data
- `smart_context` has no symbol graph
- Quality degraded, agent may prefer native tools

With index:
- `smart_search` ranks by relevance
- `smart_context` builds optimal context
- 90% token savings enabled

**Recommended flow for new projects:**
```
1. build_index (one-time setup)
2. smart_turn(start) (begin work)
3. smart_context/smart_search (use tools)
4. smart_turn(end) (checkpoint progress)
```

---

## Tool Preference

Prefer devctx MCP for non-trivial tasks:
- `smart_read(outline|signatures|symbol)` instead of Read → 90% savings
- `smart_search(intent=...)` instead of Grep → ranked results
- `smart_context` instead of multiple reads → one-call builder
- `smart_shell` instead of Shell → safe diagnostics

For non-trivial tasks: `smart_turn(start)` → [work with devctx tools] → `smart_turn(end)`

Reading cascade: `outline` → `signatures` → `symbol` → `full` (last resort)

**Detailed workflows:** See `profiles/` or `profiles-compact/` for task-specific guidance (debugging, code-review, refactoring, testing, architecture)

---

## Feedback When Not Used

If you didn't use devctx tools in a non-trivial programming task, add at the end:

**Note:** devctx not used because: [task too simple | MCP unavailable | index not built | already had sufficient context | native tool more direct for this case]. To use devctx next time: "Use smart-context-mcp: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)"

**Why this matters:**
- Makes non-usage visible to the user
- Educates about when devctx adds value
- Increases probability of usage in next turn
- Helps identify MCP/rules/index setup issues

---

**These are suggestions, not guarantees.** You decide when devctx tools add value based on the task.
