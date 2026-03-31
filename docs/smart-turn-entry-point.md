# `smart_turn(start)` as Entry Point

## The Recommended Pattern

For **non-trivial tasks**, the optimal flow is:

```javascript
smart_turn(start, userPrompt, ensureSession=true)
→ smart_context(...) or smart_search(intent=...)
→ smart_read(mode=outline|signatures|symbol)
→ [work]
→ smart_shell('npm test')
→ smart_turn(end, event=milestone|blocker|task_complete)
```

This is **not automatic**—it's the **recommended routine** that agents should follow based on rules.

---

## Why Start with `smart_turn(start)`?

### 1. Task Checkpoint Recovery

**Without `smart_turn(start)`:**
```
You: "Continue fixing the auth bug"
Agent: "What auth bug? Let me search everything..."
→ Wastes time re-discovering task state
→ Wastes tokens reading files again
```

**With `smart_turn(start)`:**
```
You: "Continue fixing the auth bug"
Agent calls: smart_turn(start, userPrompt='Continue fixing auth bug', ensureSession=true)
MCP returns: {
  summary: {
    objective: "Debug authentication system",
    currentFocus: "src/auth.js:validateToken",
    decisions: ["Using JWT for auth", "Token expires in 1h"],
    nextStep: "Check token validation logic"
  }
}
Agent: "Ah, I was checking validateToken() in src/auth.js. Let me continue there."
→ Instant checkpoint recovery
→ Zero wasted tokens
```

**What gets recovered:**
- ✅ Task goal and objective
- ✅ Current focus (file/function being worked on)
- ✅ Key decisions made
- ✅ Next step to take
- ✅ Blockers and unresolved questions
- ✅ A lightweight refreshed context preview for the current prompt when the task is meaningful
- ✅ A normalized `recommendedPath` that tells clients which devctx tools should come next

**What does NOT get recovered:**
- ❌ Full conversation transcript
- ❌ All previous messages
- ❌ Agent's reasoning process
- ❌ User prompts verbatim

**Key insight:** This is a **task checkpoint**, not a conversation replay.

---

### 2. Task Classification

**`smart_turn(start)` determines:**
- Is this a **new task** or **continuation**?
- What's the **objective**?
- What's the **current status**?
- What's the **next step**?
- When `ensureSession=true`, whether the current prompt is mismatched enough to require a **fresh isolated session**
- What the **next recommended devctx actions** are for this exact start state

**Example:**
```javascript
// New task
smart_turn({ phase: 'start', userPrompt: 'Add JWT refresh tokens', ensureSession: true })
// → Returns: No previous session, creates new one

// Continuation
smart_turn({ phase: 'start', userPrompt: 'Continue with JWT refresh', ensureSession: true })
// → Returns: Previous session "Add JWT refresh tokens", status "in_progress"

// Task switch while another session is active
smart_turn({ phase: 'start', userPrompt: 'Document the wrapper onboarding flow', ensureSession: true })
// → Returns: Creates a fresh planning session instead of reusing unrelated task state
```

**Normalized guidance example:**
```javascript
smart_turn({ phase: 'start', prompt: 'Fix the token error in loginHandler', ensureSession: true })
// → Returns:
// {
//   recommendedPath: {
//     mode: 'guided_refresh',
//     nextTools: ['smart_read', 'smart_turn'],
//     steps: [
//       { tool: 'smart_read', instruction: 'Start from refreshedContext.topFiles...' },
//       { tool: 'smart_turn', instruction: 'Checkpoint with smart_turn(end, event=milestone)...' }
//     ]
//   }
// }
```

---

### 3. Repository Safety Check

**`smart_turn(start)` verifies:**
- `.devctx/state.sqlite` not tracked in git
- No sensitive files staged
- Repo is in clean state
- If repo safety fails, context mutations stay blocked across checkpoints, workflow tracking, and hook turn state
- `smart_turn(start/end)` now exposes `mutationSafety = { blocked, blockedBy, stateDbPath, recommendedActions, message }`
- `smart_turn(start/end)` now also exposes `recommendedPath = { mode, nextTools, steps, ... }`
- Claude hooks and headless wrappers can surface `recommendedActions` directly in injected context so the agent sees concrete remediation steps
- Claude hooks and headless wrappers can also surface `recommendedPath.nextTools` and the first recommended step directly in their injected context

