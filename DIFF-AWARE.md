# Diff-Aware Context

Smart change analysis for `smart_context` that intelligently understands git diffs and provides optimized context for code review and change understanding.

## Overview

When you pass `diff: "HEAD"` (or any git ref) to `smart_context`, it doesn't just return the changed files — it analyzes the impact, expands the context to related files, and prioritizes everything by relevance.

## Basic Usage

```javascript
const result = await smartContext({
  task: "Review recent changes",
  diff: "HEAD",  // or "main", "feature-branch", etc.
  maxTokens: 8000
});
```

## What Gets Analyzed

### 1. Change Statistics

For each changed file, the system extracts:
- **Lines added/deleted**: `+45/-12`
- **Total changes**: Sum of additions and deletions
- **Change type**: `addition`, `deletion`, `modification`, or `refactor`

### 2. Impact Scoring

Each file receives an impact score based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Change size | +1 per line (capped at 100) | Larger changes = higher impact |
| Implementation files | +50 | `.js`, `.ts`, `.py`, `.go`, `.rs` files |
| Number of dependents | +10 per importer | Files used by many others rank higher |
| Test files | -20 | Tests are secondary context |
| Config files (small) | -30 | Minor config changes rank lower |

**Priority Levels:**
- **Critical**: Score >= 100 (major implementation changes)
- **High**: Score >= 50 (significant changes)
- **Medium**: Score >= 20 (moderate changes)
- **Low**: Score < 20 (minor tweaks)

### 3. Context Expansion

The system automatically expands the changed file set to include:

| Relation | Score | Description |
|----------|-------|-------------|
| **Importers** | +10 each | Files that import the changed file |
| **Dependencies** | +5 each | Files imported by the changed file |
| **Tests** | +8 each | Test files for the changed code |

**Expansion Limit:** By default, up to 10 related files are added (configurable).

### 4. Symbol Detection

For each changed file, the system extracts:
- Function names (JS/TS: `function foo()`, `const bar = () => {}`)
- Class names (JS/TS: `class Foo {}`)
- Python defs and classes (`def foo():`, `class Bar:`)

This helps understand **what** changed, not just **where**.

## Response Format

```javascript
{
  success: true,
  context: "... file contents in priority order ...",
  diffSummary: {
    ref: "HEAD",                    // Git reference
    totalChanged: 5,                // Files changed + deleted
    included: 8,                    // Files in context (changed + expanded)
    expanded: 3,                    // Related files added
    skippedDeleted: 1,              // Deleted files (not in filesystem)
    summary: "...",                 // Human-readable summary
    topImpact: [
      {
        file: "src/server.js",
        priority: "critical",
        changes: "+45/-12",
        type: "modification"
      },
      // ... top 3 most impactful files
    ]
  },
  tokenUsage: { total: 7234, ... },
  hints: [...]
}
```

### Detailed Summary Format

The `diffSummary.summary` field provides a multi-line breakdown:

```
5 files changed, 247 lines modified
  2 new files (+89 lines)
  1 deletions (-34 lines)
  2 modifications

High-impact files (2):
  - src/server.js (+45/-12)
  - src/handler.js (+23/-5)
```

## Use Cases

### 1. Pre-Commit Review

```javascript
// Before committing
const review = await smartContext({
  task: "Review my staged changes for issues",
  diff: "HEAD",
  intent: "debug",
  maxTokens: 6000
});

// Returns changed files + tests + importers
// Helps catch breaking changes before commit
```

### 2. Understanding PR Changes

```javascript
// Review a feature branch
const prContext = await smartContext({
  task: "Summarize changes in feature branch",
  diff: "main",
  maxTokens: 10000
});

// Includes all changes relative to main
// Plus related files for full context
```

### 3. Finding Affected Tests

```javascript
// What tests cover my changes?
const testCoverage = await smartContext({
  task: "Show tests affected by my changes",
  diff: "HEAD",
  intent: "tests",
  maxTokens: 8000
});

// Automatically includes test files via graph expansion
```

### 4. Change Blast Radius

