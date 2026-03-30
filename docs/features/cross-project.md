# Cross-Project Context

Share context across multiple related codebases (monorepos, microservices, shared libraries).

## Overview

Modern development often involves multiple related projects:
- **Monorepos**: Multiple packages in one repository
- **Microservices**: Related services with shared contracts
- **Shared libraries**: Common utilities used across projects
- **Frontend + Backend**: Separate repos with shared types

Cross-project context enables:
- Search across all related projects at once
- Read files from any project
- Find symbol definitions across projects
- Analyze cross-project dependencies
- Understand project relationships

## Quick Start

### 1. Create Configuration

Create `.devctx-projects.json` in your main project root:

```json
{
  "version": "1.0",
  "projects": [
    {
      "name": "main-app",
      "path": ".",
      "type": "main",
      "description": "Main application"
    },
    {
      "name": "shared-lib",
      "path": "../shared-lib",
      "type": "library",
      "description": "Shared utilities"
    },
    {
      "name": "api-service",
      "path": "../api-service",
      "type": "service",
      "description": "Backend API"
    }
  ],
  "searchDefaults": {
    "maxResultsPerProject": 5,
    "includeTypes": ["main", "library", "service"]
  }
}
```

### 2. Build Indexes

Each project needs its own symbol index:

```bash
cd main-app && npx devctx build-index
cd ../shared-lib && npx devctx build-index
cd ../api-service && npx devctx build-index
```

### 3. Use Cross-Project Tools

```javascript
// Discover related projects
await crossProject({ mode: 'discover' });

// Search across all projects
await crossProject({
  mode: 'search',
  query: 'AuthService',
  intent: 'implementation'
});

// Find symbol definitions
await crossProject({
  mode: 'symbol',
  symbolName: 'validateToken'
});
```

## Modes

### 1. Discover

List all configured related projects:

```javascript
await crossProject({ mode: 'discover' });

// Returns:
{
  mode: "discover",
  projects: [
    {
      name: "main-app",
      path: "/path/to/main-app",
      type: "main",
      description: "Main application",
      hasIndex: true
    },
    {
      name: "shared-lib",
      path: "/path/to/shared-lib",
      type: "library",
      description: "Shared utilities",
      hasIndex: true
    }
  ]
}
```

### 2. Search

Search for code across multiple projects:

```javascript
await crossProject({
  mode: 'search',
  query: 'authentication',
  intent: 'implementation',
  maxResultsPerProject: 5,
  includeProjects: ['main-app', 'api-service']
});

// Returns:
{
  mode: "search",
  query: "authentication",
  intent: "implementation",
  totalProjects: 2,
  results: [
    {
      project: "main-app",
      projectPath: "/path/to/main-app",
      projectType: "main",
      matches: 3,
      results: [
        {
          file: "src/auth/login.js",
          line: 10,
          snippet: "export function authenticate(credentials) {",
          relevance: 0.95,
          projectName: "main-app",
          absolutePath: "/path/to/main-app/src/auth/login.js"
        }
      ]
    },
    {
      project: "api-service",
      projectPath: "/path/to/api-service",
      projectType: "service",
      matches: 2,
      results: [...]
    }
  ]
}
```

### 3. Read

Read files from multiple projects in one call:

```javascript
await crossProject({
  mode: 'read',
  fileRefs: [
    { project: 'main-app', file: 'src/auth/login.js', mode: 'outline' },
    { project: 'shared-lib', file: 'src/utils/crypto.js', mode: 'symbols' },
    { project: 'api-service', file: 'src/middleware/auth.js', mode: 'full' }
  ]
});

// Returns:
{
  mode: "read",
  filesRead: 3,
  results: [
    {
      project: "main-app",
      projectPath: "/path/to/main-app",
      file: "src/auth/login.js",
      mode: "outline",
      content: "...",
      parser: "javascript"
    },
    ...
  ]
}
```

### 4. Symbol

Find where a symbol is defined across all projects:

```javascript
await crossProject({
  mode: 'symbol',
  symbolName: 'validateToken'
});

// Returns:
{
  mode: "symbol",
  symbolName: "validateToken",
  matches: 2,
  results: [
    {
      project: "shared-lib",
      projectPath: "/path/to/shared-lib",
      projectType: "library",
      file: "src/auth/validation.js",
      symbol: "validateToken",
      kind: "function",
      line: 15,
      signature: "export function validateToken(token)"
    },
    {
      project: "api-service",
      projectPath: "/path/to/api-service",
      projectType: "service",
      file: "src/utils/jwt.js",
      symbol: "validateToken",
      kind: "function",
      line: 42,
      signature: "async function validateToken(token)"
    }
  ]
}
```

### 5. Deps

Get cross-project dependency graph:

```javascript
await crossProject({ mode: 'deps' });

// Returns:
{
  mode: "deps",
  projects: [
    { name: "main-app", path: "/path/to/main-app", type: "main" },
    { name: "shared-lib", path: "/path/to/shared-lib", type: "library" }
  ],
  edges: [
    {
      from: "main-app",
      fromFile: "src/utils/index.js",
      to: "shared-lib",
      toFile: "src/crypto.js",
      kind: "cross-project-import"
    }
  ]
}
```

