# SQLite Architecture

## Scope

`devctx` keeps project-local persistent state in:

```text
.devctx/state.sqlite
```

This database is scoped to a single project/repository. It is now the primary source of truth for persisted context and metrics, replacing the old spread of JSON session files and JSONL metrics files.

## Goals

- Keep persistent context inside the project scope
- Avoid per-prompt snapshots and write only meaningful deltas
- Preserve net token savings by tracking the overhead of the context system itself
- Make automatic resume and per-session metrics reliable under concurrent agent activity

## Automatic Context Model

The target runtime model is event-driven:

1. Session restore at task start: load the active or best candidate session
2. In-memory working context during the live conversation
3. Persist compact events only when something meaningful changes
4. Materialize a compressed summary only when needed for resume

This avoids the anti-pattern of writing a full snapshot after every prompt.

## Initial Schema

### `meta`

Key/value metadata for schema version and storage-level settings.

### `sessions`

Materialized session state:

- `session_id`
- goal/status/focus/next step
- compact JSON fields for pinned context, blockers, unresolved questions
- counts for completed steps, decisions, and touched files
- a `snapshot_json` payload for compatibility during migration

### `session_events`

Append-only event stream for meaningful changes:

- session created/resumed
- milestone completed
- decision recorded
- blockers changed
- touched files changed
- flush/close events

### `metrics_events`

Per-call and per-session token accounting:

- tool/action/target
- `session_id`
- raw/compressed/saved tokens
- latency
- extra metadata in JSON

### `active_session`

Stores the active session for the current project scope.

### `summary_cache`

Stores the latest compressed resume summary for a session so the runtime does not recompute it on every restore.

## Migration Strategy

The migration path is:

1. Read `.devctx/sessions/*.json`
2. Read `.devctx/metrics.jsonl`
3. Import into SQLite idempotently
4. Keep legacy files untouched until migration is confirmed or explicitly cleaned up

## Token Discipline

Automatic persistence must follow these rules:

- restore once at task start, not every prompt
- append events only for meaningful changes
- compact old events periodically
- record the overhead of the context system in `metrics_events`

The SQLite migration is only valid if the total overhead remains below the token savings gained by smarter context reuse.
