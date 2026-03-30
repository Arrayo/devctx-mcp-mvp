# Debugging Profile

## Workflow

```
1. smart_turn(start) → recover context
2. smart_search(intent=debug) → find error locations
3. smart_read(mode=signatures) → understand structure
4. smart_read(mode=symbol) → inspect failing function
5. smart_shell('npm test') → reproduce error
6. [make fix]
7. smart_shell('npm test') → verify fix
8. smart_turn(end, event=milestone) → checkpoint
```

## Key Tools

### smart_search with intent=debug

Prioritizes:
- Error messages and stack traces
- Exception handling code
- Logging statements
- Recently changed files
- Test failures

```javascript
smart_search({ 
  query: 'TypeError cannot read property',
  intent: 'debug'
})
```

### smart_read symbol mode

Extract failing function without reading entire file:

```javascript
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbol: 'validateToken'
})
```

### smart_shell for diagnostics

```javascript
smart_shell({ command: 'npm test' })
smart_shell({ command: 'git diff' })
smart_shell({ command: 'git log --oneline -10' })
```

### smart_context for comprehensive view

```javascript
smart_context({ 
  task: 'Debug authentication error in login flow',
  detail: 'balanced',
  diff: true  // includes recent changes
})
```

## Best Practices

1. **Start with search, not read**
   - `smart_search(intent=debug)` finds error locations
   - Then `smart_read(signatures)` for structure
   - Finally `smart_read(symbol)` for specific code

2. **Use diff-aware context**
   - Pass `diff: true` to `smart_context`
   - Prioritizes recently changed code
   - Shows what changed and why

3. **Reproduce before fixing**
   - `smart_shell('npm test')` to confirm failure
   - Verify fix with same command
   - Don't assume the error is where it appears

4. **Checkpoint progress**
   - `smart_turn(end, event=blocker)` if stuck
   - `smart_turn(end, event=milestone)` when fixed
   - Persist `nextStep` for continuity

## Common Patterns

### Pattern 1: Stack Trace Investigation

```javascript
// 1. Find error location
smart_search({ query: 'TypeError line 42', intent: 'debug' })

// 2. Read function structure
smart_read({ filePath: 'src/api.js', mode: 'signatures' })

// 3. Extract failing function
smart_read({ filePath: 'src/api.js', mode: 'symbol', symbol: 'fetchUser' })

// 4. Check recent changes
smart_shell({ command: 'git log -p --follow src/api.js' })
```

### Pattern 2: Test Failure

```javascript
// 1. Run tests
smart_shell({ command: 'npm test' })

// 2. Find test file
smart_search({ query: 'test name from output', intent: 'tests' })

// 3. Read test and implementation
smart_read({ filePath: 'tests/auth.test.js', mode: 'symbol', symbol: 'should validate token' })
smart_read({ filePath: 'src/auth.js', mode: 'symbol', symbol: 'validateToken' })
```

### Pattern 3: Regression Investigation

```javascript
// 1. Get comprehensive context with changes
smart_context({ 
  task: 'Find what broke user login',
  detail: 'balanced',
  diff: true
})

// 2. Check git history
smart_shell({ command: 'git log --oneline --since="1 week ago"' })

// 3. Inspect specific commit
smart_shell({ command: 'git show <commit-hash>' })
```

## Anti-Patterns

❌ **Reading full files first**
```javascript
// Bad
smart_read({ filePath: 'src/api.js', mode: 'full' })

// Good
smart_read({ filePath: 'src/api.js', mode: 'signatures' })
smart_read({ filePath: 'src/api.js', mode: 'symbol', symbol: 'fetchUser' })
```

❌ **Using Grep instead of smart_search**
```javascript
// Bad
Grep({ pattern: 'error', path: 'src/' })

// Good
smart_search({ query: 'error', intent: 'debug' })
```

❌ **Skipping context recovery**
```javascript
// Bad
[start debugging immediately]

// Good
smart_turn({ phase: 'start', userPrompt: 'Debug login error', ensureSession: true })
```

## Token Savings

Typical debugging session:
- Without devctx: 150K tokens (read 10 full files, grep output, test logs)
- With devctx: 15K tokens (signatures + symbol reads + compressed shell)
- **Savings: 90%**
