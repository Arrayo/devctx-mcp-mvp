# Using metricsDisplay in Agent Responses

## What is metricsDisplay?

Starting in v1.7.2, all devctx tools (`smart_read`, `smart_search`, `smart_context`, `smart_shell`) include a `metricsDisplay` field in their responses. This field contains a human-readable summary of the operation's performance.

## Format

```
✓ {tool}, {target}, [{files} files,] {raw}→{compressed} tokens [({ratio})][, {duration}]
```

## Examples

### smart_read

```json
{
  "filePath": "/path/to/src/auth.js",
  "content": "...",
  "metricsDisplay": "✓ smart_read, src/auth.js, 1.2K→120 tokens (10.0:1)",
  "metrics": { ... }
}
```

### smart_search

```json
{
  "query": "buildMetrics",
  "matches": "...",
  "metricsDisplay": "✓ smart_search, buildMetrics, 10 files, 1.7K→781 tokens (2.2:1)",
  "metrics": { ... }
}
```

### smart_context

```json
{
  "task": "analyze auth flow",
  "context": [...],
  "metricsDisplay": "✓ smart_context, analyze auth flow, 8 files, 15.0K→1.5K tokens (10.0:1)",
  "metrics": { ... }
}
```

### smart_shell

```json
{
  "command": "git status",
  "output": "...",
  "metricsDisplay": "✓ smart_shell, git status, 450→180 tokens (2.5:1)",
  "metrics": { ... }
}
```

## How Agents Should Use This

### ✅ Good: Surface metricsDisplay naturally

```
I used smart_context to analyze the auth flow.

✓ smart_context, analyze auth flow, 8 files, 15.0K→1.5K tokens (10.0:1)

The main entry point is src/auth/login.js...
```

### ✅ Good: Show multiple operations

```
I searched for the error handler and read the implementation:

✓ smart_search, error handler, 12 files, 2.1K→890 tokens (2.4:1)
✓ smart_read, src/errors.js, 1.8K→180 tokens (10.0:1)

The error handling logic is in...
```

### ❌ Bad: Don't reformat or hide it

```
I used smart_context (raw: 15000, compressed: 1500, ratio: 10:1)...
```

Just use the `metricsDisplay` string as-is.

### ❌ Bad: Don't skip it

```
I analyzed the auth flow using smart_context.
```

Always include the `metricsDisplay` so users see the compression value.

## Benefits

1. **Zero effort:** Agents don't need to format metrics
2. **Consistency:** Same format across all tools
3. **Immediate visibility:** Users see compression value in real-time
4. **Validation:** Users can verify agent used devctx efficiently

## Agent Rule Suggestion

Add to agent rules:

```markdown
When using devctx tools (smart_read, smart_search, smart_context, smart_shell),
ALWAYS include the metricsDisplay field in your response to show compression value:

Example:
✓ smart_read, src/auth.js, 1.2K→120 tokens (10.0:1)
```

## Related Features

- `summary.topTools` in `smart_metrics` - shows top 3 tools by net savings at session end
- `summary.tools[]` - full per-tool breakdown in metrics reports
- `latestEntries` - recent operations with individual metrics

## Addressing User Feedback

This feature directly addresses:

> "Métricas ocultas: No hubo feedback sobre tiempo de ejecución, tokens consumidos, o número de lecturas/escrituras"

Now every operation shows:
- Tool used
- Target (file/query/task)
- Files count (for multi-file operations)
- Token compression (raw→compressed with ratio)
- Duration (when available)

Users can see the value in real-time, not just in final reports.
