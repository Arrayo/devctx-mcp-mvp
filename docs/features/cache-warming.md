# Cache Warming

Intelligent preloading of frequently accessed files to reduce cold-start latency.

## Overview

Cache warming analyzes your usage patterns over the last 30 days and preloads the most frequently accessed files into the OS filesystem cache. This reduces latency on the first query after a cold start (machine reboot, cache eviction, etc.).

## Quick Start

### Automatic (with build_index)

```javascript
await buildIndex({ 
  incremental: true,
  warmCache: true  // Preload after indexing
});

// Returns:
{
  status: "ok",
  files: 1247,
  symbols: 8934,
  cacheWarming: {
    warmed: 42,
    skipped: 8,
    totalCandidates: 50
  }
}
```

### Manual (standalone)

```javascript
await warmCache();

// Returns:
{
  warmed: 42,       // Files successfully preloaded
  skipped: 8,       // Files skipped (missing, too large)
  totalCandidates: 50
}
```

## How It Works

### 1. Pattern Analysis

Queries SQLite for files accessed in the last 30 days:

```sql
SELECT file_path, COUNT(*) as access_count
FROM context_access
WHERE timestamp > datetime('now', '-30 days')
GROUP BY file_path
HAVING access_count >= 3
ORDER BY access_count DESC, MAX(timestamp) DESC
LIMIT 50
```

**Criteria:**
- Minimum 3 accesses (filters noise)
- Sorted by frequency, then recency
- Top 50 files by default

### 2. File Preloading

For each frequent file:

1. **Check existence**: Skip if deleted
2. **Check size**: Skip if >1MB (large files hurt more than help)
3. **Read into memory**: `fs.readFileSync()` triggers OS cache
4. **Track results**: Count warmed vs skipped

### 3. OS Cache Benefit

Once a file is read, the OS keeps it in the filesystem cache (page cache). Subsequent reads are ~100x faster:

- **Cold read**: 5-50ms (disk I/O)
- **Warm read**: 0.05-0.5ms (memory)

## Configuration

### Environment Variables

```bash
# Disable cache warming entirely
export DEVCTX_CACHE_WARMING=false

# Change number of files to warm (default: 50)
export DEVCTX_WARM_FILES=100
```

### Tuning Parameters

Edit `cache-warming.js` constants:

```javascript
const WARM_TOP_N_FILES = 50;      // Max files to warm
const MIN_ACCESS_COUNT = 3;        // Min accesses to qualify
```

## Use Cases

### 1. After Machine Reboot

```bash
# Warm cache immediately after boot
npx devctx warm-cache

# Or combine with index rebuild
npx devctx build-index --warm-cache
```

### 2. Before Intensive Session

```javascript
// Preload before starting work
await warmCache();

// Then start working
await smartContext({ task: "Implement auth flow" });
```

### 3. CI/CD Optimization

```yaml
# In GitHub Actions
- name: Warm cache
  run: npx devctx warm-cache
  
- name: Run agent
  run: npx devctx run "Review PR changes"
```

### 4. Scheduled Warming

```bash
# Cron job to warm cache every morning
0 9 * * * cd /path/to/project && npx devctx warm-cache
```

## Performance Impact

### Latency Reduction

| Scenario | Without Warming | With Warming | Improvement |
|----------|----------------|--------------|-------------|
| First query (cold) | 250ms | 50ms | **5x faster** |
| Subsequent queries | 50ms | 50ms | No change |

### Overhead

| Operation | Time | Memory |
|-----------|------|--------|
| Pattern query | ~10ms | <1MB |
| Preload 50 files | ~500ms | ~5MB |
| Total | ~510ms | ~6MB |

### When It Helps Most

- **Large projects** (>1000 files): More files to cache
- **Frequent restarts**: Cache evicted often
- **Cold environments**: CI/CD, containers, VMs
- **Slow disks**: HDD, network mounts

### When It Doesn't Help

