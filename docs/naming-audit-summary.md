# Naming Audit: Persistent Task Context vs Total Conversation Context

## Problem Statement

Previous naming suggested we store "full conversation context" or "total context", which is misleading.

**Reality:**
- We store **compressed task checkpoints** (~100 tokens)
- We do NOT store full conversation transcripts

**Risk:**
- Users expect full conversation replay
- Over-promising capabilities
- Confusion about what gets persisted

---

## Solution

Replace ambiguous terms with precise language:

### Naming Changes

| Before | After | Reason |
|--------|-------|--------|
| "Context persistence" | "Persistent task context" | More specific |
| "Session context" | "Task checkpoint" | Clearer scope |
| "Context recovery" | "Checkpoint recovery" or "Task recovery" | Precise mechanism |
| "Session recovery" | "Task recovery" | Clearer intent |
| "Full context" | "Compressed checkpoint" | Honest size |
| "Conversation context" | "Task state" | Accurate content |

---

## Files Updated

### Core Documentation

1. **README.md**
   - Section title: "Context Persistence" → "Persistent Task Context"
   - Added "What is NOT persisted" section
   - "Session context" → "Task checkpoint"
   - "Context recovery" → "Checkpoint recovery"

2. **tools/devctx/README.md**
   - Table: "Session state management" → "Task checkpoint management"
   - Description: Added "not full conversation" clarification

3. **package.json**
   - Description: Added "task checkpoint persistence"

### Deep Documentation

4. **docs/how-it-works.md**
   - Section title: "Context Persistence" → "Persistent Task Context"
   - Added comprehensive "What Does NOT Get Persisted" section
   - Schema comments clarified
   - "Context not persisting" → "Task checkpoints not persisting"

5. **docs/smart-turn-entry-point.md**
   - "Context Recovery" → "Task Checkpoint Recovery"
   - "Session Recovery" → "Task Recovery"
   - Added "What gets recovered" vs "What does NOT"
   - Table: "Context recovery" → "Checkpoint recovery"

6. **docs/client-compatibility.md**
   - Table header: "Session Persistence" → "Task Checkpoint Persistence"
   - Added clarification: what gets/doesn't get persisted

7. **docs/verification/benchmark.md**
   - "Full conversation context" → "Task checkpoint state"
   - "Full conversation state" → "Compressed checkpoint state"

### Agent Rules

8. **tools/devctx/agent-rules/base.md**
   - "Session context" → "Task checkpoint"
   - "Session recovery" → "Task recovery"

9. **tools/devctx/agent-rules/compact.md**
   - Section: "Context Recovery" → "Task Checkpoint Recovery"
   - Added clarification about checkpoint content

10. **tools/devctx/agent-rules/core.md**
    - Section: "Context Recovery (Session Persistence)" → "Task Checkpoint Recovery"

11. **tools/devctx/agent-rules/README.md**
    - "Context recovery" → "Task checkpoint recovery"

