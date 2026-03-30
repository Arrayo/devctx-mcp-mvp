# Compatibility Matrix Design

## Current State

### Existing Matrix (docs/client-compatibility.md:5-14)

| Feature | Cursor | Claude Desktop | Codex CLI | Qwen Code |
|---------|--------|----------------|-----------|-----------|
| **MCP Support** | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Agent Rules** | ✅ `.cursor/rules/*.mdc` | ✅ `CLAUDE.md` | ✅ `AGENTS.md` | ✅ `AGENTS.md` |
| **Conditional Rules** | ✅ Globs + context | ❌ No | ❌ No | ❌ No |
| **Native Hooks** | ❌ No | ✅ SessionStart, PostToolUse | ❌ No | ❌ No |
| **Task Checkpoints** | ✅ `smart_turn` | ✅ `smart_turn` + hooks | ✅ `smart_turn` | ✅ `smart_turn` |
| **Auto smart_turn** | ❌ Agent decides | ⚠️ Via hooks (opt-in) | ❌ Agent decides | ❌ Agent decides |
| **Node 22+ (SQLite)** | ✅ Recommended | ✅ Recommended | ✅ Recommended | ✅ Recommended |
| **Node 18-20 Fallback** | ⚠️ Metrics only | ⚠️ Metrics only | ⚠️ Metrics only | ⚠️ Metrics only |

**Automaticity levels:**
- Cursor: Medium
- Claude Desktop: High (with hooks)
- Codex CLI: Low-Medium
- Qwen Code: Low-Medium

---

## Problems with Current Matrix

1. **Not visible enough** - Buried in `docs/client-compatibility.md`
2. **Missing key info** - No "Near-automatic usage potential" column
3. **Ambiguous automaticity** - "Medium", "High" not well defined
4. **No limitations column** - Important constraints not visible
5. **No quick decision guide** - Hard to choose client

---

## Proposed Enhanced Matrix

### Location

**Primary:** README.md (after "Client Compatibility" section)  
**Secondary:** docs/client-compatibility.md (keep detailed version)

### Columns

1. **Client** - Name and version
2. **MCP Support** - ✅/❌
3. **Rules Support** - Type and location
4. **Hooks Support** - Which hooks, if any
5. **`smart_turn` Usefulness** - How well it works
6. **Persistence** - SQLite support
7. **Near-Automatic Potential** - Realistic automation level
8. **Key Limitations** - What doesn't work

### Enhanced Matrix (Proposed)