```javascript
// What else might break?
const blastRadius = await smartContext({
  task: "Find files that depend on my changes",
  diff: "HEAD",
  maxTokens: 12000
});

// Expands to importers recursively
// Shows full impact scope
```

### 5. Symbol-Level Review

```javascript
// Which functions changed?
const symbolChanges = await smartContext({
  task: "List modified functions",
  diff: "HEAD",
  detail: "deep"
});

// Includes symbol detection in diff analysis
// Shows function/class names that were modified
```

## Configuration

### Diff Reference Formats

```javascript
diff: "HEAD"              // Unstaged + staged changes
diff: "main"              // All changes vs main branch
diff: "feature-branch"    // Changes vs feature branch
diff: "HEAD~3"            // Changes in last 3 commits
diff: "abc123"            // Changes since specific commit
```

### Token Budget Impact

The `maxTokens` parameter affects how many files are included:

| Budget | Typical Behavior |
|--------|------------------|
| < 4000 | Top 5 critical files only |
| 4000-8000 | Top 10 files (changed + expanded) |
| > 8000 | All changed files + full expansion |

### Expansion Control

Currently hardcoded to max 10 expanded files. To customize:

```javascript
// In diff-analysis.js
export const expandChangedContext = (changedFiles, index, maxExpansion = 10)

// Future: expose as parameter
const result = await smartContext({
  task: "Review changes",
  diff: "HEAD",
  diffExpansion: 5  // Limit to 5 related files
});
```

## Integration with Other Features

### Prefetch + Diff

```javascript
const result = await smartContext({
  task: "Review API changes",
  diff: "HEAD",
  prefetch: true  // Also predict related files from history
});

// Combines:
// - Changed files (diff-aware)
// - Expanded dependencies (graph)
// - Historical patterns (prefetch)
```

### Intent + Diff

```javascript
const result = await smartContext({
  task: "Debug failing tests after my changes",
  diff: "HEAD",
  intent: "debug"
});

// Prioritizes:
// - Changed files
// - Test files
// - Error-prone patterns
```

## Implementation Details

### File Priority Algorithm

```javascript
function calculateImpactScore(change, index) {
  let score = 0;
  
  // Base: change size (capped)
  score += Math.min(change.totalChanges, 100);
  
  // Boost: implementation files
  if (isImplementationFile(change.file)) score += 50;
  
  // Boost: files with many dependents
  const dependentCount = countDependents(change.file, index);
  score += dependentCount * 10;
  
  // Penalty: test files
  if (isTestFile(change.file)) score -= 20;
  
  // Penalty: small config changes
  if (isConfigFile(change.file) && change.totalChanges < 10) {
    score -= 30;
  }
  
  return Math.max(0, score);
}
```

### Graph Expansion Algorithm

```javascript
function expandChangedContext(changedFiles, index, maxExpansion = 10) {
  const expanded = new Set(changedFiles);
  const candidates = new Map(); // file -> score
  
  for (const changed of changedFiles) {
    // Find files that import changed file (+10 each)
    const importers = findImporters(changed, index);
    for (const imp of importers) {
      candidates.set(imp, (candidates.get(imp) || 0) + 10);
    }
    
    // Find files imported by changed file (+5 each)
    const imports = findImports(changed, index);
    for (const imp of imports) {
      candidates.set(imp, (candidates.get(imp) || 0) + 5);
    }
    
    // Find test files (+8 each)
    const tests = findTests(changed, index);
    for (const test of tests) {
      candidates.set(test, (candidates.get(test) || 0) + 8);
    }
  }
  
  // Add top scored candidates
  const sorted = Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxExpansion);
  
  for (const [file] of sorted) {
    expanded.add(file);
  }
  
  return expanded;
}
```

## Performance

### Time Complexity

| Operation | Complexity | Typical Time |
|-----------|-----------|--------------|
| `git diff --numstat` | O(changed files) | ~50ms for 10 files |
| Impact analysis | O(n) | ~1ms per file |
| Graph expansion | O(edges × changed) | ~10ms for typical project |
| Total overhead | - | ~100-200ms |

