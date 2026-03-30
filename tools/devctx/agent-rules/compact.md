# devctx Agent Rules (Compact)

## Tool Preference

Prefer devctx MCP over built-ins:
- `smart_read(outline|signatures|symbol)` instead of Read → 90% savings
- `smart_search(intent=...)` instead of Grep → ranked results
- `smart_shell` instead of Shell → safe diagnostics
- `smart_context` instead of multiple reads → one-call builder

## Context Recovery

**Start:** `smart_turn(start, userPrompt, ensureSession=true)` - recovers previous context  
**End:** `smart_turn(end, event=milestone|blocker|task_complete)` - checkpoints progress

If `ambiguous_resume`: `smart_summary(sessionId='auto')`

## Reading Strategy

1. `outline` - structure only (~90% savings)
2. `signatures` - exported API
3. `symbol` - specific function
4. `range` - specific lines
5. `full` - last resort

## Search Strategy

Always pass `intent` for task-aware ranking:
- `debug` → errors, logs, exceptions
- `implementation` → source files, changed files
- `tests` → test files
- `config` → config files, env vars
- `explore` → balanced

## By Task

**Debugging:**
```
smart_turn(start) → smart_search(intent=debug) → smart_read(symbol) → 
smart_shell('npm test') → fix → smart_turn(end)
```

**Code Review:**
```
smart_turn(start) → smart_context(diff=true) → smart_read(signatures) → 
review → smart_turn(end)
```

**Refactoring:**
```
smart_turn(start) → smart_context(entryFile) → smart_read(signatures) → 
refactor → smart_shell('npm test') → smart_turn(end)
```

**Testing:**
```
smart_turn(start) → smart_search(intent=tests) → smart_read(symbol) → 
write test → smart_shell('npm test') → smart_turn(end)
```

**Architecture:**
```
smart_turn(start) → smart_context(detail=minimal) → smart_read(signatures) → 
analyze → smart_turn(end)
```

## Repository Safety

Check `repoSafety` in responses. If `.devctx/state.sqlite` is tracked/staged, fix git hygiene first.

## Important

These are **suggestions**, not guarantees. You decide when to use devctx tools based on the task.
