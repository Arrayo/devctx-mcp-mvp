# Streaming Progress Notifications

devctx MCP provides real-time progress updates for long-running operations through streaming notifications.

## Overview

For operations that take significant time (indexing large codebases, processing many files), devctx sends progress notifications so clients can show real-time feedback to users.

## Supported Operations

### `build_index`

Sends progress notifications during:
- **scanning**: Initial file discovery
- **indexing**: Processing files and extracting symbols
- **resolving**: Building dependency graph
- **complete**: Final statistics

### `build_index` (incremental)

Additional phases:
- **full_rebuild**: When no existing index found
- **checking**: Checking file staleness
- **complete**: Final statistics with reindex/unchanged counts

## Notification Format

Progress notifications follow this structure:

```json
{
  "method": "notifications/progress",
  "params": {
    "progressToken": "build_index-1234567890-abc123",
    "progress": {
      "operation": "build_index",
      "phase": "indexing",
      "elapsed": 1250,
      "processed": 500,
      "total": 1000,
      "percentage": 50,
      "files": 450,
      "symbols": 2500
    }
  }
}
```

### Fields

- `progressToken`: Unique identifier for this operation instance
- `operation`: Operation name (`build_index`, etc.)
- `phase`: Current phase (`scanning`, `indexing`, `resolving`, `complete`, `error`)
- `elapsed`: Milliseconds since operation started
- Additional fields vary by operation and phase

## Client Integration

### Cursor / VS Code

Progress notifications are automatically handled by the MCP client. No additional code needed.

### Claude Desktop

Progress notifications appear in the MCP logs. Future versions may show them in the UI.

### Custom Clients

Handle `notifications/progress` messages:

```javascript
client.on('notification', (notification) => {
  if (notification.method === 'notifications/progress') {
    const { operation, phase, elapsed, ...data } = notification.params.progress;
    
    console.log(`${operation}: ${phase} (${elapsed}ms)`, data);
    
    // Update UI with progress
    if (data.percentage) {
      updateProgressBar(data.percentage);
    }
  }
});
```

## Throttling

Progress notifications are throttled to:
- Maximum 1 notification per 100ms
- Or every 50 files processed
- Or every 5% of total progress

This prevents flooding the client with too many updates.

## Error Handling

If an operation fails, a final notification with `phase: "error"` is sent:

```json
{
  "operation": "build_index",
  "phase": "error",
  "elapsed": 1250,
  "error": "Failed to read file: permission denied"
}
```

## Performance Impact

Progress notifications have minimal overhead:
- Throttled updates (max 10/sec)
- Fire-and-forget (don't block operation)
- Gracefully degrade if client doesn't support notifications

## Future Operations

Streaming support is planned for:
- `smart_context` - Context retrieval progress
- `smart_search` - Search progress for large result sets
- Batch operations - Multi-file processing

## Implementation

See `src/streaming.js` for the progress reporter API:

```javascript
import { createProgressReporter } from './streaming.js';

const progress = createProgressReporter('my_operation');

progress.report({ phase: 'starting', count: 0 });
// ... do work ...
progress.report({ phase: 'processing', count: 50, total: 100 });
// ... more work ...
progress.complete({ total: 100, processed: 100 });
```
