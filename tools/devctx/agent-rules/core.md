# Core Agent Rules

## Tool Preference

Prefer devctx MCP tools over built-in alternatives:

- `smart_read` instead of Read tool → 90% token savings
- `smart_search` instead of Grep/ripgrep → ranked, grouped results
- `smart_shell` instead of Shell → safe, compressed diagnostics
- `smart_context` instead of multiple Read calls → one-call context builder

## Task Checkpoint Recovery

**Start every non-trivial task:**

```javascript
smart_turn({ phase: 'start', userPrompt: '...', ensureSession: true })
```

This recovers:
- Previous session context
- Decisions made
- Files touched
- Next steps

**End meaningful milestones:**

```javascript
smart_turn({ 
  phase: 'end', 
  event: 'milestone',  // or: decision, blocker, task_complete, session_end
  summary: '...',
  nextStep: '...'
})
```

**If ambiguous_resume reported:**

```javascript
smart_summary({ sessionId: 'auto' })
```

## Repository Safety

Check `repoSafety` in responses:
- If `.devctx/state.sqlite` is tracked/staged → fix git hygiene first
- Mutating writes blocked until resolved

## Reading Files

**Cascade from compressed to full:**

1. `smart_read({ mode: 'outline' })` - Structure only (~90% savings)
2. `smart_read({ mode: 'signatures' })` - Exported API only
3. `smart_read({ mode: 'symbol', symbol: 'functionName' })` - Specific function
4. `smart_read({ mode: 'range', startLine, endLine })` - Specific lines
5. `smart_read({ mode: 'full' })` - Full content (last resort)

**Use `symbol` mode before editing:**

```javascript
smart_read({ 
  filePath: 'src/auth.js', 
  mode: 'symbol', 
  symbol: ['validateToken', 'refreshToken'] 
})
```

## Searching Code

**Always pass intent for task-aware ranking:**

```javascript
smart_search({ 
  query: 'authentication error', 
  intent: 'debug'  // or: implementation, tests, config, docs, explore
})
```

**Intent effects:**
- `debug` → prioritizes errors, logs, exception handling
- `implementation` → prioritizes source files, changed files
- `tests` → prioritizes test files
- `config` → prioritizes config files, env vars
- `docs` → prioritizes documentation
- `explore` → balanced exploration

## Diagnostics

Use `smart_shell` for safe commands:

```javascript
smart_shell({ command: 'git status' })
smart_shell({ command: 'npm test' })
smart_shell({ command: 'find . -name "*.js"' })
```

**Allowed commands:**
- `git status`, `git diff`, `git log`, `git blame`
- `npm test`, `npm run lint`, `npm run build`
- `ls`, `pwd`, `find`, `rg`

**Blocked:**
- Shell operators (`|`, `&`, `;`)
- Write operations (`git commit`, `npm install`)
- Dangerous commands (`rm`, `sudo`)

## Metrics

Check token savings:

```javascript
smart_metrics({ limit: 20 })
```

Instead of reading `.devctx/state.sqlite` manually.

## One-Call Context

For comprehensive context in one call:

```javascript
smart_context({ 
  task: 'Fix login authentication bug',
  detail: 'balanced'  // minimal | balanced | deep
})
```

Returns:
- Relevant files (compressed)
- Symbol details
- Relationship graph
- Test coverage
- Diff analysis (if changes detected)

## Important

- These tools are **suggestions**, not guarantees
- You decide when to use them based on the task
- The MCP provides better options; you choose
- If built-in tools are more appropriate, use them
