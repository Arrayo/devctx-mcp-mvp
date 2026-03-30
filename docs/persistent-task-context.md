# Persistent Task Context: Conceptual Clarity

## The Distinction

### Persistent Task Context ✅

**What we actually provide:**

A compressed checkpoint system that stores:
- **Task goal** - What you're trying to accomplish
- **Current status** - In progress, blocked, completed
- **Key decisions** - Important choices made
- **Blockers** - What's preventing progress
- **Next step** - What to do next
- **Files touched** - Which files are relevant
- **Metrics** - Token savings per tool call

**Size:** ~100 tokens per checkpoint

**Example checkpoint:**
```json
{
  "objective": "Fix TypeError in loginHandler",
  "status": "investigating",
  "currentFocus": "src/auth.js:validateToken",
  "decisions": ["Using JWT", "Token expires 1h"],
  "blockers": [],
  "nextStep": "Check token expiration logic",
  "touchedFiles": ["src/auth.js", "src/routes/login.js"]
}
```

---

### Total Conversation Context ❌

**What we do NOT provide:**

A complete conversation history that stores:
- ❌ Full message transcript
- ❌ All user prompts verbatim
- ❌ All agent responses
- ❌ Complete reasoning traces
- ❌ All intermediate thoughts

**Why not:**
- Would be 100x-1000x larger
- Would defeat the purpose (token reduction)
- Would require client-level integration
- Would be privacy/security concern

---

## Why This Matters

### 1. Accurate Expectations

**If we said "total conversation context":**
- Users expect full transcript
- Users expect automatic replay
- Users expect guaranteed recovery

**Reality:**
- We provide compressed checkpoints
- Recovery depends on agent calling `smart_turn`
- Not automatic, opt-in

### 2. Honest Value Proposition

**What we claim:**
> "Persistent task context enables recovery of task state across sessions"

**What this means:**
- ✅ Task goal preserved
- ✅ Key decisions preserved
- ✅ Next step preserved
- ❌ Full conversation NOT preserved

**What we DON'T claim:**
> ~~"Full conversation history across all sessions"~~

---

## Technical Implementation

### What Gets Stored

**SQLite tables:**

1. **`sessions`** - Task metadata
   ```sql
   CREATE TABLE sessions (
     session_id TEXT PRIMARY KEY,
     goal TEXT,                    -- Task objective
     status TEXT,                  -- in_progress, blocked, completed
     current_focus TEXT,           -- File/function being worked on
     why_blocked TEXT,             -- Blocker description
     next_step TEXT,               -- What to do next
     completed_count INTEGER,      -- Milestones reached
     decisions_count INTEGER,      -- Key decisions made
     touched_files_count INTEGER,  -- Files modified
     created_at TEXT,
     updated_at TEXT
   );
   ```

2. **`session_events`** - Checkpoints
   ```sql
   CREATE TABLE session_events (
     event_id INTEGER PRIMARY KEY,
     session_id TEXT,
     event_type TEXT,              -- milestone, blocker, task_complete
     payload_json TEXT,            -- Compressed summary
     token_cost INTEGER,           -- Tokens used for summary
     created_at TEXT
   );
   ```

3. **`metrics_events`** - Tool usage
   ```sql
   CREATE TABLE metrics_events (
     metric_id INTEGER PRIMARY KEY,
     tool TEXT,                    -- smart_read, smart_search, etc.
     session_id TEXT,
     raw_tokens INTEGER,
     compressed_tokens INTEGER,
     saved_tokens INTEGER,
     savings_pct REAL,
     created_at TEXT
   );
   ```

4. **`context_access`** - File patterns
   ```sql
   CREATE TABLE context_access (
     id INTEGER PRIMARY KEY,
     session_id TEXT,
     task TEXT,
     file_path TEXT,
     relevance REAL,
     timestamp TEXT
   );
   ```

---

### What Does NOT Get Stored

❌ **Full messages** - Only compressed summaries  
❌ **User prompts** - Only task goals  
❌ **Agent responses** - Only decisions and outcomes  
❌ **Reasoning traces** - Only key decisions  
❌ **File contents** - Only file paths accessed

---

## Recovery Mechanism

### How Recovery Works

1. **Agent calls `smart_turn(start)`**
   ```javascript
   smart_turn({ 
     phase: 'start', 
     userPrompt: 'Continue fixing auth bug',
     ensureSession: true 
   })
   ```

2. **MCP queries SQLite**
   ```sql
   SELECT * FROM sessions 
   WHERE goal LIKE '%auth%' OR goal LIKE '%bug%'
   ORDER BY updated_at DESC 
   LIMIT 1
   ```

3. **MCP loads checkpoint**
   ```sql
   SELECT payload_json FROM session_events
   WHERE session_id = ? AND event_type = 'milestone'
   ORDER BY created_at DESC
   LIMIT 1
   ```

4. **MCP returns compressed summary**
   ```json
   {
     "summary": {
       "objective": "Fix auth bug in validateToken",
       "status": "investigating",
       "currentFocus": "src/auth.js:validateToken",
       "nextStep": "Check token expiration logic"
     }
   }
   ```

