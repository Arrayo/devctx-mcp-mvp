# Publishing smart-context-mcp 1.2.0 to npm

## Pre-publish Checklist

✅ Version bumped to 1.2.0 in package.json
✅ All tests passing (518 tests, 517 pass, 1 skipped)
✅ CHANGELOG.md updated with all changes
✅ README.md updated with adoption metrics section
✅ All commits made (3 new commits ready)
✅ Working tree clean

## What's New in 1.2.0

### Major Features
- **Adoption Metrics** - Measure how often agents actually use devctx tools
- **Adoption Analysis** - Track usage by inferred complexity, sessions, tool popularity
- **Integrated Reporting** - Adoption stats in `npm run report:metrics`

### Documentation Improvements
- Client guidance table (Cursor, Claude Desktop, Codex, Qwen)
- Official forcing prompts (complete + ultra-short)
- Concrete feedback examples
- Preflight visibility enhancements
- Further quality claim matization

### Files Added
- `src/analytics/adoption.js` - Adoption analysis logic
- `tests/adoption-analytics.test.js` - 9 new tests
- `docs/adoption-metrics-design.md` - Design document
- `docs/adoption-metrics-implementation.md` - Implementation summary
- `docs/adoption-improvements-phase2.md` - Phase 2 analysis

## Publishing Steps

### 1. Push commits to GitHub

```bash
cd /home/moro/projects/devctx-mcp-mvp
git push origin main
```

### 2. Build and test package

```bash
cd tools/devctx
npm test          # Verify all tests pass
npm run verify    # Verify features work
```

### 3. Publish to npm

```bash
cd tools/devctx
npm publish
```

This will:
- Build the package
- Include files listed in `files` field (src/, scripts/)
- Publish as `smart-context-mcp@1.2.0`
- Make it available via `npm install smart-context-mcp`

### 4. Verify publication

```bash
npm view smart-context-mcp version
# Should show: 1.2.0

npm view smart-context-mcp
# Should show updated description, keywords, etc.
```

### 5. Update local Cursor installation

```bash
# Navigate to your Cursor MCP directory
cd ~/.cursor/mcp/smart-context-mcp

# Update to latest version
npm update smart-context-mcp

# Or reinstall
npm uninstall smart-context-mcp
npm install smart-context-mcp@1.2.0

# Restart Cursor
# Settings → MCP → Check "smart-context" is active
```

### 6. Test in Cursor

Open a conversation and verify:

1. **MCP is active:**
   ```
   User: "What MCP tools do you have available?"
   Agent: Should list smart_read, smart_search, smart_context, etc.
   ```

2. **Adoption metrics work:**
   ```bash
   npm run report:metrics
   # Should show adoption analysis section
   ```

3. **New features work:**
   - Client guidance visible in README
   - Forcing prompts documented
   - Feedback examples clear

## Rollback (if needed)

If something goes wrong:

```bash
# Unpublish (within 72 hours)
npm unpublish smart-context-mcp@1.2.0

# Or deprecate
npm deprecate smart-context-mcp@1.2.0 "Use 1.1.0 instead"
```

## Post-publish

1. Create GitHub release
2. Update documentation links
3. Announce in relevant channels
4. Monitor for issues

## Notes

- **Breaking changes:** None (fully backward compatible)
- **New dependencies:** None (uses existing dependencies)
- **Node version:** Requires Node 18+ (same as before)
- **License:** MIT (unchanged)

## Version History

- **1.2.0** (2026-03-30) - Adoption metrics, client guidance, forcing prompts
- **1.1.0** (2026-03-29) - Base rule reduction, preflight visibility, feedback policy
- **1.0.x** - Initial releases
