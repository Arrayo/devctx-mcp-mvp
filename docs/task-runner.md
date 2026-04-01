# Task Runner Workflows (`smart-context-task`)

`smart-context-task` is the product layer added in `1.6.0` on top of the raw MCP tools and the shared headless wrapper.

It exists for one reason: reduce the chance that agents skip the right `devctx` flow during non-trivial work.

Instead of relying on the agent to remember:

```text
smart_turn(start)
→ smart_context / smart_search
→ smart_read
→ work
→ smart_turn(end)
```

the task runner packages that lifecycle into named workflows with continuity-aware guidance.

---

## What It Adds

Compared to calling `smart_turn` manually, the task runner adds:

- a shared workflow entrypoint for terminal and assisted-client flows
- preflight context before the wrapped prompt reaches the agent
- continuity-aware guidance derived from `smart_turn(start)`
- blocked-state routing to `smart_doctor`
- workflow-level metrics and benchmark coverage

The core MCP still remains the source of truth. The runner does not replace `smart_turn`, `smart_context`, or `smart_doctor`; it orchestrates them.

---

## Core Commands

### General work

- `task`
  - Generic non-trivial task entrypoint.
  - Uses `smart_turn(start)` plus `smart_context` preflight and continuity guidance.

- `implement`
  - Implementation-oriented workflow with automatic orchestration.
  - Uses dependency-aware `smart_context` preflight with symbol detail.

- `continue`
  - Resumes an active task and prioritizes persisted `nextStep`, then `currentFocus`.

- `resume`
  - Similar to `continue`, but explicitly framed as recovery of the active session.

### Specialized work

- `review`
  - Code-review workflow with compact context-first guidance.

- `debug`
  - Debug workflow using `smart_search(intent=debug)` preflight.

- `refactor`
  - Refactor workflow using graph-aware `smart_context`.

- `test`
  - Test workflow using `smart_search(intent=tests)` preflight.

### Operational commands

- `doctor`
  - Runs `smart_doctor` for repo safety, storage health, and remediation.

- `status`
  - Surfaces current session and safety state through `smart_status`.

- `checkpoint`
  - Runs `smart_turn(end, event=...)` directly.

- `cleanup`
  - Runs maintenance flows over summary retention and legacy cleanup.

---

## Continuity-Aware Guidance

The runner now uses `smart_turn(start)` output to shape the workflow prompt before it reaches the wrapped agent.

That guidance can include:

- continuity state (`aligned`, `resume`, `possible_shift`, `context_mismatch`, `cold_start`)
- persisted focus
- persisted next step
- refreshed top files
- `recommendedPath.nextTools`
- session-handling advice

This matters most for:

- `task`
  - generic work now gets the same continuity scaffolding as specialized workflows
- `continue` / `resume`
  - preflight queries prefer persisted `nextStep` and `currentFocus`
- `implement`
  - implementation tasks start from dependency-aware context instead of a raw prompt only

---

## Preflight by Workflow

The runner does not use the same preflight for everything.

| Workflow | Preflight | Why |
|----------|-----------|-----|
| `task` | `smart_context` | generic non-trivial working set |
| `implement` | `smart_context` + symbol detail | implementation slices and dependency edges |
| `continue` / `resume` | `smart_context` | recover working set from persisted state |
| `review` | `smart_context` | compact review context |
| `debug` | `smart_search(intent=debug)` | error/root-cause search first |
| `refactor` | `smart_context` | graph-aware refactor planning |
| `test` | `smart_search(intent=tests)` | test-oriented lookup first |

Blocked workflows are routed to `smart_doctor` instead of pretending execution is safe.

---

## Recommended Usage

### Generic terminal usage

```bash
smart-context-task task --prompt "inspect the auth flow and continue the bugfix"
smart-context-task implement --prompt "add a token guard to loginHandler"
smart-context-task continue --session-id my-session-id
smart-context-task review --prompt "review the latest diff"
smart-context-task doctor
smart-context-task checkpoint --session-id my-session-id --event milestone --next-step "run regression tests"
```

### Assisted Cursor usage

After:

```bash
npx smart-context-init --target . --clients cursor
```

you get:

```bash
./.devctx/bin/cursor-devctx task --prompt "your task" -- <agent-command> [args...]
./.devctx/bin/cursor-devctx implement --prompt "your task" -- <agent-command> [args...]
./.devctx/bin/cursor-devctx continue --session-id my-session -- <agent-command> [args...]
./.devctx/bin/cursor-devctx doctor
```

Use this path for long, stateful, or higher-risk work where plain Cursor rules are not enough.

---

## When To Prefer The Runner

Prefer `smart-context-task` or `cursor-devctx` when:

- the task is multi-step
- continuity matters
- repo safety or storage health might interrupt normal flows
- you want measured workflow behavior, not just tool-level usage
- you want a more repeatable path across Cursor, Codex, and Qwen

Raw MCP tools are still fine when:

- the task is trivial
- you only need one compressed read or search
- you are debugging the MCP itself and want direct tool control

---

## Validation in `1.6.0`

The runner is now covered by:

- workflow-specific tests for `task`, `implement`, `continue`, `review`, and `debug`
- measured `task_runner` quality signals in `smart_metrics`
- orchestration benchmark scenarios and release gating

That means the runner is no longer just a convenience wrapper. It is part of the product surface and is validated as such.
