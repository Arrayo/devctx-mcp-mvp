# Symbol-Level Git Blame

Fine-grained code attribution at function/class level instead of just file level.

## Overview

Traditional `git blame` shows who last touched each line. Symbol-level blame aggregates this to show who authored each function, class, or method, making it easier to:

- Find the right person to ask about specific code
- Understand ownership boundaries in a codebase
- Track recent changes at symbol granularity
- Identify contributors to specific features

## Quick Start

### Symbol Blame (Function/Class Level)

```javascript
await gitBlame({
  mode: 'symbol',
  filePath: 'src/server.js'
});

// Returns:
{
  mode: "symbol",
  filePath: "src/server.js",
  symbols: [
    {
      symbol: "createServer",
      kind: "function",
      author: "Alice",
      email: "alice@example.com",
      date: "2025-03-15T10:30:00Z",
      commit: "abc123...",
      lineStart: 10,
      lineEnd: 45,
      linesAuthored: 32,
      totalLines: 36,
      authorshipPercentage: 89,
      contributors: 2,
      allContributors: [
        { author: "Alice", email: "alice@...", count: 32 },
        { author: "Bob", email: "bob@...", count: 4 }
      ]
    }
  ]
}
```

### File Stats (Aggregated)

```javascript
await gitBlame({
  mode: 'file',
  filePath: 'src/server.js'
});

// Returns:
{
  mode: "file",
  filePath: "src/server.js",
  totalLines: 250,
  authors: [
    {
      author: "Alice",
      email: "alice@example.com",
      lines: 180,
      percentage: 72,
      commits: 15,
      firstContribution: "2024-01-10T...",
      lastContribution: "2025-03-15T..."
    },
    {
      author: "Bob",
      email: "bob@example.com",
      lines: 70,
      percentage: 28,
      commits: 8,
      firstContribution: "2024-06-20T...",
      lastContribution: "2025-02-28T..."
    }
  ],
  lastModified: "2025-03-15T10:30:00Z",
  oldestLine: "2024-01-10T08:15:00Z"
}
```

### Find by Author

```javascript
await gitBlame({
  mode: 'author',
  authorQuery: 'Alice',
  limit: 20
});

// Returns:
{
  mode: "author",
  authorQuery: "Alice",
  matches: 15,
  symbols: [
    {
      file: "src/server.js",
      symbol: "createServer",
      kind: "function",
      author: "Alice",
      email: "alice@example.com",
      authorshipPercentage: 89,
      lineStart: 10,
      lineEnd: 45
    },
    // ... more symbols
  ]
}
```

### Recent Changes

```javascript
await gitBlame({
  mode: 'recent',
  limit: 10,
  daysBack: 7
});

// Returns:
{
  mode: "recent",
  daysBack: 7,
  symbols: [
    {
      file: "src/handler.js",
      symbol: "processRequest",
      kind: "function",
      author: "Bob",
      email: "bob@example.com",
      date: "2025-03-28T15:20:00Z",
      daysAgo: 0
    },
    // ... more recent changes
  ]
}
```

## How It Works

### 1. Line-Level Blame

First, runs `git blame --line-porcelain` to get attribution for every line:

```
abc123... 10 10 5
author Alice
author-mail <alice@example.com>
author-time 1710498600
	export function createServer() {
```

### 2. Symbol Mapping

Loads the symbol index to map lines to functions/classes:

```javascript
{
  name: "createServer",
  kind: "function",
  line: 10,
  lineEnd: 45
}
```

### 3. Aggregation

For each symbol, aggregates blame data across its line range:

- Counts lines per author
- Determines primary author (most lines)
- Calculates authorship percentage
- Tracks all contributors

### 4. Enrichment

Adds metadata:

- Commit hash and date
- Contributor count
- Authorship percentage
- Line ranges

## Use Cases

### 1. Code Review Assignment

Find who to assign reviews to:

```javascript
// Get primary authors for changed files
const files = ['src/auth.js', 'src/middleware.js'];
for (const file of files) {
  const stats = await gitBlame({ mode: 'file', filePath: file });
  const primaryAuthor = stats.authors[0];
  console.log(`${file}: ${primaryAuthor.author} (${primaryAuthor.percentage}%)`);
}
```

### 2. Onboarding

Show new team members who owns what:

