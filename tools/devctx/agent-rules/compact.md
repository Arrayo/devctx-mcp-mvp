# devctx Agent Rules (Compact)

Prefer devctx MCP for non-trivial tasks:
- `smart_read(outline|signatures|symbol)` instead of Read → 90% savings
- `smart_search(intent=...)` instead of Grep → ranked results
- `smart_context` instead of multiple reads → one-call builder
- `smart_shell` instead of Shell → safe diagnostics

For non-trivial tasks: `smart_turn(start)` → [work with devctx tools] → `smart_turn(end)`

Reading cascade: `outline` → `signatures` → `symbol` → `full` (last resort)

**Detailed workflows:** See `profiles/` or `profiles-compact/` for task-specific guidance (debugging, code-review, refactoring, testing, architecture)

---

**These are suggestions, not guarantees.** You decide when devctx tools add value based on the task.