**Example:**
```javascript
smart_turn({ phase: 'start', userPrompt: '...', ensureSession: true })
// → Returns: { repoSafety: { ok: false, issues: [".devctx/state.sqlite is tracked"] } }
// Agent: "Let me fix git hygiene first before proceeding"
```

---

### 4. Task Recovery After Interruption

**Scenario:** Agent crashes mid-task

**Without `smart_turn`:**
- Task state lost
- Must restart from scratch
- Wastes tokens re-reading everything

**With `smart_turn`:**
```javascript
// Before crash
smart_turn({ phase: 'end', event: 'milestone', summary: 'Fixed validateToken bug' })
// → Saves checkpoint: goal, status, decisions, next step

// After restart
smart_turn({ phase: 'start', userPrompt: 'Continue', ensureSession: true })
// → Returns checkpoint: "Last milestone: Fixed validateToken bug. Next: Add integration tests"
// Agent: "I'll continue with integration tests"
```

**What's preserved:**
- ✅ Task checkpoint (goal, status, next step)
- ✅ Key decisions and blockers
- ✅ Files touched

**What's NOT preserved:**
- ❌ Full conversation history
- ❌ All previous messages

---

### 5. Metrics Tracking

**`smart_turn` tracks:**
- Session duration
- Tools used
- Token savings
- Milestones reached
- Blockers encountered

**Example:**
```bash
npm run report:metrics
```

```
Session abc123:
  Objective: Debug authentication system
  Duration: 45 minutes
  Tools used: smart_search (3), smart_read (8), smart_shell (2)
  Token savings: 92% (200K → 16K)
  Milestones: 2 (Fixed validateToken, Added tests)
```

---

## When to Use `smart_turn(start)`

### ✅ Always Use For:

**Debugging:**
```javascript
smart_turn({ phase: 'start', userPrompt: 'TypeError in loginHandler', ensureSession: true })
```

**Code Review:**
```javascript
smart_turn({ phase: 'start', userPrompt: 'Review PR #123', ensureSession: true })
```

**Refactoring:**
```javascript
smart_turn({ phase: 'start', userPrompt: 'Extract auth logic to service', ensureSession: true })
```

**Testing:**
```javascript
smart_turn({ phase: 'start', userPrompt: 'Write tests for validateToken', ensureSession: true })
```

**Architecture Exploration:**
```javascript
smart_turn({ phase: 'start', userPrompt: 'Understand auth flow', ensureSession: true })
```

---

### ❌ Skip For:

**Trivial file read:**
```javascript
// Don't: smart_turn(start) → smart_read(...)
// Do: smart_read(...) directly
```

**Simple search:**
```javascript
// Don't: smart_turn(start) → smart_search(...)
// Do: smart_search(...) directly
```

**One-off questions:**
```
User: "What's the current Node version?"
// Don't: smart_turn(start) → smart_shell('node --version')
// Do: smart_shell('node --version') directly
```

---

## How It Works (Technical)

### Session Creation

```javascript
smart_turn({ 
  phase: 'start', 
  userPrompt: 'Fix login bug',
  ensureSession: true 
})
```

**MCP process:**
1. Check if session exists (by ID or similarity)
2. If exists: Load session, return context
3. If not: Create new session
4. Classify task (debug, review, refactor, test, explore)
5. Check repo safety
6. Return session + safety + metrics

**Returns:**
```json
{
  "session": {
    "id": "abc123",
    "objective": "Fix login bug",
    "status": "active",
    "filesAccessed": [],
    "decisions": [],
    "nextStep": "Find error location"
  },
  "repoSafety": { "ok": true },
  "metrics": { "sessionsActive": 1 }
}
```

