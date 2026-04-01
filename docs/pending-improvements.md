# Pending Improvements

## High Priority

### 1. Task Complexity Detection (Fast Path) ✅ COMPLETED

**Problem:** System assumes all tasks are complex, runs full preflight even for simple changes.

**Example:** "Move hook from UI to view-model" triggers full context analysis when it only needs 2 file reads + 2 edits.

**Solution:**
```javascript
const isSimpleTask = (prompt) => {
  const simplePatterns = [
    /^(move|rename|delete|add|remove|fix|update)\s+\w+\s+(to|from|in)\s+\w+$/i,
    /^(change|modify|edit)\s+\w+$/i,
    /^\w+\s+(one|single|this)\s+\w+$/i,
  ];
  return simplePatterns.some((pattern) => pattern.test(prompt));
};
```

**Fast path:**
- Skip preflight (no smart_context/smart_search)
- Skip session isolation
- Skip checkpoint enforcement
- Only track basic metrics

**Impact:** Simple tasks 3-5x faster (2-3s → <500ms)

**Files to modify:**
- `src/orchestration/base-orchestrator.js` - Add `isSimpleTask` detection
- `src/orchestration/policy/event-policy.js` - Add `skipPreflight` flag support
- Tests for simple task detection

**Estimated effort:** 2-3 hours

---

### 2. Streaming Progress (Real-Time Visibility) ✅ COMPLETED

**Problem:** Black box execution - users can't see what agent is doing until it finishes.

**Solution:**
```javascript
// In smart_context, smart_read, smart_search
yield { type: 'progress', step: 'reading', file: 'src/auth.js', tokens: 1200 };
yield { type: 'progress', step: 'compressing', ratio: '12:1', savedTokens: 1100 };
yield { type: 'result', content: '...', metrics: { ... } };
```

**Requirements:**
- MCP SDK streaming support
- Progress events before final result
- Agents show: "Reading src/auth.js (1200 tokens) → compressed to 100 tokens (12:1)"

**Impact:** Users see exploration strategy in real-time, can validate agent's approach.

**Files to modify:**
- All tools: smart_read, smart_search, smart_context, smart_shell
- Add streaming option
- Emit progress events at key points

**Status:** ✅ Implemented in v1.7.2
- Added optional `progress` parameter to all major tools
- Emits MCP `notifications/progress` events
- Throttled to 100ms intervals
- 4 unit tests passing

---

## Medium Priority

### 3. Context Scoring

**Problem:** Users don't know if agent had sufficient context or missed key files.

**Solution:**
```javascript
{
  contextScore: {
    filesConsidered: 12,
    filesRelevant: 8,
    relevanceRatio: 0.67,
    coverageEstimate: "high" // from graphCoverage + confidence.level
  }
}
```

**Implementation:**
- Derive from existing `graphCoverage` and `confidence.level`
- Track files opened vs files actually used in edits
- Surface in final metrics

**Impact:** Users know if agent had sufficient context.

**Estimated effort:** 4-6 hours

---

## Status

- ✅ **Inline Metrics Display** (v1.7.2) - Implemented
- ✅ **Top Tools Visibility** (v1.7.2) - Implemented
- ✅ **Task Complexity Detection** (v1.7.2) - Implemented
- ✅ **Streaming Progress** (v1.7.2) - Implemented
- ⏳ **Context Scoring** - Next priority

## User Feedback Addressed

> "Caja negra: No pude ver el proceso paso a paso"
- ✅ Solved: Streaming progress + metricsDisplay

> "Métricas ocultas: No hubo feedback sobre tokens consumidos"
- ✅ Solved: metricsDisplay + topTools

> "Overkill para refactor pequeño: gastó más tiempo en entender el contexto"
- ✅ Solved: Task complexity detection with fast path

> "el valor práctico de smart_context y smart_read se notó durante el trabajo, pero no quedó tan visible"
- ✅ Solved: topTools + metricsDisplay