```javascript
// Find all functions authored by senior dev
const symbols = await gitBlame({
  mode: 'author',
  authorQuery: 'senior-dev@company.com',
  limit: 100
});

// Group by file
const byFile = symbols.reduce((acc, s) => {
  acc[s.file] = acc[s.file] || [];
  acc[s.file].push(s.symbol);
  return acc;
}, {});
```

### 3. Hotspot Analysis

Find recently active areas:

```javascript
// Get symbols modified in last 7 days
const recent = await gitBlame({
  mode: 'recent',
  daysBack: 7,
  limit: 50
});

// Group by file to find hotspots
const hotspots = recent.reduce((acc, s) => {
  acc[s.file] = (acc[s.file] || 0) + 1;
  return acc;
}, {});

const sorted = Object.entries(hotspots)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
```

### 4. Ownership Boundaries

Identify shared ownership:

```javascript
// Find functions with multiple contributors
const symbols = await gitBlame({ mode: 'symbol', filePath: 'src/core.js' });

const shared = symbols.filter(s => s.contributors > 1);
for (const s of shared) {
  console.log(`${s.symbol}: ${s.contributors} contributors`);
  console.log(`  Primary: ${s.author} (${s.authorshipPercentage}%)`);
}
```

### 5. Legacy Code Detection

Find old, untouched code:

```javascript
const stats = await gitBlame({ mode: 'file', filePath: 'src/legacy.js' });

const oldestDate = new Date(stats.oldestLine);
const ageInDays = (Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);

if (ageInDays > 365) {
  console.log(`Warning: ${stats.filePath} has lines ${Math.floor(ageInDays)} days old`);
}
```

## Performance

### Latency

| Operation | Files | Time |
|-----------|-------|------|
| Symbol blame (single file) | 1 | ~50ms |
| File stats | 1 | ~50ms |
| Find by author | 100 | ~5s |
| Recent changes | 50 | ~2.5s |

### Optimization

- **Cached git blame**: Results are not cached; each call runs `git blame`
- **Parallel processing**: Author/recent modes process files sequentially
- **Early termination**: Stops when limit is reached
- **Index dependency**: Requires symbol index to be built

## Limitations

### 1. Requires Git Repository

Only works in git repositories. Non-git projects return empty results.

### 2. Requires Symbol Index

Symbol-level blame needs the symbol index. Run `build_index` first.

### 3. Line-Level Granularity

Authorship is determined by line count, not semantic contribution. A 1-line change in a 100-line function shows 1% authorship.

### 4. Rename/Move Not Tracked

`git blame` doesn't follow renames by default. Use `git blame -C -C -C` for better tracking (not implemented yet).

### 5. Performance on Large Files

Files with >1000 lines or >100 symbols may be slow. Consider file-level stats instead.

## Configuration

No environment variables. All configuration is via parameters:

```javascript
{
  mode: 'symbol' | 'file' | 'author' | 'recent',
  filePath: 'path/to/file',      // Required for symbol/file
  authorQuery: 'name or email',   // Required for author
  limit: 50,                      // Max results (default varies by mode)
  daysBack: 30                    // Days to look back for recent mode
}
```

## Troubleshooting

### "No such path in the working tree"

**Cause**: File doesn't exist or isn't tracked by git.

**Solution**: Ensure file is committed to git.

### Empty results for symbol mode

**Possible causes:**
1. Symbol index not built: Run `build_index` first
2. File has no functions/classes: Check file content
3. Parser doesn't support file type: Only JS/TS/Python/Go/Rust supported

### "git blame" command times out

**Cause**: File is very large (>10MB) or git history is complex.

**Solution**: Use file-level stats instead, or increase timeout in code.

### Authorship percentage seems wrong

**Explanation**: Percentage is based on line count, not semantic contribution. A developer who reformatted code may show high authorship even if they didn't write the logic.

## Future Enhancements

1. **Blame caching**: Cache results for faster repeated queries
2. **Rename tracking**: Use `git blame -C` to follow renames
3. **Semantic weighting**: Weight authorship by change significance
4. **Team aggregation**: Group by team instead of individual
5. **Time-based filtering**: "Who authored this in the last 6 months?"
6. **Parallel processing**: Process multiple files concurrently

## See Also

- [README.md](./README.md) - Main documentation
- [tools/devctx/src/git-blame.js](./tools/devctx/src/git-blame.js) - Implementation
- [Git Blame Documentation](https://git-scm.com/docs/git-blame)
