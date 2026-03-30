# Adoption Metrics Design

## Problem

Current metrics measure **compression efficiency** (tokens saved per tool), but not **adoption rate** (how often agents actually use devctx in non-trivial tasks).

**What we measure now:**
- ✅ Token savings per tool
- ✅ Operations count per tool
- ✅ Compression ratios
- ✅ Workflow-level savings (when tracked)

**What we DON'T measure:**
- ❌ % of non-trivial tasks where devctx was used
- ❌ % of non-trivial tasks where devctx was ignored
- ❌ Reasons for non-usage
- ❌ Adoption by workflow type
- ❌ Feedback frequency

## Solution

Add **adoption metrics** to complement compression metrics.

### New Table: `adoption_events`

```sql
CREATE TABLE IF NOT EXISTS adoption_events (
  adoption_id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  turn_id TEXT,
  task_type TEXT,           -- 'debugging', 'code-review', 'refactoring', 'testing', 'architecture', 'other', 'trivial'
  task_complexity TEXT,     -- 'trivial', 'simple', 'moderate', 'complex'
  devctx_used BOOLEAN,      -- 1 if any devctx tool used, 0 if only native tools
  tools_used_json TEXT,     -- ['smart_read', 'smart_search'] or ['Read', 'Grep']
  feedback_shown BOOLEAN,   -- 1 if feedback was shown, 0 if not
  feedback_reason TEXT,     -- 'task too simple', 'MCP unavailable', 'index not built', etc.
  user_forced BOOLEAN,      -- 1 if user used forcing prompt, 0 if agent decided
  metadata_json TEXT,       -- Additional context
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_adoption_events_session
  ON adoption_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adoption_events_type
  ON adoption_events(task_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adoption_events_used
  ON adoption_events(devctx_used, task_complexity, created_at DESC);
```

### How It Works

**Automatic tracking (when possible):**
- When `smart_turn(end)` is called → record `devctx_used = 1`
- When feedback is shown → record `feedback_shown = 1` + `feedback_reason`
- When forcing prompt is detected → record `user_forced = 1`

**Manual tracking (requires agent cooperation):**
- Agent classifies task type and complexity
- Agent reports whether devctx was used
- Agent reports feedback shown

**Limitations:**
- ❌ Can't detect non-usage if agent doesn't report it
- ❌ Can't force agent to track adoption
- ❌ Depends on agent following rules
- ✅ Can track when devctx IS used (via tool calls)
- ✅ Can infer non-usage from metrics (no tool calls in session)

### New Metrics Report

```bash
npm run report:adoption
```

**Output:**

```
devctx adoption report

Period:       Last 30 days
Total tasks:  156 (excluding trivial)

Adoption Rate:
- Used devctx:     89 tasks (57%)
- Native tools:    67 tasks (43%)

By Task Type:
- Debugging:       23/30 (77%)
- Code Review:     18/25 (72%)
- Refactoring:     15/28 (54%)
- Testing:         20/35 (57%)
- Architecture:    13/38 (34%)

By Complexity:
- Complex:         56/68 (82%)
- Moderate:        25/52 (48%)
- Simple:          8/36 (22%)

Feedback Shown:    45 times (67% of non-usage)

Top Reasons for Non-Usage:
1. already had sufficient context (28 times, 42%)
2. task too simple (12 times, 18%)
3. index not built (8 times, 12%)
4. MCP unavailable (5 times, 7%)
5. native tool more direct (14 times, 21%)

Forcing Prompts Used: 12 times (18% of non-usage)
- After forcing: 11/12 used devctx (92% success)

Recommendation:
- Build index to improve architecture adoption (34% → target 60%)
- Feedback working well (67% of non-usage gets feedback)
- Forcing prompts effective (92% success rate)
```

## Implementation Plan

### Phase 1: Data Model (Minimal)

1. Add `adoption_events` table to schema (migration v6)
2. Add `recordAdoptionEvent()` function
3. Add `getAdoptionStats()` function for reporting

### Phase 2: Tracking Points (Where Possible)

**Automatic (high confidence):**
- Track in `smart_turn(end)` → `devctx_used = 1`
- Track in `smart_metrics` → count devctx vs native tools
- Infer from session: if no devctx tools called → `devctx_used = 0`

**Semi-automatic (requires agent cooperation):**
- Agent calls new tool: `report_adoption({ taskType, complexity, devctxUsed, feedbackShown, feedbackReason })`
- Or: Agent includes adoption metadata in `smart_turn(end)`

**Manual (user-initiated):**
- User runs: `npm run report:adoption`
- Analyzes existing metrics + adoption events

### Phase 3: Reporting

1. Create `scripts/report-adoption.js`
2. Add adoption stats to `smart_metrics` output
3. Add adoption section to `README.md`

## What We Can Measure (Realistically)

### High Confidence (Automatic)

✅ **devctx tool usage count** (from metrics_events)
- How many times each tool was called
- Which sessions used devctx tools
- Token savings per session

✅ **Sessions with devctx usage** (from metrics_events)
- Sessions with at least 1 devctx tool call
- Sessions with 0 devctx tool calls

✅ **Workflow completion** (from workflow_metrics)
- Workflows that completed with devctx tools
- Token savings per workflow type

### Medium Confidence (Inferred)

⚠️ **Task complexity** (inferred from tool usage)
- Multiple file reads → complex
- Single file read → simple
- Search + read + shell → complex

⚠️ **Non-usage in complex tasks** (inferred)
- Session with many operations but no devctx tools
- Likely indicates non-adoption in complex task

