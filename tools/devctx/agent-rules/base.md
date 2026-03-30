# Base Agent Rules (Always Active)

## Recommended Entry Point

For **non-trivial tasks** (debugging, review, refactor, testing, architecture), start with:

```
smart_turn(start, userPrompt, ensureSession=true)
```

**Why?**
- Recovers previous task checkpoint (goal, status, decisions)
- Classifies task continuation vs new task
- Provides repo safety check
- Enables task recovery if interrupted
- Tracks metrics for optimization

**When to skip:** Trivial tasks (read single file, simple search, one-off questions)

---

## Core Tools

Prefer devctx MCP tools when they add value:

- `smart_read(outline|signatures|symbol)` - Compressed reading (90% savings)
- `smart_search(intent=...)` - Intent-aware search with ranking
- `smart_context` - One-call context builder
- `smart_shell` - Safe diagnostic commands

---

## Recommended Flow

```
1. smart_turn(start, userPrompt, ensureSession=true)
2. smart_context(...) or smart_search(intent=...)
3. smart_read(mode=outline|signatures|symbol)
4. [work]
5. smart_shell('npm test')
6. smart_turn(end, event=milestone|blocker|task_complete)
```

---

## Reading Cascade

Prefer compressed, cascade to full only if needed:

1. `outline` - Structure only (~90% savings)
2. `signatures` - Exported API
3. `symbol` - Specific function
4. `full` - Last resort

---

**These are suggestions, not guarantees.** You decide when devctx tools add value based on the task.