### Memory Usage

- **Change stats**: ~1KB per changed file
- **Expanded set**: ~100 bytes per file
- **Total**: < 100KB for typical diff

## Limitations

### 1. Requires Git

Diff-aware context only works in git repositories. Non-git projects fall back to standard search-based context.

### 2. Deleted Files Excluded

Files that were deleted in the diff cannot be read (they don't exist on disk). They're counted in `skippedDeleted` but not included in context.

### 3. Binary Files

Binary file changes are detected but get 0 additions/deletions. They're included but don't contribute to impact scoring.

### 4. Submodules

Changes inside git submodules are not automatically detected. You'd need to `cd` into the submodule and run diff there.

## Future Enhancements

### Planned Features

1. **Configurable expansion depth**: Allow limiting or increasing how far to expand dependencies
2. **Semantic change detection**: Understand if a change is breaking vs non-breaking
3. **Diff between branches**: Support `diff: "main...feature"` syntax
4. **Hunk-level context**: Include only the specific changed hunks, not full files
5. **Custom impact weights**: Let users tune scoring factors per project
6. **Change intent detection**: Classify changes as bug fixes, features, refactors automatically
7. **Cross-file symbol tracking**: If function `foo` is renamed, find all call sites

### Experimental Ideas

- **Diff-aware search**: Boost search results for files related to recent changes
- **Change history**: Track which files frequently change together
- **Risk scoring**: Predict likelihood of introducing bugs based on change patterns
- **Auto-suggested reviewers**: Recommend who should review based on file ownership + changes

## Troubleshooting

### "No changed files found"

**Cause**: Working directory is clean (no changes vs the specified ref).

**Solution**: Make some changes, or use a different ref like `diff: "main"`.

### "Invalid ref: contains shell metacharacters"

**Cause**: The `diff` parameter contains unsafe characters.

**Solution**: Use only alphanumeric characters, `-`, `_`, `/` in git refs.

### Expanded files seem wrong

**Cause**: Symbol index is stale or missing graph edges.

**Solution**: Run `build_index` to rebuild the index with fresh import relationships.

### Config files rank too high

**Cause**: Large config changes get boosted by line count.

**Solution**: The scoring already penalizes small config changes. Large config migrations are legitimately high-impact.

## Examples

### Example 1: Simple Change Review

```bash
# Make changes to server.js
echo "export function newHandler() {}" >> src/server.js

# Review with smart_context
```

```javascript
const result = await smartContext({
  task: "Review my changes",
  diff: "HEAD"
});

// Output
{
  diffSummary: {
    ref: "HEAD",
    totalChanged: 1,
    included: 1,
    expanded: 0,
    summary: "1 files changed, 1 lines modified\n  1 new files (+1 lines)",
    topImpact: [
      { file: "src/server.js", priority: "medium", changes: "+1/-0", type: "addition" }
    ]
  }
}
```

### Example 2: Refactor with Expansion

```bash
# Refactor handler.js (used by server.js and worker.js)
vim src/handler.js

# Review shows expanded context
```

```javascript
const result = await smartContext({
  task: "Check refactor impact",
  diff: "HEAD",
  maxTokens: 10000
});

// Output
{
  diffSummary: {
    ref: "HEAD",
    totalChanged: 1,
    included: 3,      // handler.js + server.js + worker.js
    expanded: 2,      // server.js, worker.js added
    summary: "1 files changed, 35 lines modified\n  1 modifications",
    topImpact: [
      { file: "src/handler.js", priority: "high", changes: "+20/-15", type: "refactor" }
    ]
  }
}
```

## See Also

- [README.md](./README.md) - Main documentation
- [STREAMING.md](./STREAMING.md) - Streaming progress notifications
- [tools/devctx/src/diff-analysis.js](./tools/devctx/src/diff-analysis.js) - Implementation
- [tools/devctx/tests/diff-analysis.test.js](./tools/devctx/tests/diff-analysis.test.js) - Tests
