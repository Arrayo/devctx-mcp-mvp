# Publishing smart-context-mcp 1.3.1 to npm

## Pre-publish Checklist

✅ Version bumped to 1.3.1 in package.json
✅ All tests passing (553 tests, 552 pass, 1 skipped)
✅ CHANGELOG.md updated with all changes
✅ README.md updated with new features
✅ All commits made (8 new commits ready)
✅ Working tree clean

## What's New in 1.3.1

### Breaking Changes (Positive)
- **All visibility features now ENABLED BY DEFAULT**
- Usage feedback, decision explainer, and missed opportunities detector are always on
- Users can disable with env vars if too verbose

### Major Features
- **Real-Time Usage Feedback** - See which devctx tools were used and tokens saved in each response
- **Decision Explainer System** - Understand why the agent chose specific devctx tools
- **Missed Opportunities Detector** - Detect when devctx should have been used but wasn't
- **MCP Prompts** - Automatic forcing with `/prompt use-devctx` in Cursor

### Real-Time Feedback
- Auto-enabled for first 10 tool calls (onboarding mode)
- Shows tools used, tokens saved, and targets
- Manual control: `export DEVCTX_SHOW_USAGE=true`
- Session-scoped tracking

### Decision Explainer
- Enable with `export DEVCTX_EXPLAIN=true`
- Shows why each tool was chosen
- Lists alternatives considered
- Explains expected benefits
- Detailed context for each decision

### Missed Opportunities
- Enable with `export DEVCTX_DETECT_MISSED=true`
- Detects: no usage, low adoption (<30%), usage dropped
- Estimates potential token savings
- Provides actionable suggestions
- Session-scoped analysis

### MCP Prompts
- 3 prompts: `use-devctx`, `devctx-workflow`, `devctx-preflight`
- Invoke with `/prompt use-devctx` in Cursor
- Automatic injection of forcing instructions
- No manual typing needed

### Multi-Client Agent Rules
- `.cursorrules` for Cursor (committed to git)
- `CLAUDE.md` template for Claude Desktop
- `AGENTS.md` template for other agents
- All enforce MANDATORY devctx usage policy
- Template in `docs/agent-rules-template.md`

### Files Added
- `src/usage-feedback.js` - Real-time usage tracking
- `src/decision-explainer.js` - Decision explanation system
- `src/missed-opportunities.js` - Opportunity detection
- `tests/usage-feedback.test.js` - 14 new tests
- `tests/decision-explainer.test.js` - 11 new tests
- `tests/missed-opportunities.test.js` - 11 new tests
- `docs/usage-feedback.md` - Complete guide
- `docs/decision-explainer.md` - Complete guide
- `docs/missed-opportunities.md` - Complete guide
- `docs/mcp-prompts.md` - Prompts documentation

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
- Publish as `smart-context-mcp@1.3.1`
- Make it available via `npm install smart-context-mcp`

### 4. Verify publication

```bash
npm view smart-context-mcp version
# Should show: 1.3.1

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
npm install smart-context-mcp@1.3.1

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

2. **MCP prompts work:**
   ```
   User: "/prompt use-devctx"
   Agent: Should receive forcing instructions automatically
   ```

3. **Features enabled by default:**
   - Should see usage feedback after every devctx tool call
   - Should see decision explanations
   - Should see missed opportunities warnings if devctx not used
   - No env vars needed (all enabled by default)

4. **Agent rules work:**
   - Agent should mention devctx usage policy
   - Agent should use devctx tools automatically
   - If native tools used, agent should explain why

## Rollback (if needed)

If something goes wrong:

```bash
# Unpublish (within 72 hours)
npm unpublish smart-context-mcp@1.3.1

# Or deprecate
npm deprecate smart-context-mcp@1.3.1 "Use 1.2.0 instead"
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

- **1.3.1** (2026-03-30) - All features enabled by default, multi-client rules, agent rules template
- **1.3.0** (2026-03-30) - Real-time feedback, decision explainer, missed opportunities, MCP prompts
- **1.2.0** (2026-03-30) - Adoption metrics, client guidance, forcing prompts
- **1.1.0** (2026-03-29) - Base rule reduction, preflight visibility, feedback policy
- **1.0.x** - Initial releases
