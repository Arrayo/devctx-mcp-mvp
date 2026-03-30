# Testing Profile

## Workflow

```
1. smart_turn(start) → recover context
2. smart_search(intent=tests) → find existing tests
3. smart_read(mode=symbol) → extract function to test
4. [write test]
5. smart_shell('npm test') → verify
6. smart_turn(end, event=milestone) → checkpoint
```

## Key Tools

### smart_search with intent=tests

Find test files and patterns:

```javascript
smart_search({ 
  query: 'authentication test',
  intent: 'tests'
})
```

Prioritizes:
- Test files (`*.test.js`, `*.spec.js`)
- Test utilities
- Fixtures
- Mocks

### smart_read symbol for function under test

```javascript
smart_read({ 
  filePath: 'src/auth.js',
  mode: 'symbol',
  symbol: 'validateToken'
})
```

Extract only the function you're testing.

### smart_context for test coverage

```javascript
smart_context({ 
  task: 'Write tests for auth module',
  entryFile: 'src/auth.js'
})
```

Returns:
- Source file
- Existing tests (if any)
- Dependencies
- Related modules

### smart_shell for test execution

```javascript
smart_shell({ command: 'npm test' })
smart_shell({ command: 'npm test -- auth.test.js' })
smart_shell({ command: 'npm run test:coverage' })
```

## Testing Strategies

### 1. Unit Test

```javascript
// 1. Find function
smart_search({ query: 'validateToken', intent: 'implementation' })

// 2. Read implementation
smart_read({ filePath: 'src/auth.js', mode: 'symbol', symbol: 'validateToken' })

// 3. Check existing tests
smart_search({ query: 'validateToken test', intent: 'tests' })

// 4. Write test
// [create test]

// 5. Run test
smart_shell({ command: 'npm test -- auth.test.js' })
```

### 2. Integration Test

```javascript
// 1. Get comprehensive context
smart_context({ 
  task: 'Test login flow integration',
  entryFile: 'src/routes/auth.js'
})

// 2. Read API endpoints
smart_read({ filePath: 'src/routes/auth.js', mode: 'signatures' })

// 3. Write integration test
// [create test]

// 4. Run test
smart_shell({ command: 'npm test -- integration' })
```

### 3. Test Existing Code

```javascript
// 1. Find untested functions
smart_search({ query: 'export function', intent: 'implementation' })

// 2. Check test coverage
smart_search({ query: 'test', intent: 'tests' })

// 3. For each untested function
smart_read({ filePath: 'src/utils.js', mode: 'symbol', symbol: 'formatDate' })
// [write test]
smart_shell({ command: 'npm test' })
```

### 4. Fix Failing Test

```javascript
// 1. Run tests
smart_shell({ command: 'npm test' })

// 2. Find failing test
smart_search({ query: 'should validate email', intent: 'tests' })

// 3. Read test and implementation
smart_read({ filePath: 'tests/validation.test.js', mode: 'symbol', symbol: 'should validate email' })
smart_read({ filePath: 'src/validation.js', mode: 'symbol', symbol: 'validateEmail' })

// 4. Fix and verify
// [make changes]
smart_shell({ command: 'npm test' })
```

## Test Coverage Analysis

### Find untested code

```javascript
// 1. Get all exported functions
smart_search({ query: 'export function', intent: 'implementation' })

// 2. Get all tests
smart_search({ query: 'test it describe', intent: 'tests' })

// 3. Compare and identify gaps
```

### Check test quality

```javascript
// 1. Read test file
smart_read({ filePath: 'tests/auth.test.js', mode: 'outline' })

// 2. Check coverage
smart_shell({ command: 'npm run test:coverage' })

// 3. Identify missing edge cases
```

## Best Practices

1. **Read function before testing**
   - `smart_read(symbol)` extracts function
   - Understand inputs/outputs
   - Identify edge cases
   - Plan test cases

2. **Check existing tests first**
   - `smart_search(intent=tests)` finds tests
   - Avoid duplicate tests
   - Follow existing patterns
   - Reuse test utilities

3. **Use graph for dependencies**
   - `smart_context` shows dependencies
   - Mock external dependencies
   - Test in isolation
   - Integration tests for integration

4. **Verify after writing**
   - `smart_shell('npm test')` after every test
   - Check coverage
   - Test edge cases
   - Test error paths

5. **Leverage test-of relationships**
   - Index tracks test → source relationships
   - Find related tests automatically
   - Maintain test coverage
   - Update tests when source changes

## Common Patterns

### Pattern 1: TDD (Test-Driven Development)

```javascript
// 1. Start session
smart_turn({ phase: 'start', userPrompt: 'Add email validation', ensureSession: true })

// 2. Write failing test first
// [write test]
smart_shell({ command: 'npm test' })  // Should fail

// 3. Implement
smart_read({ filePath: 'src/validation.js', mode: 'signatures' })
// [implement]

// 4. Verify
smart_shell({ command: 'npm test' })  // Should pass

// 5. Checkpoint
smart_turn({ phase: 'end', event: 'milestone', summary: 'Added email validation' })
```

### Pattern 2: Test Existing Function

```javascript
// 1. Find function
smart_search({ query: 'parseDate', intent: 'implementation' })

// 2. Read implementation
smart_read({ filePath: 'src/utils.js', mode: 'symbol', symbol: 'parseDate' })

// 3. Check existing tests
smart_search({ query: 'parseDate test', intent: 'tests' })

// 4. Write comprehensive tests
// [write tests for edge cases]

// 5. Run tests
smart_shell({ command: 'npm test -- utils.test.js' })
```

### Pattern 3: Update Tests After Refactor

```javascript
// 1. Get changed files
smart_context({ task: 'Update tests after refactor', diff: true })

// 2. Find affected tests
// (from graph.edges.tests)

// 3. Update tests
smart_read({ filePath: 'tests/auth.test.js', mode: 'outline' })
// [update tests]

// 4. Verify
smart_shell({ command: 'npm test' })
```

## Anti-Patterns

❌ **Testing without reading implementation**
```javascript
// Bad
[write test based on assumptions]

// Good
smart_read({ filePath: 'src/auth.js', mode: 'symbol', symbol: 'validateToken' })
[write test based on actual implementation]
```

❌ **Not running tests after writing**
```javascript
// Bad
[write test]
[move to next test]

// Good
[write test]
smart_shell({ command: 'npm test' })
[verify it passes]
```

❌ **Reading full files for testing**
```javascript
// Bad
smart_read({ filePath: 'src/auth.js', mode: 'full' })

// Good
smart_read({ filePath: 'src/auth.js', mode: 'symbol', symbol: 'validateToken' })
```

## Token Savings

Typical testing session:
- Without devctx: 120K tokens (read 8 full files, grep, test output)
- With devctx: 12K tokens (symbol reads + compressed test output)
- **Savings: 90%**
