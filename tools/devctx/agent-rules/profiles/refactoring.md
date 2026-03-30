# Refactoring Profile

## Workflow

```
1. smart_turn(start) → recover context
2. smart_search(intent=implementation) → find target code
3. smart_read(mode=signatures) → understand public API
4. smart_read(mode=symbol) → extract functions to refactor
5. [make changes]
6. smart_shell('npm test') → verify behavior preserved
7. smart_turn(end, event=milestone) → checkpoint
```

## Key Tools

### smart_context for impact analysis

```javascript
smart_context({ 
  task: 'Refactor authentication module',
  entryFile: 'src/auth.js',
  detail: 'balanced'
})
```

Returns:
- Entry file (primary)
- Dependencies (who imports this)
- Dependents (who uses this)
- Tests (coverage)
- Graph (impact radius)

### smart_read signatures for API preservation

```javascript
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'signatures'
})
```

Shows:
- Exported functions
- Function signatures
- Type definitions
- Public API

**Goal:** Preserve this API during refactor

### smart_read symbol for extraction

```javascript
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbol: ['validateToken', 'refreshToken', 'hashPassword']
})
```

Extract only functions being refactored.

### git_blame for ownership

```javascript
git_blame({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbolName: 'validateToken'
})
```

Understand:
- Who wrote this
- When it was last changed
- Why it exists

## Refactoring Strategies

### 1. Extract Function

```javascript
// 1. Find target code
smart_search({ query: 'long function name', intent: 'implementation' })

// 2. Read function
smart_read({ filePath: 'src/api.js', mode: 'symbol', symbol: 'processRequest' })

// 3. Check dependencies
smart_context({ entryFile: 'src/api.js' })

// 4. Extract and test
// [make changes]
smart_shell({ command: 'npm test' })
```

### 2. Rename Symbol

```javascript
// 1. Find all usages
smart_search({ query: 'oldFunctionName', intent: 'implementation' })

// 2. Check impact
smart_context({ task: 'Rename oldFunctionName', entryFile: 'src/api.js' })

// 3. Rename and verify
// [make changes]
smart_shell({ command: 'npm test' })
smart_shell({ command: 'npm run typecheck' })
```

### 3. Move Code

```javascript
// 1. Understand current structure
smart_read({ filePath: 'src/utils.js', mode: 'signatures' })

// 2. Find dependencies
smart_context({ entryFile: 'src/utils.js' })

// 3. Move and update imports
// [make changes]
smart_shell({ command: 'npm test' })
```

### 4. Simplify Logic

```javascript
// 1. Read complex function
smart_read({ filePath: 'src/parser.js', mode: 'symbol', symbol: 'parseExpression' })

// 2. Check test coverage
smart_search({ query: 'parseExpression test', intent: 'tests' })

// 3. Simplify and verify
// [make changes]
smart_shell({ command: 'npm test' })
```

## Best Practices

1. **Understand before changing**
   - Read signatures first
   - Check dependencies
   - Verify test coverage
   - Don't assume behavior

2. **Preserve API contracts**
   - Keep function signatures
   - Maintain return types
   - Don't break dependents
   - Version breaking changes

3. **Small, incremental changes**
   - One refactor at a time
   - Test after each change
   - Commit frequently
   - Easy to revert

4. **Verify behavior preserved**
   - `smart_shell('npm test')` after every change
   - Check type errors
   - Run linter
   - Test edge cases

5. **Use graph for impact analysis**
   - Check `graph.edges` in `smart_context` response
   - Find all importers
   - Identify affected tests
   - Update dependents

## Common Patterns

### Pattern 1: Extract Module

```javascript
// 1. Analyze current structure
smart_context({ task: 'Extract auth utilities', entryFile: 'src/auth.js' })

// 2. Read functions to extract
smart_read({ 
  filePath: 'src/auth.js', 
  mode: 'symbol', 
  symbol: ['hashPassword', 'comparePassword', 'generateSalt'] 
})

// 3. Check dependencies
// (from graph.edges)

// 4. Extract and test
// [create src/auth/utils.js]
// [update imports]
smart_shell({ command: 'npm test' })
```

### Pattern 2: Inline Function

```javascript
// 1. Find function
smart_search({ query: 'helperFunction', intent: 'implementation' })

// 2. Check usage
smart_context({ task: 'Inline helperFunction', entryFile: 'src/utils.js' })

// 3. Verify single usage
// (check graph.edges.importedBy)

// 4. Inline and test
// [make changes]
smart_shell({ command: 'npm test' })
```

### Pattern 3: Split Class

```javascript
// 1. Read class structure
smart_read({ filePath: 'src/UserService.js', mode: 'signatures' })

// 2. Understand dependencies
smart_context({ entryFile: 'src/UserService.js' })

// 3. Extract methods
smart_read({ 
  filePath: 'src/UserService.js', 
  mode: 'symbol', 
  symbol: ['authenticate', 'authorize', 'validateToken'] 
})

// 4. Split and test
// [create src/AuthService.js]
// [update imports]
smart_shell({ command: 'npm test' })
smart_shell({ command: 'npm run typecheck' })
```

## Anti-Patterns

❌ **Refactoring without tests**
```javascript
// Bad
[make changes without running tests]

// Good
smart_shell({ command: 'npm test' })
[make changes]
smart_shell({ command: 'npm test' })
```

❌ **Large batch refactors**
```javascript
// Bad
[change 10 files at once]

// Good
[change 1-2 files]
smart_shell({ command: 'npm test' })
[commit]
[repeat]
```

❌ **Ignoring dependents**
```javascript
// Bad
[change function signature]
[don't check who calls it]

// Good
smart_context({ entryFile: 'src/api.js' })
// Check graph.edges.importedBy
// Update all callers
```

## Token Savings

Typical refactoring session:
- Without devctx: 180K tokens (read 12 full files, search results, test output)
- With devctx: 20K tokens (signatures + symbol reads + graph analysis)
- **Savings: 89%**
