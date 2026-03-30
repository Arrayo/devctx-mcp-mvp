# Base Rule Reduction: From 42 to 10 Lines

## Problem

The base rule (`.cursor/rules/devctx.mdc`, `AGENTS.md`, `CLAUDE.md`) was **always active** but contained:
- Full reading strategy (5 steps)
- Full search strategy (5 intents)
- Complete workflows for 5 task types (debugging, code review, refactoring, testing, architecture)
- Repository safety checks
- Task checkpoint recovery details

**Total:** 42 lines of fixed context cost injected into every agent interaction.

This violated the design goal: **minimize fixed context cost, maximize coherence with token savings**.

## Solution

### New Base Rule (10 lines)

```markdown
---
description: Prefer devctx MCP tools for non-trivial tasks
alwaysApply: true
---

Prefer devctx MCP for non-trivial tasks:
- smart_read(outline|signatures|symbol) instead of Read → 90% savings
- smart_search(intent=...) instead of Grep → ranked results
- smart_context instead of multiple reads → one-call builder
- smart_shell instead of Shell → safe diagnostics

For non-trivial tasks: smart_turn(start) → [work with devctx tools] → smart_turn(end)

Reading cascade: outline → signatures → symbol → full (last resort)

Detailed workflows: .cursor/rules/profiles-compact/ (debugging, code-review, refactoring, testing, architecture)
```

### What Moved to Profiles

All task-specific workflows moved to **conditional profiles** in `.cursor/rules/profiles-compact/`:

- `debugging.mdc` - Error-first, symbol-focused workflow
- `code-review.mdc` - Diff-aware, API-focused workflow
- `refactoring.mdc` - Graph-aware, test-verified workflow
- `testing.mdc` - Coverage-aware, TDD-friendly workflow
- `architecture.mdc` - Index-first, minimal-detail workflow

These profiles are **conditionally applied** based on file globs and task context, not always active.

## Impact

### Before
- **Fixed context cost:** 42 lines (always injected)
- **Conditional context cost:** 0 lines
- **Total worst case:** 42 lines

### After
- **Fixed context cost:** 10 lines (always injected)
- **Conditional context cost:** ~40 lines (only when profile matches)
- **Total worst case:** 50 lines (base + 1 profile)
- **Total best case:** 10 lines (base only)

### Typical Scenarios

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| Simple read | 42 lines | 10 lines | **76% reduction** |
| Debugging task | 42 lines | 50 lines | 19% increase (but targeted) |
| Code review task | 42 lines | 50 lines | 19% increase (but targeted) |
| Non-programming task | 42 lines | 10 lines | **76% reduction** |

## Why This Matters

### 1. Reduces Noise for Simple Tasks
If the agent is just reading a file or answering a simple question, it doesn't need full workflows for debugging, testing, and architecture.

### 2. Increases Signal for Complex Tasks
When the agent is debugging, it gets **only** the debugging workflow, not all 5 workflows.

### 3. Improves Agent Learning
Shorter base rule = easier to "learn" and remember.

### 4. Aligns with Design Goals
- **Minimize fixed context cost** ✅
- **Maximize coherence with token savings** ✅
- **Maintain agent guidance** ✅ (via conditional profiles)

## Implementation

### Files Changed

1. `.cursor/rules/devctx.mdc` - Base rule (42 → 10 lines)
2. `AGENTS.md` - Generic agent rule (42 → 10 lines)
3. `CLAUDE.md` - Claude Desktop rule (42 → 10 lines)
4. `tools/devctx/agent-rules/base.md` - Source template (57 → 15 lines)
5. `tools/devctx/agent-rules/compact.md` - Compact source (76 → 10 lines)
6. `tools/devctx/scripts/init-clients.js` - Generator script (updated)

### Profiles (Unchanged)

The 5 conditional profiles in `tools/devctx/agent-rules/profiles-compact/` already contained the detailed workflows, so no changes were needed.

## Verification

To verify the reduction:

```bash
# Count lines in base rule
wc -l .cursor/rules/devctx.mdc
# Expected: ~15 lines (including frontmatter)

# Count lines in profiles
wc -l .cursor/rules/profiles-compact/*.mdc
# Expected: ~40 lines each

# Verify profiles are conditionally applied
grep -A2 "^---" .cursor/rules/profiles-compact/*.mdc
# Expected: globs: ["..."] for each profile
```

## User Experience

### Before
Agent sees this on **every** interaction:
```
Prefer devctx MCP over built-ins...
Reading strategy (5 steps)...
Search strategy (5 intents)...
By task: Debugging, Code Review, Refactoring, Testing, Architecture...
Repository safety...
```

### After
Agent sees this on **simple** interactions:
```
Prefer devctx MCP for non-trivial tasks...
Reading cascade: outline → signatures → symbol → full
Detailed workflows: .cursor/rules/profiles-compact/
```

Agent sees this on **debugging** interactions:
```
[Base rule above] +
Debugging Workflow:
1. smart_turn(start) → recovers checkpoint
2. smart_search(intent=debug) → finds errors
3. smart_read(mode=symbol) → reads failing function
4. smart_shell('npm test') → reproduces error
5. [fix bug]
6. smart_turn(end) → checkpoints progress
```

## Next Steps

This reduction is **Step 1** of the adoption optimization plan. Next steps:

1. ✅ **Reduce base rule** (this document)
2. 🔄 **Add feedback when devctx not used** (next)
3. 🔄 **Make preflight (build_index) more visible** (next)
4. 🔄 **Matize "faster and more accurate" claim** (next)

## References

- Design rationale: `docs/agent-rules/design-rationale.md`
- Two-layer architecture: `docs/agent-rules/two-layer-architecture.md`
- Profile documentation: `tools/devctx/agent-rules/README.md`
