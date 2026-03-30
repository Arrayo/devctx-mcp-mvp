# Adoption Improvements Phase 2

## Overview

This document describes Phase 2 of adoption improvements, building on Phase 1 (steps 1-4 completed previously).

**Phase 2 Improvements:**
1. Quick Start guide by client in README
2. Further matization of quality claims
3. Concrete feedback examples
4. Official forcing prompts with ultra-short variant

## 1. Quick Start: Which Client Should I Use?

### Problem
Users had to read detailed compatibility docs to understand which client to use. No quick guidance in main README.

### Solution
Added compact comparison table at top of README with:
- 4 main clients (Cursor, Claude Desktop, Codex, Qwen)
- Automaticity level per client
- Key feature per client
- Clear definition of what "automaticity" means (and doesn't mean)
- Recommendation: Start with Cursor

### Impact
- Users can decide in <1 minute which client to use
- Expectations managed upfront (no automatic prompt interception)
- Links to detailed docs for more info

---

## 2. Further Quality Claim Matization

### Changes Made

**Before:**
```markdown
- Responses are often faster and more context-efficient
```

**After:**
```markdown
- Token usage drops 85-90% (proven, measured)
- Responses often faster due to less data to process (inferred from token savings)
```

**Before:**
```markdown
**Honest claim:** We provide better context, which can improve response quality...
Token savings are well-documented (90%); quality improvement is inferred but not explicitly measured.
```

**After:**
```markdown
**Honest claim:** We provide better context (more relevant, less noise), which can help agents respond more efficiently...

**What's proven:** 90% token savings (measured across 3,666 operations).
**What's inferred:** Quality improvement (better input → potentially better output, but not explicitly measured).
**What we don't control:** Agent correctness, task success, response accuracy.
```

### Impact
- Clearer separation of proven vs inferred
- More conservative language ("can help" vs "can improve")
- Explicit acknowledgment of what we don't control
- Increased credibility through honesty

---

## 3. Concrete Feedback Examples

### Added to `docs/agent-rules/feedback-when-not-used.md`

Three complete examples showing:

**Example 1: Task Too Simple**
- User asks for imports in a file
- Agent uses Read (no feedback)
- Correct: task is trivial

**Example 2: Index Not Built**
- User asks to find permission validation
- Agent uses Grep, adds feedback: "index not built"
- Shows exact output format
- User learns to build index

**Example 3: Already Had Context**
- User asks to fix bug
- Agent already has context from previous turn
- Adds feedback explaining why devctx wasn't needed
- Shows forcing prompt

### Impact
- Developers can see exactly what feedback looks like
- Clear examples of when feedback should/shouldn't appear
- Demonstrates the forcing prompt in action

---

## 4. Official Forcing Prompts

### Added Two Variants

**Complete workflow prompt:**
```
Use smart-context-mcp for this task:
1. Start with smart_turn(start, userPrompt, ensureSession=true) to recover context
2. Use smart_context or smart_search before reading files
3. Use smart_read(outline|signatures|symbol) instead of full reads
4. Close with smart_turn(end) when you reach a milestone
```

**Ultra-short prompt (copy-paste ready):**
```
Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)
```

### Where Added

1. **README - Agent Rules section** (after Feedback When Not Used)
   - New section: "How to Force devctx Usage"
   - When to use
   - Both prompt variants
   - Example usage showing before/after

2. **README - Troubleshooting section**
   - Added ultra-short prompt
   - Link to full section
   - Added "Index built?" check

### Impact
- Users have standardized way to force devctx usage
- Ultra-short variant is easy to copy-paste
- Visible in two key places (agent rules + troubleshooting)
- Reinforces recommended workflow

---

## Files Changed

1. **README.md**
   - Added "Quick Start: Which Client Should I Use?" table
   - Matized quality claims in "Best case scenario"
   - Expanded "Honest claim" with proven/inferred/don't control
   - Added "How to Force devctx Usage" section
   - Enhanced Troubleshooting with forcing prompt

2. **docs/agent-rules/feedback-when-not-used.md**
   - Added "3 Concrete Examples of Expected Final Output"
   - Shows exact output format for each scenario

---

## Alignment with Phase 1

**Phase 1 (Completed):**
1. ✅ Reduce base rule (42 → 14 lines)
2. ✅ Add feedback when devctx not used
3. ✅ Make preflight (build_index) visible
4. ✅ Matize quality claim

**Phase 2 (This Document):**
1. ✅ Quick client guidance in README
2. ✅ Further quality claim matization
3. ✅ Concrete feedback examples
4. ✅ Official forcing prompts

**Still Pending:**
- Metrics of real adoption (complex, separate task)

---

## User Journey Improvement

### Before Phase 2

1. User installs MCP
2. Agent may or may not use devctx
3. If not used, feedback says "use devctx next time" but no clear prompt
4. User doesn't know which client is best
5. Quality claims slightly aggressive

### After Phase 2

1. User sees quick client guide → picks Cursor
2. User installs, builds index
3. Agent may or may not use devctx
4. If not used, feedback shows exact reason + forcing prompt
5. User copies ultra-short prompt: `Use devctx: smart_turn(start) → ...`
6. Agent uses devctx
7. Quality claims are conservative and honest

---

## Next Steps

**Completed in Phase 2:**
- ✅ Client quick guidance
- ✅ Quality claim matization
- ✅ Feedback examples
- ✅ Forcing prompts

**Remaining from original 6 prompts:**
- 🔄 Metrics of real adoption (Prompt 5) - requires implementation

**Future considerations:**
- Track feedback frequency (how often "devctx not used" appears)
- Track forcing prompt usage (if possible)
- Measure adoption by workflow type
- A/B test different forcing prompt variants