12. **tools/devctx/agent-rules/profiles/*.md**
    - "Context recovery" → "Checkpoint recovery"
    - "Session context" → "Task state"

13. **tools/devctx/agent-rules/profiles-compact/*.mdc**
    - "Recovers: Previous X context" → "Recovers checkpoint: Previous X state"

### Generated Rules

14. **.cursor/rules/devctx.mdc**
    - "Context recovery" → "Task checkpoint recovery"
    - Added checkpoint clarification

15. **AGENTS.md**
    - "Context recovery" → "Task checkpoint recovery"
    - Added checkpoint clarification

16. **CLAUDE.md**
    - "Context recovery" → "Task checkpoint recovery"
    - Added checkpoint clarification

17. **tools/devctx/scripts/init-clients.js**
    - agentRuleBody: "session context" → "task checkpoint"

### Other

18. **CHANGELOG.md**
    - "Context recovery, session persistence" → "Task checkpoint recovery, state persistence"
    - Added new section documenting naming changes

19. **docs/agent-rules/design-rationale.md**
    - "Context recovery" → "Checkpoint recovery"

---

## New Documentation

**docs/persistent-task-context.md** (new file, 348 lines)

Comprehensive guide explaining:
- The distinction between task context vs conversation context
- What gets stored (checkpoints) vs what doesn't (transcripts)
- Why this matters (accurate expectations)
- Technical implementation details
- Recovery mechanism
- Comparison table
- Naming guidelines
- User-facing communication examples

---

## Key Clarifications Added

### 1. What Gets Persisted

✅ Task goal and objective  
✅ Current status (in_progress, blocked, completed)  
✅ Key decisions made  
✅ Blockers and unresolved questions  
✅ Next step to take  
✅ Files touched  
✅ Token metrics per tool call

**Size:** ~100 tokens per checkpoint

### 2. What Does NOT Get Persisted

❌ Full conversation transcript  
❌ Complete message history  
❌ All user prompts verbatim  
❌ All agent responses  
❌ Agent reasoning traces  
❌ Intermediate thoughts

**Why not:** Would defeat purpose (token reduction)

### 3. Recovery Mechanism

**What recovers:**
- Task goal: "Fix auth bug in validateToken"
- Current focus: "src/auth.js:validateToken"
- Decisions: ["Using JWT", "Token expires 1h"]
- Next step: "Check token expiration logic"

**What does NOT recover:**
- Full conversation history
- All previous messages
- Complete reasoning traces

---

## Conceptual Framework

### Persistent Task Context (What We Provide)

**Definition:** Compressed checkpoint system that stores task state for recovery.

**Content:**
- Goal, status, decisions, blockers, next step
- ~100 tokens per checkpoint
- Sufficient for task continuity

**Use case:** Resume task after interruption without re-reading files

**Example:**
```
Checkpoint: {
  "objective": "Fix TypeError in loginHandler",
  "currentFocus": "src/auth.js:validateToken",
  "nextStep": "Check token expiration logic"
}
```

---

### Total Conversation Context (What We Don't Provide)

**Definition:** Complete conversation history with full message transcript.

**Content:**
- All user prompts
- All agent responses
- All reasoning traces
- 10K-100K tokens per session

**Use case:** Replay entire conversation

**Why we don't provide:**
- Defeats purpose (token reduction)
- Privacy/security concerns
- Client-level feature, not MCP
- Not needed for task recovery

---

## Impact

### Before (Ambiguous)

> "Provides context persistence across sessions"

**User expectation:**
- Full conversation replay
- Automatic recovery
- Complete history

**Reality:**
- Compressed checkpoints
- Opt-in recovery
- Task state only

**Gap:** Over-promising

---

### After (Precise)

> "Provides persistent task checkpoints that enable recovery of task state (goal, status, decisions, next step) across sessions"

**User expectation:**
- Task state recovery
- Checkpoint-based
- Compressed summaries

**Reality:**
- Compressed checkpoints
- Opt-in recovery
- Task state only

**Gap:** None (accurate)

---

## Verification

### Check Naming Consistency

```bash
# Should find "task checkpoint" or "persistent task context"
rg "task checkpoint|persistent task context" -i

# Should NOT find ambiguous terms
rg "total conversation context|full conversation|entire conversation" -i
# → Should only appear in "What we don't do" sections
```

### Check Documentation Clarity

All key docs now include:
- ✅ "What gets persisted" section
- ✅ "What does NOT get persisted" section
- ✅ Clear distinction between checkpoint and conversation
- ✅ Honest about capabilities and limitations

---

## User-Facing Guidelines

### ✅ Good Communication

"Recovers task checkpoint (goal, status, decisions)"  
"Persists compressed task state (~100 tokens)"  
"Enables task recovery after interruption"  
"Stores task checkpoints, not full conversation"

### ❌ Bad Communication

"Recovers full conversation context"  
"Persists entire conversation history"  
"Replays all previous messages"  
"Total context recovery"

---

## Conclusion

**The naming audit achieves:**

1. **Conceptual clarity** - Clear distinction between checkpoint and conversation
2. **Accurate expectations** - Users know what they get
3. **Honest value** - Don't over-promise
4. **Maintained value** - Checkpoint recovery is still valuable

**Key message:**
> "Persistent task checkpoints enable task recovery without the overhead of storing full conversation transcripts. This maintains token efficiency while providing sufficient context for task continuity."

**This is practical engineering**, not magic.
