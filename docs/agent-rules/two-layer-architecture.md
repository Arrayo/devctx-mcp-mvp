# Two-Layer Agent Rules Architecture

## The Problem

**Original design:** Single dense rule with `alwaysApply: true`

```
Base preferences (4 tools)          ~80 tokens
Checkpoint recovery (3 patterns)    ~60 tokens
Reading strategy (5 modes)          ~80 tokens
Search strategy (3 intents)         ~60 tokens
5 complete workflows                ~300 tokens
Repository safety                   ~20 tokens
─────────────────────────────────────────────
Total (always injected)             ~600 tokens
```

**Contradiction:** Product promises token savings, but injects 600 tokens per interaction.

---

## The Solution

**Two-layer architecture:**

### Layer 1: Base Rule (Always Active)

```
Core tool preferences               ~50 tokens
Entry point guidance                ~40 tokens
Reading cascade                     ~40 tokens
Disclaimer                          ~20 tokens
─────────────────────────────────────────────
Total (always injected)             ~150 tokens
```

**Reduction:** 75% (600 → 150 tokens)

---

### Layer 2: Task Profiles (Conditional)

Applied only when file globs or task context match:

```
Debugging profile                   ~120 tokens
Code Review profile                 ~130 tokens
Refactoring profile                 ~120 tokens
Testing profile                     ~110 tokens
Architecture profile                ~120 tokens
```

**Total when profile applies:** 150 (base) + 120 (profile) = **270 tokens**

**Still 55% cheaper than original** (270 vs 600 tokens)

---

## Context Cost Analysis

### Scenario 1: Simple Task (Read Single File)

**Before:**
- Base rule: 600 tokens
- Agent work: 50 tokens
- **Total:** 650 tokens

**After:**
- Base rule: 150 tokens
- No profile (simple task)
- Agent work: 50 tokens
- **Total:** 200 tokens

**Savings:** 69% (450 tokens saved)

---

### Scenario 2: Debugging Task

**Before:**
- Base rule: 600 tokens
- Agent work: 500 tokens
- **Total:** 1,100 tokens

**After:**
- Base rule: 150 tokens
- Debugging profile: 120 tokens
- Agent work: 500 tokens
- **Total:** 770 tokens

**Savings:** 30% (330 tokens saved)

---

### Scenario 3: 10 Simple Tasks in Session

**Before:**
- Base rule × 10: 6,000 tokens
- Agent work: 500 tokens
- **Total:** 6,500 tokens

**After:**
- Base rule × 10: 1,500 tokens
- Agent work: 500 tokens
- **Total:** 2,000 tokens

**Savings:** 69% (4,500 tokens saved)

---

## Implementation

### Cursor

**Base rule:**
```
.cursor/rules/devctx.mdc
---
description: Prefer devctx MCP tools when they add value (base rules)
alwaysApply: true
---
```

**Task profiles:**
```
.cursor/rules/profiles-compact/debugging.mdc
---
description: Debugging workflow with devctx
globs: ["**/*.test.*", "**/*.spec.*", "**/tests/**"]
---
```

**How Cursor applies:**
1. Base rule always injected (`alwaysApply: true`)
2. Profile injected when file matches glob OR task context suggests relevance

---

### Codex / Qwen / Claude

**Base rule embedded in `AGENTS.md` / `CLAUDE.md`:**
```markdown
<!-- devctx:start -->
## devctx

For file reading, code search, and diagnostics, prefer devctx MCP tools when they add value:
...
<!-- devctx:end -->
```

**Task profiles:** Referenced but not embedded (agent can request them if needed)

---

## Why This Works

### 1. Coherence with Product Value

**Product promise:** "Reduces token usage 85-90%"

**Old rules:** Inject 600 tokens per interaction (contradicts promise)

**New rules:** Inject 150 tokens per interaction (aligns with promise)

---

### 2. Maintains Agent Guidance

**Base rule provides:**
- ✅ Core tool preferences
- ✅ Entry point guidance (`smart_turn`)
- ✅ Reading cascade (compressed first)
- ✅ Disclaimer (suggestions, not guarantees)

**Agent still knows:**
- When to use devctx tools
- How to start tasks (`smart_turn(start)`)
- How to read efficiently (cascade)

---

### 3. Detailed Workflows When Needed

**Profile provides:**
- ✅ Complete workflow for task type
- ✅ Key tool usage patterns
- ✅ Best practices
- ✅ Token savings metrics

**Agent gets detailed guidance** only when task context matches.

---

### 4. Reduces Fixed Cost, Not Value

**Fixed cost:** 75% reduction (600 → 150 tokens)

**Value when needed:** 55% reduction (600 → 270 tokens)

**Agent effectiveness:** Maintained (still has core guidance + profiles when relevant)

---

## Metrics Comparison

### Before (Single Dense Rule)

| Metric | Value |
|--------|-------|
| Fixed cost per interaction | 600 tokens |
| Cost for 100 simple tasks | 60,000 tokens |
| Cost for 100 debugging tasks | 60,000 tokens (base) + agent work |
| Contradiction with product value | High |

### After (Two-Layer Architecture)

| Metric | Value |
|--------|-------|
| Fixed cost per interaction | 150 tokens |
| Cost for 100 simple tasks | 15,000 tokens |
| Cost for 100 debugging tasks | 27,000 tokens (base + profile) + agent work |
| Contradiction with product value | None |

**Savings:**
- Simple tasks: 75% (60K → 15K)
- Complex tasks: 55% (60K → 27K)

---

## Migration

**Existing installations:** No breaking changes

**New installations:**
```bash
npx smart-context-init --target .
```

**Files created:**
- `.cursor/rules/devctx.mdc` - Base rule (150 tokens)
- `.cursor/rules/profiles-compact/*.mdc` - Task profiles (120 tokens each)
- `AGENTS.md` - Base rule for Codex/Qwen
- `CLAUDE.md` - Base rule for Claude

**Backward compatibility:** Maintained (existing rules still work)

---

## Customization

### Adjust Base Rule

Edit `.cursor/rules/devctx.mdc`:
- Keep it short (< 200 tokens)
- Focus on core preferences
- Avoid detailed workflows

### Adjust Profiles

Edit `.cursor/rules/profiles-compact/*.mdc`:
- Can be more detailed (< 200 tokens)
- Focus on specific workflow
- Include token savings metrics

### Add New Profile

Create `.cursor/rules/profiles-compact/my-task.mdc`:
```markdown
---
description: My custom workflow
globs: ["**/*.custom"]
---

## My Workflow

...
```

---

## Conclusion

**Two-layer architecture:**
- ✅ Reduces fixed context cost by 75%
- ✅ Aligns with product value proposition
- ✅ Maintains agent guidance effectiveness
- ✅ Provides detailed workflows when needed
- ✅ Backward compatible

**Key insight:** The value of agent rules isn't in always injecting everything—it's in providing the right guidance at the right time.

This is **practical AI engineering**, not rule bloat.