### Low Confidence (Requires Agent Cooperation)

❌ **Feedback frequency** (agent must report)
- Can't detect if agent showed feedback unless agent tracks it
- Would require agent to call tracking function

❌ **Feedback reasons** (agent must report)
- Can't know why agent didn't use devctx unless agent reports it

❌ **Forcing prompt usage** (can't detect)
- Can't distinguish user forcing vs agent deciding
- Would require prompt analysis (not feasible)

## Honest Implementation

Given the limitations, here's what we CAN implement honestly:

### Automatic Metrics (No Agent Cooperation Needed)

```javascript
// Calculate from existing metrics_events
const adoptionStats = {
  totalSessions: 156,
  sessionsWithDevctx: 89,      // Sessions with at least 1 devctx tool call
  sessionsWithoutDevctx: 67,   // Sessions with 0 devctx tool calls
  adoptionRate: 57,            // 89/156 = 57%
  
  byTool: {
    smart_read: 234,
    smart_search: 156,
    smart_context: 89,
    // ... etc
  },
  
  avgToolsPerSession: 2.8,     // When devctx is used
  avgTokenSavings: 87.5,       // When devctx is used
};
```

### Inferred Metrics (Heuristics)

```javascript
// Infer task complexity from operation patterns
const inferComplexity = (session) => {
  const ops = session.operations.length;
  const files = session.filesAccessed.length;
  
  if (ops <= 2 && files <= 1) return 'trivial';
  if (ops <= 5 && files <= 3) return 'simple';
  if (ops <= 15 && files <= 10) return 'moderate';
  return 'complex';
};

// Infer non-usage in complex tasks
const complexTasksWithoutDevctx = sessions
  .filter(s => inferComplexity(s) === 'complex')
  .filter(s => s.devctxToolCount === 0);
```

### Manual Tracking (Opt-in)

```javascript
// Agent can optionally call this at end of task
smart_turn({
  phase: 'end',
  event: 'task_complete',
  metadata: {
    taskType: 'debugging',
    complexity: 'complex',
    devctxUsed: true,
    feedbackShown: false,
  }
});
```

## Recommended Implementation

### Step 1: Enhance Existing Metrics (No Schema Changes)

Add adoption analysis to `smart_metrics` output:

```javascript
// In smart-metrics.js
const analyzeAdoption = (entries) => {
  const sessions = groupBySession(entries);
  
  return {
    totalSessions: sessions.length,
    sessionsWithDevctx: sessions.filter(s => s.hasDevctxTools).length,
    adoptionRate: calculateRate(sessions),
    byComplexity: groupByInferredComplexity(sessions),
    avgToolsPerSession: calculateAverage(sessions),
  };
};
```

### Step 2: Add Adoption Section to Report

```bash
npm run report:metrics
```

**New output section:**

```
Adoption Analysis (Inferred):
- Sessions analyzed:     156
- Sessions with devctx:  89 (57%)
- Sessions without:      67 (43%)

By Inferred Complexity:
- Complex (10+ ops):     56/68 used devctx (82%)
- Moderate (5-10 ops):   25/52 used devctx (48%)
- Simple (2-5 ops):      8/36 used devctx (22%)

Note: Complexity inferred from operation count. Actual task complexity may vary.
```

### Step 3: Document Limitations

Add to README:

```markdown
### Adoption Metrics (Experimental)

**What we measure:**
- ✅ Sessions with devctx tool usage (automatic)
- ✅ Inferred task complexity (heuristic: operation count)
- ✅ Adoption rate by complexity level

**What we DON'T measure:**
- ❌ Feedback frequency (requires agent cooperation)
- ❌ Feedback reasons (requires agent reporting)
- ❌ Forcing prompt usage (can't detect)

**Limitations:**
- Complexity is inferred, not actual
- Can't detect non-usage unless agent reports it
- Depends on agent following workflows
```

## Why This Approach

### 1. No Agent Cooperation Required

We can measure adoption using **only existing data** (metrics_events):
- Count sessions with devctx tools
- Count sessions without devctx tools
- Infer complexity from operation patterns

### 2. Honest About Limitations

We explicitly state:
- What's automatic (tool usage counting)
- What's inferred (complexity heuristics)
- What's not measurable (feedback, forcing prompts)

### 3. Actionable Insights

Even with limitations, we can answer:
- Is devctx being used? (yes/no, %)
- Is it used more in complex tasks? (yes/no, %)
- What's the adoption trend? (increasing/decreasing)

### 4. No Breaking Changes

Implementation uses existing data structures, no schema changes needed for Phase 1.

## Implementation Files

### New Files
1. `src/analytics/adoption.js` - Adoption analysis functions
2. `scripts/report-adoption.js` - Adoption report CLI
3. `docs/adoption-metrics-design.md` - This document

### Modified Files
1. `src/tools/smart-metrics.js` - Add adoption section to output
2. `scripts/report-metrics.js` - Include adoption stats
3. `README.md` - Document adoption metrics with limitations
4. `package.json` - Add `report:adoption` script

## Next Steps

1. ✅ Design adoption metrics (this document)
2. 🔄 Implement adoption analysis (next)
3. 🔄 Add to metrics report (next)
4. 🔄 Document in README (next)
5. 🔄 Test and verify (next)

## References

- Current metrics: `src/metrics.js`
- Workflow metrics: `src/storage/sqlite.js` (workflow_metrics table)
- Metrics report: `scripts/report-metrics.js`
- Smart metrics tool: `src/tools/smart-metrics.js`