| Client | MCP | Rules | Hooks | `smart_turn` | Persistence | Near-Automatic | Limitations |
|--------|-----|-------|-------|--------------|-------------|----------------|-------------|
| **Cursor** | ✅ Full | ✅ Conditional (`.cursor/rules/*.mdc`) | ❌ No | ✅ Manual call | ✅ SQLite (Node 22+) | 🟡 Medium<br>(Agent decides when) | • No auto `smart_turn`<br>• Agent must follow rules<br>• Requires Agent mode |
| **Claude Desktop** | ✅ Full | ✅ Embedded (`CLAUDE.md`) | ✅ SessionStart, PostToolUse, Stop | ✅ Can auto-trigger via hooks | ✅ SQLite (Node 22+) | 🟢 High<br>(Hooks can auto-trigger) | • Hooks are opt-in<br>• No conditional rules<br>• Higher fixed context cost (200t) |
| **Codex CLI** | ✅ Full | ✅ Embedded (`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite (Node 22+) | 🟡 Low-Medium<br>(Agent decides when) | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |
| **Qwen Code** | ✅ Full | ✅ Embedded (`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite (Node 22+) | 🟡 Low-Medium<br>(Agent decides when) | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |

**Legend:**
- 🟢 High: Hooks can auto-trigger tools
- 🟡 Medium/Low: Agent decides when to use tools
- ✅ Supported
- ⚠️ Partial/Fallback
- ❌ Not supported

---

## Explanation Section (To Accompany Matrix)

### What "Near-Automatic" Means

**🟢 High (Claude Desktop with hooks):**
- Hooks can auto-trigger `smart_turn(start)` on session start
- Hooks can auto-checkpoint after significant tool use
- Agent still decides which devctx tools to use
- Closest to "automatic" behavior available

**🟡 Medium (Cursor):**
- Agent reads rules automatically (always active)
- Conditional profiles activate based on file globs
- Agent decides when to use devctx tools
- Agent must manually call `smart_turn`

**🟡 Low-Medium (Codex, Qwen):**
- Agent reads rules automatically (embedded)
- Agent decides when to use devctx tools
- Agent must manually call `smart_turn`
- No conditional activation

### What "Near-Automatic" Does NOT Mean

❌ **Not automatic prompt interception** - MCP cannot intercept prompts before agent sees them  
❌ **Not forced tool usage** - Agent always decides which tools to use  
❌ **Not guaranteed workflow** - Agent may skip tools for simple tasks  
❌ **Not client-level magic** - Depends on agent following rules

### The Reality

**All clients:**
- Agent reads rules (guidance)
- Agent decides tool usage (autonomy)
- MCP provides tools (passive)
- You verify with metrics (transparency)

**The difference:**
- **Hooks** (Claude Desktop) can auto-trigger specific tools at specific moments
- **Conditional rules** (Cursor) reduce fixed context cost and activate profiles when relevant
- **Embedded rules** (Codex, Qwen) are simple and always active

---

## Comparison: Current vs Proposed

### Current (docs/client-compatibility.md)

**Pros:**
- Detailed information
- Multiple tables for different aspects
- Good for deep dive

**Cons:**
- Not visible (buried in docs)
- Spread across multiple tables
- No quick decision guide
- Ambiguous "automaticity"

### Proposed (README.md)

**Pros:**
- Highly visible (main README)
- Single comprehensive table
- Clear limitations column
- Explicit "near-automatic" explanation
- Quick decision guide

**Cons:**
- Longer table (more columns)
- May need horizontal scroll on mobile

---

## Implementation Plan

### 1. Add Enhanced Matrix to README.md

**Location:** After "Client Compatibility" heading (line ~663)

**Content:**
- Enhanced matrix (8 columns)
- Legend
- "What Near-Automatic Means" explanation
- "What It Does NOT Mean" clarification

### 2. Update docs/client-compatibility.md

**Changes:**
- Keep existing detailed tables
- Add reference to README for quick overview
- Expand "Automaticity level" explanations

### 3. Add Quick Decision Guide

**New section in README:**

```markdown
### Which Client Should I Use?

**Choose Cursor if:**
- ✅ You want lowest fixed context cost (150 tokens)
- ✅ You work on complex, multi-file tasks
- ✅ You want conditional rules (debugging, review, refactor profiles)

**Choose Claude Desktop if:**
- ✅ You want closest to "automatic" behavior
- ✅ You want hooks for session-aware workflows
- ✅ You're okay with opt-in hook configuration

**Choose Codex/Qwen if:**
- ✅ You want simple, embedded rules
- ✅ You prefer lightweight setup
- ✅ You're okay with manual `smart_turn` calls
```

---

## Key Messages

### For README

> **Important:** "Near-automatic" means hooks can auto-trigger tools (Claude Desktop) or conditional rules activate based on context (Cursor). It does NOT mean the MCP intercepts prompts or forces tool usage. The agent always decides.

### For docs/client-compatibility.md

> **Detailed Comparison:** This document provides in-depth information about each client's capabilities. For a quick overview, see the [Compatibility Matrix](../README.md#client-compatibility) in the main README.

---

## Maintenance

### When to Update Matrix

1. **New client support** - Add new row
2. **Feature changes** - Update relevant cells
3. **Hook support changes** - Update "Hooks" column
4. **Rule format changes** - Update "Rules" column

### How to Keep Consistent

1. **Single source of truth** - README matrix is canonical
2. **Reference from docs** - Other docs link to README
3. **Version in CHANGELOG** - Document matrix changes
4. **Test with real clients** - Verify claims before updating

---

## Alternative: Simplified Matrix for README

If the 8-column matrix is too wide, here's a simplified version:

| Client | Automation Level | Key Advantage | Key Limitation |
|--------|-----------------|---------------|----------------|
| **Cursor** | 🟡 Medium | Conditional rules (lowest context cost) | No auto `smart_turn` |
| **Claude Desktop** | 🟢 High | Hooks can auto-trigger tools | Hooks are opt-in |
| **Codex CLI** | 🟡 Low-Medium | Simple embedded rules | No hooks, no conditional rules |
| **Qwen Code** | 🟡 Low-Medium | Simple embedded rules | No hooks, no conditional rules |

**Pros:**
- Easier to read on mobile
- Focuses on key differentiators
- Still provides decision guidance

**Cons:**
- Less detail
- May need to click through to docs

---

## Recommendation

**Use enhanced 8-column matrix in README** for maximum transparency and decision support.

**Rationale:**
1. Users need full picture to make informed decision
2. Limitations column is critical for managing expectations
3. "Near-automatic" needs explicit definition
4. Desktop users (primary audience) can handle wide table
5. Mobile users can scroll horizontally

**Fallback:** If user feedback indicates table is too wide, switch to simplified 4-column version.

---

## Final Matrix (Recommended)

### Client Compatibility Matrix

| Client | MCP | Rules | Hooks | `smart_turn` | Persistence | Near-Automatic | Key Limitations |
|--------|-----|-------|-------|--------------|-------------|----------------|-----------------|
| **Cursor** | ✅ Full | ✅ Conditional<br>(`.cursor/rules/*.mdc`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Medium**<br>Agent decides when | • No auto `smart_turn`<br>• Agent must follow rules<br>• Requires Agent mode |
| **Claude Desktop** | ✅ Full | ✅ Embedded<br>(`CLAUDE.md`) | ✅ SessionStart<br>PostToolUse<br>Stop | ✅ Can auto-trigger<br>via hooks | ✅ SQLite<br>(Node 22+) | 🟢 **High**<br>Hooks auto-trigger | • Hooks are opt-in<br>• No conditional rules<br>• Fixed context: 200t |
| **Codex CLI** | ✅ Full | ✅ Embedded<br>(`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Low-Medium**<br>Agent decides when | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |
| **Qwen Code** | ✅ Full | ✅ Embedded<br>(`AGENTS.md`) | ❌ No | ✅ Manual call | ✅ SQLite<br>(Node 22+) | 🟡 **Low-Medium**<br>Agent decides when | • No auto `smart_turn`<br>• No conditional rules<br>• No hooks |

**Legend:**
- 🟢 High: Hooks can auto-trigger tools at specific moments
- 🟡 Medium/Low: Agent reads rules and decides when to use tools
- ✅ Supported | ⚠️ Partial | ❌ Not supported

---

### What "Near-Automatic" Means

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

### What "Near-Automatic" Does NOT Mean

❌ **Not automatic prompt interception** - MCP cannot intercept or modify your prompts before the agent sees them  
❌ **Not forced tool usage** - Agent always has autonomy to decide which tools to use  
❌ **Not guaranteed workflow** - Agent may skip devctx tools for simple tasks (this is fine)  
❌ **Not client-level magic** - Behavior depends on agent following rules and making good decisions

---

### The Reality

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

### Which Client Should I Use?

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

---

**Bottom line:** All clients work well. The choice depends on your preference for automation level vs simplicity.
