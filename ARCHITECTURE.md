# Repository Architecture

This document explains the structure and organization of this repository.

## Overview

This is a **simple repository** (not a monorepo) that contains one publishable npm package: `smart-context-mcp`.

The package lives in `tools/devctx/` for historical reasons, but this is the only package in the repository.

## Directory Structure

```
/
├── tools/devctx/              ← The npm package (smart-context-mcp)
│   ├── src/                   ← Source code
│   │   ├── tools/             ← MCP tool implementations
│   │   ├── storage/           ← SQLite storage layer
│   │   ├── utils/             ← Utilities
│   │   ├── hooks/             ← Client hooks (Claude)
│   │   ├── parsers/           ← Language parsers
│   │   ├── index.js           ← Symbol indexing
│   │   ├── metrics.js         ← Metrics tracking
│   │   ├── server.js          ← MCP server definition
│   │   └── mcp-server.js      ← Server entry point
│   ├── tests/                 ← Unit tests (421 tests)
│   ├── scripts/               ← CLI binaries
│   │   ├── devctx-server.js   ← smart-context-server
│   │   ├── init-clients.js    ← smart-context-init
│   │   ├── report-metrics.js  ← smart-context-report
│   │   └── ...
│   ├── evals/                 ← Evaluation harness
│   │   ├── harness.js         ← Eval runner
│   │   ├── corpus/            ← Test tasks
│   │   ├── fixtures/          ← Sample projects
│   │   └── results/           ← Eval results
│   ├── package.json           ← Package metadata
│   ├── package-lock.json      ← Dependency lock
│   └── README.md              ← npm README
├── docs/                      ← Documentation (GitHub only)
│   ├── features/              ← Feature documentation
│   ├── verification/          ← Benchmark & reports
│   └── changelog/             ← Individual changelogs
├── .github/workflows/         ← CI/CD pipelines
├── .cursor/                   ← Cursor IDE config
├── .codex/                    ← Codex CLI config
├── .claude/                   ← Claude Code config
├── .qwen/                     ← Qwen Code config
├── README.md                  ← Main README (GitHub)
├── CHANGELOG.md               ← Consolidated changelog
├── CONTRIBUTING.md            ← Contribution guide
├── ARCHITECTURE.md            ← This file
├── LICENSE                    ← MIT license
├── AGENTS.md                  ← Agent rules
└── CLAUDE.md                  ← Claude-specific rules
```

## What Gets Published

When you run `npm publish` from `tools/devctx/`, only these files are included:

```
smart-context-mcp/
├── src/                   ← All source code
├── scripts/               ← CLI binaries
│   ├── claude-hook.js
│   ├── check-repo-safety.js
│   ├── devctx-server.js
│   ├── headless-wrapper.js
│   ├── init-clients.js
│   └── report-metrics.js
├── package.json
└── README.md              ← npm README
```

**Not published:**
- Tests (`tests/`)
- Evals (`evals/`)
- Fixtures (`fixtures/`)
- Root documentation (`/docs/`)
- Development configs (`.cursor/`, `.github/`, etc.)

This is defined in the `files` field of `tools/devctx/package.json`.

## Development Workflow

### Setup

```bash
# Clone repository
git clone https://github.com/Arrayo/smart-context-mcp.git
cd smart-context-mcp

# Install dependencies
cd tools/devctx
npm install
```

### Making Changes

All development happens in `tools/devctx/`:

```bash
cd tools/devctx

# Edit source
vim src/tools/smart-read.js

# Run tests
npm test

# Verify features
npm run verify

# Run benchmark
npm run benchmark
```

### Testing

```bash
cd tools/devctx

# Unit tests
npm test

# Feature verification
npm run verify

# Evaluation
npm run eval
npm run eval:self

# Full benchmark
npm run benchmark
```

### Documentation

- **Feature docs**: Edit in `/docs/features/`
- **Main README**: Edit `/README.md`
- **npm README**: Edit `tools/devctx/README.md`
- **Changelog**: Update `/CHANGELOG.md`

### Releasing

```bash
cd tools/devctx

# Run full verification
npm run benchmark

# Bump version
npm version minor  # or patch, major

# Publish to npm
npm publish

# Commit version bump
cd ../..
git add tools/devctx/package.json
git commit -m "chore: release v1.x.x"
git push

# Create GitHub release
gh release create v1.x.x --title "v1.x.x" --notes "..."
```

## Why `tools/devctx/`?

Historical reasons. The repository started as a development workspace for multiple MCP experiments, but only one (devctx) became production-ready.

We kept the `tools/devctx/` structure because:
1. Changing it would break existing installations
2. It allows future expansion if needed
3. It clearly separates the package from repository metadata

## Package vs Repository

| Aspect | Package (`tools/devctx/`) | Repository (root) |
|--------|---------------------------|-------------------|
| **Purpose** | Publishable npm package | Development workspace |
| **Dependencies** | Production only | None |
| **Tests** | Included but not published | N/A |
| **Docs** | npm README only | Full documentation |
| **Scripts** | CLI binaries | CI/CD workflows |
| **Published** | Yes (to npm) | No (GitHub only) |

## Common Tasks

### Add a new tool

1. Create `src/tools/my-tool.js`
2. Implement tool function
3. Add Zod schema in `src/server.js`
4. Register tool in `src/server.js`
5. Add tests in `tests/my-tool.test.js`
6. Update `README.md` and docs

### Add a new language parser

1. Create `src/parsers/my-lang.js`
2. Implement parser (AST or heuristic)
3. Register in `src/index.js`
4. Add test fixtures
5. Add tests
6. Update supported languages in README

### Fix a bug

1. Add failing test in `tests/`
2. Fix bug in `src/`
3. Verify test passes
4. Run full test suite
5. Commit with `fix:` prefix

### Improve performance

1. Add benchmark in `evals/`
2. Make optimization
3. Run `npm run eval` to verify improvement
4. Document in commit message
5. Update performance claims if significant

## CI/CD

GitHub Actions runs on every push:

```yaml
.github/workflows/ci.yml:
  - Install dependencies
  - Run tests (Node 18, 20, 22)
  - Run feature verification
  - Run evaluation
```

All tests must pass before merge.

## Questions?

- **Issues**: [GitHub Issues](https://github.com/Arrayo/smart-context-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Arrayo/smart-context-mcp/discussions)
- **Email**: fcp1978@hotmail.com

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.
