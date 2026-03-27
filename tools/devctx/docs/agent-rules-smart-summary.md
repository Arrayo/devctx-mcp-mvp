# Agent Rules: smart_summary

## When to use smart_summary

Use `smart_summary` to maintain conversation continuity across sessions without token bloat.

### Mandatory usage points:

1. **Start of every non-trivial conversation turn**: Prefer `smart_turn({ phase: "start", prompt, ensureSession: true })` to check or create context with one call
2. **After completing milestones**: Prefer `smart_turn({ phase: "end", event: "milestone", update: {...} })`; it delegates to `smart_summary(checkpoint)` but keeps the turn workflow standardized
3. **Before ending work**: Ensure latest state is saved with current `nextStep`
4. **When resuming work**: Always call `smart_turn({ phase: "start", prompt })` or `smart_summary({ action: "get" })` first
5. **Periodically in longer projects**: Call `smart_summary({ action: "compact" })` to enforce retention on SQLite events
6. **After migration is stable**: Use `smart_summary({ action: "cleanup_legacy" })` as a dry-run, then `apply: true` only when the report says artifacts are safe to remove

If `smart_summary(get)` returns multiple `candidates`, prefer `recommendedSessionId` or call `smart_summary({ action: "get", sessionId: "auto" })` to accept the recommendation explicitly.
If `repoSafety` warns that `.devctx/state.sqlite` is tracked or staged, mutating `smart_summary` actions are blocked at runtime until git hygiene is fixed. If it only warns about missing ignore rules, treat that as urgent but non-blocking.
When available, prefer native client hooks over prompt-only rules. Claude Code can now enforce this flow with generated hooks that call devctx automatically on `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop`.
For non-Claude CLI agents, use `smart-context-headless` as the wrapper fallback when you want one-shot automation around a headless prompt run.

### Workflow pattern:

```
Turn 1: smart_turn(start) → smart_context(task) → implement → smart_turn(end milestone)
Turn 2: smart_turn(start) → continue from nextStep → implement → smart_turn(end milestone)
...
After weekend: smart_summary(get) → full context restored → continue
```

`smart_summary(get)` now restores the active session when possible and auto-resumes the best saved session when there is a single clear candidate.

## What to track

### Always include:
- **goal**: Primary objective (never changes unless pivoting)
- **status**: `planning` | `in_progress` | `blocked` | `completed`
- **nextStep**: Immediate next action (critical for resume)
- **pinnedContext**: 1-3 critical constraints or decisions that must survive compression
- **currentFocus**: Current active area in a short phrase
- **touchedFiles**: Files modified in this session

### Include when relevant:
- **completed**: Steps finished (append incrementally)
- **decisions**: Key architectural/technical decisions with brief rationale
- **blockers**: Current blockers preventing progress
- **unresolvedQuestions**: Open questions that should be answered next
- **whyBlocked**: One-line blocker summary when `status` is `blocked`

### Do NOT track:
- Implementation details (code snippets, function names)
- Obvious steps ("read file", "write code")
- Temporary debugging info
- Full file paths if already in touchedFiles

## Examples

### Good usage:

```javascript
// After implementing auth
smart_summary({ 
  action: "checkpoint",
  event: "milestone",
  update: {
    pinnedContext: ["JWT access token stays at 1h unless product asks otherwise"],
    unresolvedQuestions: ["Do refresh tokens need device scoping?"],
    currentFocus: "RBAC middleware",
    completed: ["JWT middleware", "login endpoint"],
    decisions: ["1h access token + 7d refresh", "bcrypt rounds=12"],
    touchedFiles: ["src/auth/middleware.js", "src/routes/auth.js"],
    nextStep: "add role-based access control"
  }
})
```

### Bad usage:

```javascript
// Too verbose, includes implementation details
smart_summary({ 
  action: "append",
  update: {
    completed: [
      "Read src/auth/middleware.js",
      "Wrote function verifyToken()",
      "Added import for jsonwebtoken",
      "Fixed linting errors"
    ],
    decisions: [
      "Used arrow function instead of function declaration",
      "Put middleware in separate file"
    ]
  }
})
```

## Session management

- **Single feature/task**: Use one session, append incrementally
- **Multiple parallel features**: Create separate sessions with descriptive `sessionId`
- **Switching contexts**: Call `list_sessions` to see available sessions, then `get` with specific `sessionId`
- **Long-running repos**: Run `compact` occasionally so retained event history stays cheap to read and store
- **Legacy cleanup**: Never delete imported JSON/JSONL artifacts blindly; inspect `cleanup_legacy` first, then apply explicitly
- **Ambiguous resume**: Use `recommendedSessionId` from `get`, or pass `sessionId: "auto"` to accept the tool's recommendation
- **Completed work**: Keep session for reference, or `reset` to start fresh
- **Git hygiene**: Treat `repoSafety` warnings as actionable; `.devctx/state.sqlite` should stay ignored and untracked
- **Low-signal turns**: Use `event: "read_only"` or `event: "heartbeat"` when the turn should not persist by default

## Token budget

Default 500 tokens is sufficient for most sessions. Increase to 1000-2000 only for complex multi-week projects with many decisions.

Compression is automatic — the tool keeps the full session state, then derives a resume summary that preserves `status`, `nextStep`, and active blockers first.