5. **Agent continues from checkpoint**
   - No re-reading files
   - No re-discovering context
   - Instant recovery

---

### What Gets Recovered

✅ **Task state** - Goal, status, focus  
✅ **Key decisions** - Important choices  
✅ **Blockers** - What's preventing progress  
✅ **Next step** - What to do next  
✅ **File patterns** - Which files are relevant

### What Does NOT Get Recovered

❌ **Full conversation** - Only checkpoint  
❌ **All messages** - Only summaries  
❌ **Reasoning** - Only decisions  
❌ **Prompts** - Only goals

---

## Comparison

### Persistent Task Context (What We Do)

**Storage:** ~100 tokens per checkpoint  
**Content:** Goal, status, decisions, next step  
**Recovery:** Instant (single query)  
**Privacy:** Minimal (no full messages)  
**Overhead:** Minimal (SQLite writes)

**Use case:** Resume task after interruption

**Example:**
```
Before: "I was fixing auth bug in validateToken"
After:  "Continue fixing auth bug"
→ Agent recovers checkpoint, continues from last step
```

---

### Total Conversation Context (What We Don't Do)

**Storage:** 10K-100K tokens per session  
**Content:** Full transcript, all messages, all reasoning  
**Recovery:** Slow (large query)  
**Privacy:** High risk (full history)  
**Overhead:** High (large writes)

**Use case:** Replay entire conversation

**Example:**
```
Before: [100 messages of back-and-forth]
After:  "What did we discuss about auth?"
→ Agent replays full conversation history
```

**Why we don't do this:**
- Defeats purpose (token reduction)
- Privacy/security concerns
- Client-level feature, not MCP
- Not needed for task recovery

---

## Naming Guidelines

### ✅ Preferred Terms

- **Persistent task context**
- **Task checkpoint**
- **Session state**
- **Compressed summary**
- **Task recovery**

### ❌ Avoid Terms

- ~~Total conversation context~~
- ~~Full conversation history~~
- ~~Complete message transcript~~
- ~~Conversation replay~~
- ~~Full context recovery~~

### ⚠️ Clarify When Using

- **"Context persistence"** → Clarify: "task checkpoint persistence"
- **"Session recovery"** → Clarify: "task state recovery"
- **"Context recovery"** → Clarify: "checkpoint recovery"

---

## User-Facing Communication

### Good Examples

✅ "Recovers task checkpoint (goal, status, decisions)"  
✅ "Persists compressed task state (~100 tokens)"  
✅ "Enables task recovery after interruption"  
✅ "Stores task checkpoints, not full conversation"

### Bad Examples

❌ "Recovers full conversation context"  
❌ "Persists entire conversation history"  
❌ "Replays all previous messages"  
❌ "Total context recovery"

---

## Documentation Audit

### Files Updated

1. `README.md`
   - "Context Persistence" → "Persistent Task Context"
   - "Session context" → "Task checkpoint"
   - Added "What is NOT persisted" section

2. `tools/devctx/README.md`
   - "Session state management" → "Task checkpoint management"
   - Added clarification about compression

3. `docs/how-it-works.md`
   - "Context Persistence" → "Persistent Task Context"
   - Added "What Does NOT Get Persisted" section
   - Clarified checkpoint vs conversation

4. `docs/smart-turn-entry-point.md`
   - "Context Recovery" → "Task Checkpoint Recovery"
   - "Session Recovery" → "Task Recovery"
   - Added "What gets recovered" vs "What does NOT"

5. `docs/client-compatibility.md`
   - "Session Persistence" → "Task Checkpoint Persistence"
   - Added clarification table

6. `tools/devctx/agent-rules/*.md`
   - "Context recovery" → "Task checkpoint recovery"
   - "Session persistence" → "Task state persistence"

7. `package.json`
   - Updated description to mention "task checkpoint persistence"

---

## Key Messages

### For Users

> "smart-context-mcp provides **persistent task checkpoints** that enable recovery of task state (goal, status, decisions, next step) across sessions. This is not a full conversation history—it's a compressed task state (~100 tokens) that allows agents to resume work without re-reading files or re-discovering context."

### For Developers

> "The system stores compressed task checkpoints in SQLite, not full conversation transcripts. Each checkpoint contains goal, status, decisions, blockers, and next step. Recovery is triggered by `smart_turn(start)`, which queries the most recent checkpoint and returns it to the agent. This enables task continuity without the overhead of storing/retrieving full message history."

### For Documentation

> "**Persistent Task Context** refers to the system's ability to store and recover compressed task checkpoints (~100 tokens: goal, status, decisions, next step) across sessions. This is distinct from **Total Conversation Context**, which would store the full message transcript. We provide the former, not the latter, to maintain token efficiency while enabling task recovery."

---

## Conclusion

**The distinction matters because:**

1. **Accuracy** - We don't over-promise
2. **Clarity** - Users understand what they get
3. **Trust** - Honest about capabilities
4. **Value** - Checkpoint recovery is valuable without being full conversation replay

**The value proposition:**
- ✅ Task recovery without full conversation overhead
- ✅ Token efficiency maintained
- ✅ Privacy preserved (no full transcripts)
- ✅ Sufficient for task continuity

**This is practical engineering**, not magic.
