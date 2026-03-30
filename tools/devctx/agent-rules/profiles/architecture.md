# Architecture & Exploration Profile

## Workflow

```
1. smart_turn(start) → recover context
2. smart_context(detail=minimal) → get high-level view
3. smart_read(mode=signatures) → understand module APIs
4. [analyze structure]
5. smart_turn(end, event=milestone) → checkpoint
```

## Key Tools

### smart_context with minimal detail

Get index-first overview without reading full files:

```javascript
smart_context({ 
  task: 'Understand project architecture',
  detail: 'minimal'
})
```

Returns:
- File list with symbol previews
- Relationship graph
- Directory structure
- Import/export graph
- Test coverage map

### smart_search with intent=explore

Broad exploration with balanced ranking:

```javascript
smart_search({ 
  query: 'API endpoint route',
  intent: 'explore'
})
```

### smart_read signatures for API boundaries

```javascript
smart_read({ 
  filePath: 'src/api/index.js',
  mode: 'signatures'
})
```

Shows:
- Exported functions
- Module interface
- Type definitions
- Public API

### cross_project for multi-repo

```javascript
cross_project({ 
  mode: 'discover'
})

cross_project({ 
  mode: 'deps'
})
```

## Exploration Strategies

### 1. New Codebase Onboarding

```javascript
// 1. Get high-level overview
smart_context({ task: 'Understand codebase structure', detail: 'minimal' })

// 2. Check directory structure
smart_shell({ command: 'find . -type d -maxdepth 3' })

// 3. Read entry points
smart_read({ filePath: 'src/index.js', mode: 'signatures' })
smart_read({ filePath: 'src/server.js', mode: 'signatures' })

// 4. Explore key modules
smart_search({ query: 'main router controller', intent: 'explore' })
```

### 2. Module Dependency Analysis

```javascript
// 1. Get comprehensive graph
smart_context({ 
  task: 'Analyze module dependencies',
  entryFile: 'src/auth/index.js'
})

// 2. Inspect graph.edges
// - imports: what this module depends on
// - importedBy: who depends on this module
// - tests: test coverage

// 3. Check for circular dependencies
// (look for cycles in graph)

// 4. Identify coupling issues
// (modules with too many edges)
```

### 3. API Surface Review

```javascript
// 1. Find all API files
smart_search({ query: 'export', intent: 'implementation' })

// 2. Read signatures
smart_read({ filePath: 'src/api/users.js', mode: 'signatures' })
smart_read({ filePath: 'src/api/auth.js', mode: 'signatures' })

// 3. Check consistency
// (naming, patterns, error handling)
```

### 4. Cross-Project Architecture

```javascript
// 1. Discover related projects
cross_project({ mode: 'discover' })

// 2. Get dependency graph
cross_project({ mode: 'deps' })

// 3. Search across projects
cross_project({ 
  mode: 'search',
  query: 'shared types',
  maxResultsPerProject: 5
})

// 4. Find shared symbols
cross_project({ 
  mode: 'symbol',
  symbolName: 'UserModel'
})
```

## Architecture Patterns

### Pattern 1: Layered Architecture

```javascript
// 1. Explore layers
smart_search({ query: 'controller service repository', intent: 'explore' })

// 2. Check separation
smart_context({ task: 'Review layer boundaries', detail: 'minimal' })

// 3. Verify dependencies flow downward
// (controllers → services → repositories)
// (check graph.edges)
```

### Pattern 2: Module Boundaries

```javascript
// 1. Get module overview
smart_context({ entryFile: 'src/auth/index.js', detail: 'minimal' })

// 2. Check exports
smart_read({ filePath: 'src/auth/index.js', mode: 'signatures' })

// 3. Verify encapsulation
// (only index.js should be imported by other modules)
```

### Pattern 3: Dependency Graph

```javascript
// 1. Build full graph
smart_context({ task: 'Map dependencies', detail: 'minimal' })

// 2. Analyze graph
// - Identify core modules (many importedBy)
// - Identify leaf modules (few imports)
// - Find circular dependencies
// - Calculate coupling metrics

// 3. Visualize
// (use graph.edges to build visualization)
```