---

### Session Checkpoint

```javascript
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed TypeError in loginHandler - null check added',
  nextStep: 'Consider adding integration tests'
})
```

**MCP process:**
1. Update session status
2. Record milestone
3. Persist to `.devctx/state.sqlite`
4. Return confirmation

**Returns:**
```json
{
  "session": {
    "id": "abc123",
    "status": "milestone",
    "lastEvent": "Fixed TypeError in loginHandler",
    "nextStep": "Consider adding integration tests"
  }
}
```

---

### Task Checkpoint Recovery

```javascript
smart_turn({ 
  phase: 'start',
  userPrompt: 'Continue',
  ensureSession: true
})
```

**MCP process:**
1. Find most recent session
2. Load checkpoint (objective, status, decisions, next step)
3. Return compressed summary (~100 tokens)

**Returns:**
```json
{
  "session": {
    "id": "abc123",
    "objective": "Fix login bug",
    "status": "milestone",
    "filesAccessed": ["src/routes/login.js", "src/auth.js"],
    "decisions": ["Bug in loginHandler", "Null check needed"],
    "nextStep": "Consider adding integration tests"
  },
  "repoSafety": { "ok": true }
}
```

---

## Real-World Impact

### Scenario 1: Interrupted Debugging

**Without `smart_turn`:**
```
Session 1:
  User: "Fix login bug"
  Agent: Searches, reads files, finds bug
  [Cursor crashes]

Session 2:
  User: "Continue"
  Agent: "Continue what? Let me search for login..."
  → Wastes 150K tokens re-reading everything
```

**With `smart_turn`:**
```
Session 1:
  User: "Fix login bug"
  Agent: smart_turn(start) → smart_search → smart_read → finds bug
  Agent: smart_turn(end, event=milestone, summary='Found bug in loginHandler')
  [Cursor crashes]

Session 2:
  User: "Continue"
  Agent: smart_turn(start, userPrompt='Continue', ensureSession=true)
  MCP: "Last milestone: Found bug in loginHandler. Next: Fix and test"
  Agent: "I'll fix the bug now"
  → Zero wasted tokens, instant recovery
```

**Savings:** 150K tokens

---

### Scenario 2: Multi-Day Refactor

**Without `smart_turn`:**
```
Day 1: Extract auth logic (no checkpoint)
Day 2: "What was I doing?" → Re-read everything
Day 3: "What was I doing?" → Re-read everything
→ Wastes 300K tokens over 3 days
```

**With `smart_turn`:**
```
Day 1: 
  smart_turn(start) → extract logic → smart_turn(end, summary='Extracted AuthService')
  
Day 2:
  smart_turn(start) → "Last: Extracted AuthService. Next: Update routes"
  → Update routes → smart_turn(end, summary='Updated 3 routes')
  
Day 3:
  smart_turn(start) → "Last: Updated routes. Next: Add tests"
  → Add tests → smart_turn(end, summary='Added 10 tests')
  
→ Zero wasted tokens, seamless continuity
```

**Savings:** 300K tokens

---

### Scenario 3: Code Review with Feedback

**Without `smart_turn`:**
```
Review 1: Agent reviews PR, provides feedback
[Author makes changes]
Review 2: Agent re-reads entire PR from scratch
→ Wastes 200K tokens
```

**With `smart_turn`:**
```
Review 1:
  smart_turn(start, userPrompt='Review PR #123')
  → Review → smart_turn(end, summary='Requested changes: Add null checks')

[Author makes changes]

Review 2:
  smart_turn(start, userPrompt='Re-review PR #123')
  MCP: "Last review: Requested null checks. Status: in_progress"
  Agent: "Let me check if null checks were added"
  → Reads only changed files
  
→ Saves 180K tokens (200K → 20K)
```

**Savings:** 180K tokens

---

## Agent Rules Integration

### Base Rule (Always Active)

