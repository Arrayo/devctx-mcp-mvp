# Adoption Metrics Design

## Goal

Measure **real MCP adoption** in non-trivial tasks, not just compression efficiency.

## Core Metric

**Adoption Rate** = (Tasks with devctx usage) / (Total non-trivial tasks) × 100%

## What Counts as "Non-Trivial Task"

A task is non-trivial if it meets ANY of these criteria:

1. **Multiple tool calls** (≥5 total operations)
2. **Large file reads** (any file >500 lines read with native Read)
3. **Multiple file reads** (≥3 files read)
4. **Repeated searches** (≥2 Grep/search operations)
5. **Workflow classification** (debugging, review, refactor, testing, architecture)

## What Counts as "devctx Usage"

A task has devctx usage if it used ANY of these tools:

- `smart_turn`
- `smart_context`
- `smart_search`
- `smart_read`
- `smart_shell`
- `smart_read_batch`

## Data Structure

### New Table: `adoption_metrics`

```sql
CREATE TABLE IF NOT EXISTS adoption_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  workflow_type TEXT,
  is_non_trivial BOOLEAN NOT NULL,
  used_devctx BOOLEAN NOT NULL,
  devctx_tools_used TEXT, -- JSON array of tool names
  native_tools_used TEXT, -- JSON array of native tool names
  total_operations INTEGER,
  large_files_read INTEGER,
  files_read_count INTEGER,
  search_operations INTEGER,
  timestamp TEXT NOT NULL,
  task_description TEXT
);
```

### Metrics to Track

1. **Overall Adoption Rate**
   - % of non-trivial tasks with devctx usage

2. **Adoption by Workflow**
   - Debugging: X% adoption
   - Code Review: Y% adoption
   - etc.

3. **Non-Usage Reasons** (inferred)
   - Task too simple (not non-trivial)
   - No index available
   - Rules not active
   - Agent preference for native

4. **Tool Mix**
   - Which devctx tools are most used
   - Which native tools are still preferred

## Implementation Plan

### Phase 1: Data Collection (Minimal)

1. Add `recordTaskMetrics()` function to `workflow-tracker.js`
2. Call it at end of each `smart_turn(end)` or session
3. Analyze session events to classify task
4. Store in `adoption_metrics` table

### Phase 2: Reporting

1. Add `npm run report:adoption` script
2. Show:
   - Overall adoption rate
   - Adoption by workflow
   - Top non-usage reasons
   - Tool usage breakdown

### Phase 3: Documentation

1. Update README with adoption metrics
2. Add to workflow-metrics.md
3. Show in package.json description

## Example Report Output

```
Adoption Metrics (Last 30 Days)
================================

Overall Adoption: 73% (45/62 non-trivial tasks)

By Workflow:
- Debugging:     85% (17/20)
- Code Review:   70% (14/20)
- Refactoring:   65% (13/20)
- Testing:       60% (12/20)
- Architecture:  75% (15/20)

Non-Usage Breakdown:
- Task too simple:     8 tasks (47%)
- No index:            5 tasks (29%)
- Native preferred:    4 tasks (24%)

Top devctx Tools:
1. smart_context:  35 uses
2. smart_read:     32 uses
3. smart_search:   28 uses
4. smart_turn:     45 uses
```

## Limitations

- **Agent behavior dependent**: Can't force adoption
- **Client dependent**: Some clients expose MCP better than others
- **Task classification**: Heuristic-based, not perfect
- **Session boundaries**: May miss some tasks if not using smart_turn

## Success Criteria

- Adoption rate >70% for non-trivial tasks
- All workflows >60% adoption
- Clear visibility into why devctx isn't used
- Data-driven improvements to rules and onboarding
