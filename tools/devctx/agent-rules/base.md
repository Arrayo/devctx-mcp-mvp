# Base Agent Rules (Always Active)

For file reading, code search, and diagnostics, prefer devctx MCP tools when they add value:

**Core tools:**
- `smart_read(outline|signatures|symbol)` - Compressed reading (90% savings)
- `smart_search(intent=...)` - Intent-aware search with ranking
- `smart_context` - One-call context builder
- `smart_shell` - Safe diagnostic commands

**Entry point for non-trivial tasks:**
```
smart_turn(start, userPrompt, ensureSession=true)
→ work with devctx tools
→ smart_turn(end, event=milestone|blocker|task_complete)
```

**Reading cascade (prefer compressed):**
1. `outline` - Structure only (~90% savings)
2. `signatures` - Exported API
3. `symbol` - Specific function
4. `full` - Last resort

**These are suggestions, not guarantees.** You decide when devctx tools add value based on the task.