```markdown
Recommended entry point for non-trivial tasks:

  smart_turn(start, userPrompt, ensureSession=true)
  → work with devctx tools
  → smart_turn(end, event=milestone|blocker|task_complete)

Why start with smart_turn?
- Recovers previous session context
- Enables session recovery if interrupted
- Tracks metrics for optimization

When to skip: Trivial tasks (read single file, simple search)
```

---

### Task Profiles (Conditional)

**Debugging:**
```markdown
1. smart_turn(start, userPrompt, ensureSession=true)
   → Recovers: "Last worked on auth, checked validateToken()"
2. smart_search(intent=debug, query=<error>)
...
7. smart_turn(end, event=milestone, summary='...', nextStep='...')
```

**Code Review:**
```markdown
1. smart_turn(start, userPrompt='Review PR #123', ensureSession=true)
   → Recovers: Previous review context
2. smart_context(diff=true)
...
7. smart_turn(end, event=milestone, summary='PR approved')
```

---

## Comparison: With vs Without `smart_turn`

| Aspect | Without `smart_turn` | With `smart_turn` |
|--------|---------------------|-------------------|
| **Checkpoint recovery** | Manual, error-prone | Automatic, reliable |
| **Interruption handling** | Task state lost | Checkpoint preserved |
| **Multi-day tasks** | Re-read everything | Instant recovery |
| **Token waste** | High (re-reading) | Low (recovery) |
| **Task tracking** | None | Checkpoints + metrics |
| **Metrics** | Limited | Comprehensive |
| **Repo safety** | Manual check | Automatic check |
| **Task classification** | Agent guesses | MCP determines |

---

## Best Practices

### 1. Always Checkpoint Milestones

```javascript
// After fixing bug
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed TypeError in loginHandler',
  nextStep: 'Add integration tests'
})
```

---

### 2. Use Descriptive Summaries

**Bad:**
```javascript
smart_turn({ phase: 'end', event: 'milestone', summary: 'Done' })
```

**Good:**
```javascript
smart_turn({ 
  phase: 'end',
  event: 'milestone',
  summary: 'Fixed TypeError in loginHandler - added null check for user object',
  nextStep: 'Add integration tests for auth flow'
})
```

---

### 3. Checkpoint Before Long Operations

```javascript
// Before running slow tests
smart_turn({ phase: 'end', event: 'checkpoint', summary: 'About to run full test suite' })
smart_shell({ command: 'npm test' }) // Takes 5 minutes
smart_turn({ phase: 'end', event: 'milestone', summary: 'All tests pass' })
```

---

### 4. Use `event` Types Appropriately

```javascript
// Milestone: Significant progress
smart_turn({ phase: 'end', event: 'milestone', summary: 'Feature complete' })

// Blocker: Stuck, need help
smart_turn({ phase: 'end', event: 'blocker', summary: 'Tests failing, unclear why' })

// Task complete: Done
smart_turn({ phase: 'end', event: 'task_complete', summary: 'Auth refactor complete' })
```

---

## Limitations & Honest Truth

### What `smart_turn` Can Do

✅ Recover previous session context  
✅ Classify task continuation vs new task  
✅ Check repository safety  
✅ Enable session recovery after interruption  
✅ Track metrics and milestones

### What `smart_turn` Cannot Do

❌ Force agent to use it (agent decides)  
❌ Intercept prompts automatically  
❌ Persist context across projects  
❌ Guarantee 100% recovery (depends on agent behavior)  
❌ Replace built-in tools entirely

---

## Conclusion

**`smart_turn(start)` is the recommended entry point for non-trivial tasks.**

**Why?**
- Recovers context (saves tokens)
- Enables recovery (saves time)
- Tracks metrics (improves optimization)
- Checks safety (prevents issues)

**When?**
- Debugging, review, refactor, testing, architecture
- Multi-step tasks
- Tasks requiring continuity

**When not?**
- Trivial tasks (read single file, simple search)
- One-off questions
- Quick diagnostics

**The pattern:**
```
smart_turn(start) → work → smart_turn(end)
```

**This is not automatic—it's the recommended routine that agents should follow based on rules.**

And it works.
