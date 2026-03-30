# devctx Agent Rules (Compact)

**First time in project?** Run `build_index` to enable search/context quality.

Prefer devctx MCP for non-trivial tasks:
- `smart_read(outline|signatures|symbol)` instead of Read → 90% savings
- `smart_search(intent=...)` instead of Grep → ranked results
- `smart_context` instead of multiple reads → one-call builder
- `smart_shell` instead of Shell → safe diagnostics

For non-trivial tasks: `smart_turn(start)` → [work with devctx tools] → `smart_turn(end)`

Reading cascade: `outline` → `signatures` → `symbol` → `full` (last resort)

**Detailed workflows:** See `profiles/` or `profiles-compact/` for task-specific guidance (debugging, code-review, refactoring, testing, architecture)

---

If you didn't use devctx tools in a non-trivial programming task, add at the end:

**Note:** devctx not used because: [task too simple | MCP unavailable | index not built | already had sufficient context | native tool more direct for this case]. To use devctx next time: "Use smart-context-mcp: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)"

---

**These are suggestions, not guarantees.** You decide when devctx tools add value based on the task.
