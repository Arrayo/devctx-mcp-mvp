# Code Review Profile

## Workflow

```
1. smart_turn(start) → recover context
2. smart_context(diff=true) → get changed files
3. smart_read(mode=signatures) → understand API surface
4. smart_read(mode=symbol) → inspect changed functions
5. [provide feedback]
6. smart_turn(end, event=milestone) → checkpoint
```

## Key Tools

### smart_context with diff

Get comprehensive view of changes:

```javascript
smart_context({ 
  task: 'Review authentication refactor',
  detail: 'balanced',
  diff: true  // prioritizes changed files
})
```

Returns:
- Changed files (primary)
- Dependencies (secondary)
- Tests (if exist)
- Diff summary
- Symbol-level changes

### smart_read signatures mode

Understand API without implementation details:

```javascript
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'signatures'
})
```

Returns only:
- Exported functions
- Class definitions
- Type signatures
- Public API

### git_blame for attribution

See who wrote what:

```javascript
git_blame({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbolName: 'validateToken'
})
```

### smart_shell for verification

```javascript
smart_shell({ command: 'npm test' })
smart_shell({ command: 'npm run lint' })
smart_shell({ command: 'git diff --stat' })
```

## Review Checklist

### 1. Understand Changes

```javascript
// Get diff summary
smart_context({ task: 'Review PR', diff: true })

// Check what changed
smart_shell({ command: 'git diff --stat' })
smart_shell({ command: 'git log --oneline -5' })
```

### 2. Review API Surface

```javascript
// For each changed file
smart_read({ filePath: 'src/api.js', mode: 'signatures' })
```

Check:
- Breaking changes
- New exports
- Deprecated functions
- Type changes

### 3. Inspect Implementation

```javascript
// For critical functions
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbol: ['validateToken', 'refreshToken']
})
```

Look for:
- Error handling
- Edge cases
- Performance issues
- Security concerns

### 4. Verify Tests

```javascript
// Find tests
smart_search({ query: 'auth test', intent: 'tests' })

// Read test coverage
smart_read({ filePath: 'tests/auth.test.js', mode: 'outline' })
```

### 5. Check Attribution

```javascript
// Who wrote this?
git_blame({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbolName: 'validateToken'
})
```

### 6. Run Verification

```javascript
smart_shell({ command: 'npm test' })
smart_shell({ command: 'npm run lint' })
smart_shell({ command: 'npm run typecheck' })
```

## Focus Areas

### Security Review

```javascript
smart_search({ query: 'authentication password secret', intent: 'implementation' })
smart_read({ filePath: 'src/auth.js', mode: 'symbol', symbol: 'hashPassword' })
```

Check:
- Input validation
- SQL injection
- XSS vulnerabilities
- Secrets in code

### Performance Review

```javascript
smart_search({ query: 'database query loop', intent: 'implementation' })
```

Check:
- N+1 queries
- Unnecessary loops
- Memory leaks
- Blocking operations

### Architecture Review

```javascript
smart_context({ task: 'Review module boundaries', detail: 'minimal' })
```

Check:
- Circular dependencies
- Tight coupling
- Separation of concerns
- SOLID principles

## Best Practices

1. **Start with diff-aware context**
   - `smart_context(diff=true)` shows what changed
   - Prioritizes review effort
   - Includes relationship graph

2. **Use signatures before diving deep**
   - `smart_read(signatures)` for API overview
   - Then `smart_read(symbol)` for specific concerns
   - Avoid `full` mode unless necessary

3. **Leverage git blame**
   - Understand authorship
   - Find related changes
   - Contact author if unclear

4. **Verify with tests**
   - `smart_shell('npm test')` before approval
   - Check test coverage
   - Look for missing edge cases

5. **Focus on changed symbols**
   - Use `getChangedSymbols()` from diff analysis
   - Review only modified functions
   - Check impact on dependents

## Common Patterns

### Pattern 1: Quick PR Review

```javascript
// 1. Get overview
smart_context({ task: 'Review PR #123', diff: true, detail: 'minimal' })

// 2. Check tests pass
smart_shell({ command: 'npm test' })

// 3. Review changed symbols
// (from diffSummary.changedSymbols)
smart_read({ filePath: 'src/api.js', mode: 'symbol', symbol: 'createUser' })
```

### Pattern 2: Deep Security Review

```javascript
// 1. Find security-sensitive code
smart_search({ query: 'password hash encrypt', intent: 'implementation' })

// 2. Read implementation
smart_read({ filePath: 'src/auth.js', mode: 'symbol', symbol: 'hashPassword' })

// 3. Check dependencies
smart_context({ task: 'Review auth dependencies', entryFile: 'src/auth.js' })

// 4. Verify tests
smart_search({ query: 'auth test', intent: 'tests' })
```

### Pattern 3: Architecture Review

```javascript
// 1. Get high-level view
smart_context({ task: 'Review architecture', detail: 'minimal' })

// 2. Check module boundaries
// (inspect graph.edges from response)

// 3. Read key interfaces
smart_read({ filePath: 'src/types.ts', mode: 'signatures' })
```

## Anti-Patterns

❌ **Reading all changed files in full**
```javascript
// Bad
for (const file of changedFiles) {
  smart_read({ filePath: file, mode: 'full' })
}

// Good
smart_context({ task: 'Review changes', diff: true, detail: 'balanced' })
```

❌ **Skipping diff analysis**
```javascript
// Bad
smart_search({ query: 'auth' })

// Good
smart_context({ task: 'Review auth changes', diff: true })
```

❌ **Not verifying tests**
```javascript
// Bad
[approve PR without running tests]

// Good
smart_shell({ command: 'npm test' })
```

## Token Savings

Typical code review:
- Without devctx: 200K tokens (read 15 full files, grep, git output)
- With devctx: 25K tokens (diff-aware context + signatures + symbol reads)
- **Savings: 87%**
