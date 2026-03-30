# Agent Rules Template

This template can be used to create agent rules for different clients.

---

## For Cursor: `.cursorrules`

Already included in the project root.

---

## For Claude Desktop: `CLAUDE.md`

Create this file in your project root:

```markdown
<!-- devctx:start -->
## devctx MCP Usage Policy

Use devctx for **complex or multi-step tasks**:

**Large files (>500 lines)** → `smart_read(mode="outline")` instead of `Read` → 90% savings

**Multiple file reads** → `smart_context` or `smart_read_batch` instead of multiple `Read` calls

**Code search across project** → `smart_search` instead of `Grep` (intent-aware ranking)

**Context building** → `smart_context(task)` instead of manual Read + Grep

**Diagnostic commands** → `smart_shell` instead of `Shell`

**When native tools are fine:**
- Small files (<200 lines) read once
- Quick grep for specific string
- Writing/editing files (always native)
- Simple single-step operations

**Recommended workflow:**
```
1. smart_turn(start) - Recover session context
2. smart_context(task) - Build complete context
3. smart_search(query) - Search specific patterns
4. smart_read(file) - Read files efficiently
5. smart_turn(end) - Save checkpoint
```

**Preflight (recommended):**
```
build_index(incremental=true)
smart_turn(start)
```

**Visibility features (enabled by default):**
- 📊 Usage feedback - See tools used and tokens saved
- 🤖 Decision explanations - Understand why tools were chosen
- ⚠️ Missed opportunities - Detect when devctx should have been used

**Decision guideline:**
- Simple task (1-2 files, <200 lines) → Native tools fine
- Complex task (multiple files, large files) → Use devctx
- When in doubt → Start with native, switch if needed
<!-- devctx:end -->
```

---

## For Other Agents: `AGENTS.md`

Create this file in your project root (same content as `CLAUDE.md` above)

---

## For Codex: `.codex/rules/devctx.md`

If using Codex, create `.codex/rules/devctx.md`:

```markdown
# devctx MCP Usage

When devctx MCP is installed, prefer devctx tools:

- `smart_read` over `Read`
- `smart_search` over `Grep`
- `smart_context` over multiple reads
- `smart_shell` over `Shell`

Workflow: `smart_turn(start)` → work → `smart_turn(end)`

See project README for complete documentation.
```

---

## Installation

### Option 1: Copy Template Manually

```bash
# For Cursor (already included)
# .cursorrules is in project root

# For Claude Desktop
cp docs/agent-rules-template.md CLAUDE.md
# Edit CLAUDE.md to keep only the template content

# For other agents
cp docs/agent-rules-template.md AGENTS.md
# Edit AGENTS.md to keep only the template content
```

### Option 2: Use Init Script (Future)

```bash
npm run init:rules
# Would create CLAUDE.md, AGENTS.md from templates
```

---

## Why These Files Are Gitignored

`CLAUDE.md` and `AGENTS.md` are in `.gitignore` because:

1. **User-specific** - Different users may want different rules
2. **Client-specific** - Rules may vary by AI client
3. **Project-specific** - Some projects may not want these rules

**But `.cursorrules` is committed** because:
- It's the standard Cursor convention
- It's project-level policy, not user-level
- It benefits all Cursor users of the project

---

## Verification

After creating these files, verify they work:

### Cursor
```
# Should see .cursorrules being applied
# Agent should mention devctx usage policy
```

### Claude Desktop
```
# Should see CLAUDE.md being applied
# Agent should mention devctx usage policy
```

### Test
Ask the agent:
```
What rules do you have about using devctx MCP?
```

Agent should respond with the policy details.

---

## Updating Rules

When the devctx MCP is updated:

1. **`.cursorrules`** - Update in git, commit, push
2. **`CLAUDE.md`** - User updates manually from template
3. **`AGENTS.md`** - User updates manually from template

Or use the template in this doc as the source of truth.

---

## Summary

**Three rule files for three client types:**
- ✅ `.cursorrules` - Cursor (committed to git)
- ✅ `CLAUDE.md` - Claude Desktop (user creates from template)
- ✅ `AGENTS.md` - Other agents (user creates from template)

**All enforce the same policy:** Use devctx MCP when installed.
