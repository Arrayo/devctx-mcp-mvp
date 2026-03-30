# Executive Summary: Enhanced Compatibility Matrix (Point 7)

## The Problem

Previous compatibility information was:
- **Not visible enough** - Buried in `docs/client-compatibility.md`
- **Missing key info** - No "Near-Automatic" levels or limitations
- **Ambiguous** - "Medium", "High" automaticity not well defined
- **Hard to decide** - No clear guidance for choosing client

---

## The Solution

Created comprehensive 8-column compatibility matrix in main README with:
- Clear "Near-Automatic" levels (🟢 High, 🟡 Medium, 🟡 Low-Medium)
- Explicit "Key Limitations" column
- Detailed explanations of what "near-automatic" means (and doesn't mean)
- Decision guide for choosing client

---

## New Compatibility Matrix (README.md)

| Client | MCP | Rules | Hooks | `smart_turn` | Persistence | Near-Automatic | Key Limitations |
|--------|-----|-------|-------|--------------|-------------|----------------|-----------------|
| **Cursor** | ✅ Full | ✅ Conditional<br>(`.cursor/rules/*.mdc`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Medium**<br>Agent decides when | • No auto `smart_turn`<br>• Agent must follow rules<br>• Requires Agent mode |
| **Claude Desktop** | ✅ Full | ✅ Embedded<br>(`CLAUDE.md`) | ✅ SessionStart<br>PostToolUse<br>Stop | ✅ Can auto-trigger<br>via hooks | ✅ SQLite<br>(Node 22+) | 🟢 **High**<br>Hooks auto-trigger | • Hooks are opt-in<br>• No conditional rules<br>• Fixed context: 200t |
| **Codex CLI** | ✅ Full | ✅ Embedded<br>(`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Low-Medium**<br>Agent decides when | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |
| **Qwen Code** | ✅ Full | ✅ Embedded<br>(`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Low-Medium**<br>Agent decides when | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |

---

## Key Additions

### 1. "Near-Automatic" Levels

**🟢 High (Claude Desktop with hooks):**
- Hooks can auto-trigger `smart_turn(start)` when you start a session
- Hooks can auto-checkpoint after significant tool use
- Agent still decides which devctx tools to use for each task
- **This is the closest to "automatic" behavior available**

**🟡 Medium (Cursor):**
- Agent reads base rules automatically (always active, 150 tokens)
- Conditional profiles activate based on file globs (debugging, review, etc.)
- Agent decides when to use devctx tools based on task
- Agent must manually call `smart_turn` (not auto-triggered)

**🟡 Low-Medium (Codex, Qwen):**
- Agent reads embedded rules automatically (always active, 200 tokens)
- Agent decides when to use devctx tools based on task
- Agent must manually call `smart_turn` (not auto-triggered)
- No conditional activation or hooks

---

### 2. What "Near-Automatic" Does NOT Mean

❌ **Not automatic prompt interception** - MCP cannot intercept or modify your prompts before the agent sees them  
❌ **Not forced tool usage** - Agent always has autonomy to decide which tools to use  
❌ **Not guaranteed workflow** - Agent may skip devctx tools for simple tasks (this is fine)  
❌ **Not client-level magic** - Behavior depends on agent following rules and making good decisions

---

### 3. The Reality

**All clients work the same way:**
1. Agent reads rules (guidance about when devctx tools are useful)
2. Agent decides tool usage (autonomy to choose best approach)
3. MCP provides tools (passive, only responds when called)
4. You verify with metrics (`npm run report:metrics`)

**The differences:**
- **Hooks** (Claude Desktop) can auto-trigger specific tools at specific moments (e.g., `smart_turn(start)` on session start)
- **Conditional rules** (Cursor) reduce fixed context cost and activate task-specific profiles when relevant
- **Embedded rules** (Codex, Qwen) are simple, always active, and work everywhere

---

### 4. Decision Guide

**Choose Cursor if:**
- ✅ You want lowest fixed context cost (150 tokens base + 120 tokens profile when active)
- ✅ You work on complex, multi-file tasks (debugging, refactoring, architecture)
- ✅ You want conditional rules that activate based on file patterns

**Choose Claude Desktop if:**
- ✅ You want closest to "automatic" behavior (hooks can auto-trigger `smart_turn`)
- ✅ You want session-aware workflows with automatic checkpointing
- ✅ You're okay with opt-in hook configuration

**Choose Codex or Qwen if:**
- ✅ You want simple, embedded rules (no separate config files)
- ✅ You prefer lightweight setup (single `AGENTS.md` file)
- ✅ You're okay with manual `smart_turn` calls and no conditional activation

**Bottom line:** All clients work well. The choice depends on your preference for automation level vs simplicity.

---

## Changes Made

### 1. README.md (Client Compatibility Section)

**Before:**
- Simple 6-row table
- Ambiguous "Automaticity" (Medium, High, Low-Medium)
- No limitations column
- No explanation of what "automatic" means

**After:**
- Comprehensive 8-column table
- Clear "Near-Automatic" levels with emoji indicators
- Explicit "Key Limitations" column
- Detailed explanation sections
- Decision guide

### 2. docs/client-compatibility.md

**Before:**
- No reference to main README

**After:**
- Added reference to main README for quick overview
- Kept detailed information for deep dive

### 3. New Documentation

**docs/compatibility-matrix-design.md** (new file):
- Design rationale
- Alternative designs considered
- Maintenance guidelines
- Implementation plan

---

## Benefits

### 1. Visibility
- Matrix is now in main README (highly visible)
- Users see it before installation

### 2. Clarity
- "Near-Automatic" levels are explicitly defined
- Limitations are front and center
- No ambiguity about what "automatic" means

### 3. Decision Support
- Clear guidance for choosing client
- Explicit trade-offs (automation vs simplicity)
- Realistic expectations

### 4. Honesty
- "What It Does NOT Mean" section prevents over-promising
- "The Reality" section explains actual behavior
- Limitations column shows constraints

---

## Comparison: Before vs After

### Before (Ambiguous)

| Feature | Cursor | Claude Desktop | Codex CLI | Qwen Code |
|---------|--------|----------------|-----------|-----------|
| **Automaticity** | Medium | High | Low-Medium | Low-Medium |

**Problems:**
- What does "Medium" mean?
- What does "High" mean?
- What are the limitations?
- How do I choose?

### After (Clear)

| Client | Near-Automatic | Key Limitations |
|--------|----------------|-----------------|
| **Cursor** | 🟡 **Medium**<br>Agent decides when | • No auto `smart_turn`<br>• Agent must follow rules<br>• Requires Agent mode |
| **Claude Desktop** | 🟢 **High**<br>Hooks auto-trigger | • Hooks are opt-in<br>• No conditional rules<br>• Fixed context: 200t |

**Benefits:**
- Clear definition of "Medium" and "High"
- Explicit limitations
- Visual indicators (🟢 🟡)
- Easy to compare

---

## Maintenance

### When to Update

1. **New client support** - Add new row
2. **Feature changes** - Update relevant cells
3. **Hook support changes** - Update "Hooks" column
4. **Limitation changes** - Update "Key Limitations" column

### How to Keep Consistent

1. **Single source of truth** - README matrix is canonical
2. **Reference from docs** - Other docs link to README
3. **Version in CHANGELOG** - Document matrix changes
4. **Test with real clients** - Verify claims before updating

---

## Verification

### Tests
- ✅ No code changes (only documentation)
- ✅ All 451 tests still pass
- ✅ No functional impact

### Documentation
- ✅ README updated with comprehensive matrix
- ✅ Explanation sections added
- ✅ Decision guide added
- ✅ docs/client-compatibility.md updated with reference

---

## Files Modified

```
README.md (Client Compatibility section expanded)
docs/client-compatibility.md (added reference to README)
CHANGELOG.md (new section)
```

**New files:**
```
docs/compatibility-matrix-design.md (design rationale, 450+ lines)
docs/compatibility-matrix-executive-summary.md (this file)
```

---

## Commit Message

```
docs: add comprehensive compatibility matrix with near-automatic levels

Add 8-column matrix to README with clear automation levels and limitations:
- New columns: MCP, Rules, Hooks, smart_turn, Persistence, Near-Automatic, Key Limitations
- Visual indicators: 🟢 High, 🟡 Medium/Low-Medium
- "What Near-Automatic Means" explanation section
- "What It Does NOT Mean" clarification (no prompt interception, no forced usage)
- "Which Client Should I Use?" decision guide

Update docs/client-compatibility.md to reference main README for quick overview.

Rationale: Make client differences explicit, avoid ambiguity about "automatic" behavior,
facilitate informed adoption decisions.

New doc: compatibility-matrix-design.md with design rationale
Goal: Explicit differences, clear expectations, easy decision-making
```

---

## Next Steps

✅ **Completed:**
- Enhanced compatibility matrix in README
- Clear "Near-Automatic" definitions
- Explicit limitations column
- Decision guide
- Design documentation

⏭️ **Remaining (from external review):**
- Point 8: Harden security narrative with rejection examples

---

## Key Messages

### For Users

> **All clients work well.** The main difference is automation level: Claude Desktop can auto-trigger tools via hooks (🟢 High), Cursor uses conditional rules (🟡 Medium), and Codex/Qwen use simple embedded rules (🟡 Low-Medium). Choose based on your preference for automation vs simplicity.

### For Documentation

> **"Near-Automatic" means hooks or conditional rules can trigger tools at specific moments. It does NOT mean the MCP intercepts prompts or forces tool usage. The agent always decides.**

---

## Conclusion

**The enhanced matrix achieves:**

1. **Visibility** - In main README, highly visible
2. **Clarity** - Explicit definitions, no ambiguity
3. **Honesty** - Clear about what "automatic" means (and doesn't)
4. **Decision support** - Easy to choose client
5. **Maintainability** - Single source of truth, easy to update

**Key insight:** Transparency about limitations builds trust and manages expectations.

**This is practical engineering**, not magic.