## Best Practices

1. **Start with minimal detail**
   - `smart_context(detail=minimal)` for overview
   - Index-first approach
   - Symbol previews without full content
   - Drill down only when needed

2. **Use signatures for API understanding**
   - `smart_read(signatures)` shows public interface
   - Understand contracts
   - Identify breaking changes
   - Plan refactors

3. **Leverage relationship graph**
   - `graph.edges` shows dependencies
   - Find coupling issues
   - Identify core modules
   - Plan modularization

4. **Explore incrementally**
   - Start broad (`smart_context`)
   - Narrow down (`smart_search`)
   - Deep dive (`smart_read(symbol)`)
   - Don't read everything

5. **Use cross-project for monorepos**
   - `cross_project(discover)` finds related projects
   - `cross_project(deps)` shows inter-project dependencies
   - `cross_project(search)` searches across projects
   - `cross_project(symbol)` finds shared symbols

## Common Patterns

### Pattern 1: Find Entry Point

```javascript
// 1. Search for main/server/app
smart_search({ query: 'main server app', intent: 'explore' })

// 2. Read signatures
smart_read({ filePath: 'src/server.js', mode: 'signatures' })

// 3. Follow imports
smart_context({ entryFile: 'src/server.js', detail: 'minimal' })
```

### Pattern 2: Understand Data Flow

```javascript
// 1. Find data models
smart_search({ query: 'User model schema', intent: 'implementation' })

// 2. Get context
smart_context({ entryFile: 'src/models/User.js' })

// 3. Trace usage
// (check graph.edges.importedBy)

// 4. Read consumers
smart_read({ filePath: 'src/services/UserService.js', mode: 'signatures' })
```

### Pattern 3: Map API Routes

```javascript
// 1. Find route definitions
smart_search({ query: 'router.get router.post', intent: 'implementation' })

// 2. Read route files
smart_read({ filePath: 'src/routes/users.js', mode: 'signatures' })

// 3. Get handler implementations
smart_read({ filePath: 'src/controllers/UserController.js', mode: 'signatures' })
```

### Pattern 4: Identify Hotspots

```javascript
// 1. Check git blame
git_blame({ 
  mode: 'file',
  limit: 10,
  daysBack: 90
})

// 2. Find frequently changed files
// (high change frequency = potential hotspot)

// 3. Analyze structure
smart_read({ filePath: 'src/hotspot.js', mode: 'signatures' })

// 4. Check dependencies
smart_context({ entryFile: 'src/hotspot.js' })
```

## Anti-Patterns

❌ **Reading all files to understand structure**
```javascript
// Bad
for (const file of allFiles) {
  smart_read({ filePath: file, mode: 'full' })
}

// Good
smart_context({ task: 'Understand structure', detail: 'minimal' })
```

❌ **Using full mode for exploration**
```javascript
// Bad
smart_read({ filePath: 'src/api.js', mode: 'full' })

// Good
smart_read({ filePath: 'src/api.js', mode: 'signatures' })
```

❌ **Ignoring relationship graph**
```javascript
// Bad
[manually trace imports]

// Good
smart_context({ entryFile: 'src/auth.js' })
// Use graph.edges
```

## Token Savings

Typical architecture exploration:
- Without devctx: 300K tokens (read 20 full files, grep output, directory listings)
- With devctx: 30K tokens (minimal context + signatures + graph)
- **Savings: 90%**

## Advanced: Cross-Project

For monorepos or related projects:

```javascript
// 1. Configure projects
// Create .devctx-projects.json

// 2. Discover
cross_project({ mode: 'discover' })

// 3. Search across all
cross_project({ 
  mode: 'search',
  query: 'UserModel',
  maxResultsPerProject: 3
})

// 4. Get dependency graph
cross_project({ mode: 'deps' })

// 5. Find shared symbols
cross_project({ 
  mode: 'symbol',
  symbolName: 'ApiClient'
})
```
