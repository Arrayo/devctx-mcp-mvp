# Contributing to smart-context-mcp

Thank you for your interest in contributing!

## Repository Structure

This is a **simple repository** with the publishable package located in `tools/devctx/`.

```
/
├── tools/devctx/          ← Publishable npm package
│   ├── src/               ← Source code
│   ├── tests/             ← Unit tests
│   ├── scripts/           ← CLI scripts
│   ├── evals/             ← Evaluation harness
│   ├── package.json       ← Package metadata
│   └── README.md          ← npm README
├── docs/                  ← Documentation
│   ├── features/          ← Feature docs
│   ├── verification/      ← Benchmark & reports
│   └── changelog/         ← Individual changelogs
├── .github/workflows/     ← CI/CD
├── README.md              ← Main README
├── CHANGELOG.md           ← Consolidated changelog
└── LICENSE                ← MIT license
```

### What Gets Published

Only the contents of `tools/devctx/` are published to npm as `smart-context-mcp`.

Published files (defined in `tools/devctx/package.json`):
- `src/` - All source code
- `scripts/` - CLI binaries
- `README.md` - npm documentation

**Not published:**
- `tests/` - Unit tests
- `evals/` - Evaluation harness
- `fixtures/` - Test fixtures
- Root `/docs/` - Documentation (available on GitHub)

## Development Setup

### Prerequisites

- Node.js 18+ (22+ recommended for SQLite features)
- Git
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Arrayo/smart-context-mcp.git
cd smart-context-mcp

# Install dependencies (in the package directory)
cd tools/devctx
npm install
```

### Running Tests

```bash
cd tools/devctx

# Unit tests (421 tests)
npm test

# Feature verification (14 features)
npm run verify

# Full benchmark (all suites)
npm run benchmark

# Evaluation harness
npm run eval
npm run eval:self
```

### Development Workflow

1. **Make changes** in `tools/devctx/src/`
2. **Add tests** in `tools/devctx/tests/`
3. **Run tests** with `npm test`
4. **Verify features** with `npm run verify`
5. **Update docs** if adding features
6. **Commit** with clear message

### Code Structure

```
tools/devctx/src/
├── tools/              ← MCP tool implementations
│   ├── smart-read.js
│   ├── smart-search.js
│   ├── smart-context.js
│   └── ...
├── storage/            ← SQLite storage layer
├── utils/              ← Utilities
├── index.js            ← Symbol indexing
├── metrics.js          ← Metrics tracking
├── server.js           ← MCP server definition
└── mcp-server.js       ← Server entry point
```

## Testing

### Unit Tests

Located in `tools/devctx/tests/`:

```bash
npm test                    # All tests
npm test -- smart-read      # Specific test file
```

Tests use Node.js native `node:test` runner.

### Feature Verification

End-to-end verification of all tools:

```bash
npm run verify
```

### Evaluation

Benchmark with synthetic corpus:

```bash
npm run eval              # Synthetic corpus
npm run eval:self         # Real project (this repo)
npm run eval -- --baseline  # Without index/intent
```

## Making Changes

### Adding a New Tool

1. Create `tools/devctx/src/tools/my-tool.js`
2. Implement the tool function
3. Add Zod schema in `tools/devctx/src/server.js`
4. Register tool in `server.js`
5. Add tests in `tools/devctx/tests/my-tool.test.js`
6. Update documentation

### Adding a New Language Parser

1. Add parser in `tools/devctx/src/parsers/`
2. Register in `tools/devctx/src/index.js`
3. Add test fixtures
4. Add tests
5. Update supported languages list in README

### Updating Documentation

- **Feature docs**: `docs/features/`
- **Verification**: `docs/verification/`
- **Changelogs**: `docs/changelog/`
- **Main README**: `/README.md`
- **npm README**: `tools/devctx/README.md`

## Release Process

### Version Bump

```bash
cd tools/devctx

# Patch (bug fixes)
npm version patch

# Minor (new features)
npm version minor

# Major (breaking changes)
npm version major
```

### Pre-Release Checklist

- [ ] All tests passing (`npm test`)
- [ ] Feature verification passing (`npm run verify`)
- [ ] Benchmark passing (`npm run benchmark`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped in `tools/devctx/package.json`

### Publishing

```bash
cd tools/devctx

# Dry run
npm publish --dry-run

# Publish to npm
npm publish
```

### Post-Release

1. Create GitHub release with tag
2. Update main README if needed
3. Announce in relevant channels

## Code Style

- Use ESM imports (`import`/`export`)
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Follow existing patterns

## Commit Messages

Use conventional commit format:

```
type(scope): subject

body (optional)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `test`: Tests only
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `chore`: Maintenance

**Examples:**
```
feat(git-blame): add symbol-level code attribution
fix(smart-read): handle missing files gracefully
docs: update benchmark documentation
test: add tests for cache warming
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Run verification (`npm run verify`)
6. Commit with clear messages
7. Push to your fork
8. Open a pull request

### PR Checklist

- [ ] Tests added/updated
- [ ] Tests passing
- [ ] Documentation updated
- [ ] No linter errors
- [ ] Clear commit messages
- [ ] PR description explains changes

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/Arrayo/smart-context-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Arrayo/smart-context-mcp/discussions)
- **Email**: fcp1978@hotmail.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

If anything is unclear, please open an issue or discussion. We're happy to help!