### 6. Stats

Get usage statistics:

```javascript
await crossProject({ mode: 'stats' });

// Returns:
{
  mode: "stats",
  totalProjects: 3,
  indexedProjects: 3,
  projectTypes: {
    "main": 1,
    "library": 1,
    "service": 1
  },
  crossProjectImports: 12,
  importsByProject: {
    "main-app": 8,
    "api-service": 4
  }
}
```

## Configuration

### Project Types

Common project types:

- `main`: Primary application
- `library`: Shared utilities/components
- `service`: Microservice or backend service
- `frontend`: Frontend application
- `backend`: Backend application
- `tool`: Build tool or script
- `docs`: Documentation project

### Path Resolution

Paths can be:
- **Relative**: `../shared-lib` (relative to config file)
- **Absolute**: `/home/user/projects/shared-lib`

### Search Defaults

```json
{
  "searchDefaults": {
    "maxResultsPerProject": 5,
    "includeTypes": ["main", "library", "service"],
    "excludeTypes": ["docs", "tool"]
  }
}
```

## Use Cases

### 1. Monorepo Development

```json
{
  "projects": [
    { "name": "web-app", "path": "./packages/web", "type": "frontend" },
    { "name": "mobile-app", "path": "./packages/mobile", "type": "frontend" },
    { "name": "shared-ui", "path": "./packages/ui", "type": "library" },
    { "name": "api-client", "path": "./packages/api", "type": "library" }
  ]
}
```

Find where a shared component is used:

```javascript
await crossProject({
  mode: 'search',
  query: 'Button',
  includeProjects: ['web-app', 'mobile-app']
});
```

### 2. Microservices

```json
{
  "projects": [
    { "name": "auth-service", "path": "../auth", "type": "service" },
    { "name": "user-service", "path": "../users", "type": "service" },
    { "name": "shared-types", "path": "../types", "type": "library" }
  ]
}
```

Find all services using a shared type:

```javascript
await crossProject({
  mode: 'symbol',
  symbolName: 'UserProfile'
});
```

### 3. Frontend + Backend

```json
{
  "projects": [
    { "name": "frontend", "path": ".", "type": "frontend" },
    { "name": "backend", "path": "../backend", "type": "backend" },
    { "name": "contracts", "path": "../contracts", "type": "library" }
  ]
}
```

Search for API endpoint implementations:

```javascript
await crossProject({
  mode: 'search',
  query: '/api/users',
  includeProjects: ['backend']
});
```

### 4. Shared Library Development

```json
{
  "projects": [
    { "name": "my-lib", "path": ".", "type": "library" },
    { "name": "example-app", "path": "./examples/app", "type": "main" },
    { "name": "docs-site", "path": "./docs", "type": "docs" }
  ]
}
```

Find usage examples:

```javascript
await crossProject({
  mode: 'search',
  query: 'myLibFunction',
  includeProjects: ['example-app']
});
```

## Performance

| Operation | Projects | Latency |
|-----------|----------|---------|
| Discover | N/A | <1ms |
| Search | 3 | ~150ms |
| Read | 5 files | ~100ms |
| Symbol | 3 | ~200ms |
| Deps | 3 | ~50ms |
| Stats | 3 | ~50ms |

**Optimization tips:**
- Build indexes for all projects first
- Use `includeProjects` to limit scope
- Set reasonable `maxResultsPerProject`
- Keep project count manageable (<10)

## Limitations

### 1. Requires Configuration

Must create `.devctx-projects.json` manually. No auto-discovery.

### 2. Requires Indexes

Each project needs `build_index` run first. No cross-project indexing.

### 3. Path Resolution

Relative paths are resolved from config file location. Symlinks not followed.

### 4. No Real-Time Sync

Changes in one project don't trigger re-indexing in others.

### 5. Sequential Processing

Projects are processed one-by-one, not in parallel.

## Troubleshooting

### "Project not found"

**Cause**: Path in config doesn't exist or is incorrect.

**Solution**: Verify paths are correct and projects exist.

### "No index found" (hasIndex: false)

**Cause**: Project hasn't been indexed yet.

**Solution**: Run `build_index` in that project.

### Empty search results

**Possible causes:**
1. Query doesn't match anything
2. Projects not indexed
3. Wrong `includeProjects` filter

**Solution**: Try broader query, check indexes, verify filters.

### Slow performance

**Possible causes:**
1. Too many projects
2. Large projects without indexes
3. Broad search queries

**Solution**: Reduce project count, build indexes, narrow queries.

## Future Enhancements

1. **Auto-discovery**: Detect related projects automatically
2. **Parallel processing**: Search multiple projects concurrently
3. **Shared cache**: Cache results across projects
4. **Watch mode**: Auto-rebuild indexes on changes
5. **Dependency analysis**: Detect circular dependencies
6. **Version tracking**: Track which versions are used where

## See Also

- [README.md](./README.md) - Main documentation
- [tools/devctx/src/cross-project.js](./tools/devctx/src/cross-project.js) - Implementation