- **Already warm**: Files recently accessed
- **Small projects**: Few files, minimal benefit
- **Fast SSDs**: Cold reads already fast (~5ms)
- **No usage history**: <5 frequent files

## Statistics

### View Cache Stats

```javascript
const stats = await getCacheStats();

// Returns:
{
  totalFrequentFiles: 42,
  byExtension: {
    ".js": 25,
    ".ts": 12,
    ".json": 3,
    ".md": 2
  },
  topFiles: [
    "src/server.js",
    "src/handler.js",
    "src/utils.js",
    // ... top 10
  ]
}
```

### Check If Warming Recommended

```javascript
const should = await shouldWarmCache();

if (should) {
  await warmCache();
}
```

Returns `true` when:
- Cache warming is enabled
- Index exists
- At least 5 frequently accessed files

## Integration with Other Features

### With build_index

```javascript
// Rebuild index + warm cache in one call
await buildIndex({ 
  incremental: true,
  warmCache: true
});
```

### With smart_context

Cache warming is transparent - `smart_context` automatically benefits from warmed files without any changes.

### With Streaming

Cache warming sends progress notifications:

```javascript
// Client receives:
{ phase: "warming", processed: 10, total: 50, percentage: 20 }
{ phase: "warming", processed: 50, total: 50, percentage: 100 }
```

## Implementation Details

### Data Source

Uses `context_access` table in SQLite:

```sql
CREATE TABLE context_access (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  task TEXT NOT NULL,
  intent TEXT,
  file_path TEXT NOT NULL,
  relevance REAL,
  access_order INTEGER,
  timestamp TEXT NOT NULL
);
```

### Warming Strategy

**Sequential reads**: Files are read one-by-one to avoid memory pressure.

**Size limit**: Files >1MB are skipped because:
- Large files evict smaller files from cache
- Preloading cost exceeds benefit
- Most large files are data/assets, not code

**Error handling**: Graceful - missing/unreadable files are skipped, not failed.

## Limitations

### 1. Requires SQLite

Cache warming needs `context_access` data, which is stored in SQLite. Falls back gracefully on Node <22.

### 2. OS-Dependent

Cache behavior varies by OS:
- **Linux**: Page cache, shared across processes
- **macOS**: Unified buffer cache
- **Windows**: System cache, less aggressive

### 3. Memory Pressure

If system memory is low, OS may evict cache immediately. Warming has no effect in this case.

### 4. Container Ephemeral

In containers, cache is lost on restart. Warming helps within a single container lifecycle but not across restarts.

## Troubleshooting

### "No frequent files found"

**Cause**: Not enough usage history (< 30 days or < 3 accesses per file).

**Solution**: Use the system more, or lower `MIN_ACCESS_COUNT` in `cache-warming.js`.

### "Cache warming disabled"

**Cause**: `DEVCTX_CACHE_WARMING=false` in environment.

**Solution**: Remove the env var or set it to `true`.

### "No index found"

**Cause**: Symbol index hasn't been built yet.

**Solution**: Run `build_index` first.

### Warming seems to have no effect

**Possible causes:**
1. Files already in cache (recent access)
2. Fast SSD (cold reads already <10ms)
3. OS evicting cache due to memory pressure
4. Files are small (<10KB) - benefit is minimal

**Verification:**
```bash
# Check if files are in cache (Linux)
vmtouch -v src/

# Warm and verify
npx devctx warm-cache
vmtouch -v src/
```

## Future Enhancements

1. **Smart warming schedule**: Warm only files likely to be accessed soon
2. **Predictive warming**: Use task patterns to warm related files
3. **Distributed cache**: Share warming data across team
4. **Memory-aware**: Adjust warming size based on available RAM
5. **Incremental warming**: Warm new files as they become frequent

## See Also

- [README.md](./README.md) - Main documentation
- [CONTEXT-PREDICTION.md](./CONTEXT-PREDICTION.md) - Related: predictive file access
- [tools/devctx/src/cache-warming.js](./tools/devctx/src/cache-warming.js) - Implementation
