# Issue: Execution Visibility and Task Sizing

## User Feedback

> "Lo menos bueno:
> - ⚠️ Caja negra: No pude ver el proceso paso a paso (qué archivos leyó, qué decisiones tomó en cada paso)
> - ⚠️ Métricas ocultas: No hubo feedback sobre tiempo de ejecución, tokens consumidos, o número de lecturas/escrituras
> - ⚠️ Overkill para refactor pequeño: Para un cambio tan sencillo (mover un hook de UI a view-model), el agent gastó más tiempo en 'entender el contexto' que en hacer el cambio real"

## Problem Analysis

### 1. Black Box Execution (Caja Negra)

**Current state:**
- Agent uses devctx tools internally
- User only sees final result
- No visibility into: files read, search queries, decision points, compression ratios per file

**Impact:**
- User can't validate agent's understanding
- Can't intervene if agent is going down wrong path
- Can't learn from agent's exploration strategy

### 2. Hidden Metrics (Métricas Ocultas)

**Current state:**
- Metrics exist but only visible via `smart_metrics` or `npm run report:metrics`
- No real-time feedback during execution
- No per-operation timing or context scoring

**User wants:**
- Execution time per operation
- Files read/written count
- Tokens consumed (real-time)
- "Context score" - how much relevant code was actually considered

### 3. Task Sizing Mismatch (Overkill)

**Current state:**
- System treats all tasks as complex (always runs preflight, always builds full context)
- No fast path for simple changes
- Overhead: preflight (smart_context/smart_search) + session isolation + checkpoint

**Example:**
- Task: "Move hook from UI to view-model" (simple refactor)
- Agent: Runs full context analysis, reads architecture, plans multi-step refactor
- Reality: Could be done with 2 file reads + 2 edits

## Proposed Solutions

### Solution 1: Real-Time Execution Visibility (High Priority)

Add streaming progress updates to devctx tools:

```javascript
// In smart_context, smart_read, smart_search
yield { type: 'progress', step: 'reading', file: 'src/auth.js', tokens: 1200 };
yield { type: 'progress', step: 'compressing', ratio: '12:1', savedTokens: 1100 };
yield { type: 'result', content: '...', metrics: { ... } };
```

**Implementation:**
- Add `streaming: true` option to tools
- Emit progress events before final result
- Agents can show: "Reading src/auth.js (1200 tokens) → compressed to 100 tokens (12:1 ratio)"

**Benefit:** User sees what agent is doing in real-time, can validate exploration strategy.

### Solution 2: Inline Metrics Display (High Priority)

Enhance tool responses to include human-readable metrics summary:

```javascript
{
  content: "...",
  metrics: { ... },
  metricsDisplay: "✓ smart_context: 5 files, 12K→1.2K tokens (10:1), 450ms"
}
```

**Implementation:**
- Add `metricsDisplay` field to all tool responses
- Format: `✓ {tool}: {files} files, {raw}→{compressed} tokens ({ratio}), {time}ms`
- Agents naturally surface this in their responses

**Benefit:** Zero-effort visibility for users without requiring agents to format metrics.

### Solution 3: Task Complexity Detection (Medium Priority)

Add heuristic to detect simple vs complex tasks and skip overhead for simple ones:

```javascript
const isSimpleTask = (prompt) => {
  const simplePatterns = [
    /^(move|rename|delete|add|remove|fix|update)\s+\w+\s+(to|from|in)\s+\w+$/i,
    /^(change|modify|edit)\s+\w+$/i,
    /^\w+\s+(one|single|this)\s+\w+$/i,
  ];
  return simplePatterns.some((pattern) => pattern.test(prompt));
};

// In resolveManagedStart
if (isSimpleTask(prompt)) {
  return {
    skipPreflight: true,
    skipIsolation: true,
    mode: 'fast',
  };
}
```

**Fast path:**
- Skip preflight (no smart_context/smart_search)
- Skip session isolation
- Skip checkpoint enforcement
- Only track metrics

**Benefit:** Simple tasks complete 3-5x faster with minimal overhead.

### Solution 4: Context Scoring (Low Priority)

Add "context score" metric that measures relevance:

```javascript
{
  contextScore: {
    filesConsidered: 12,
    filesRelevant: 8,
    relevanceRatio: 0.67,
    coverageEstimate: "high" // based on graph coverage + search confidence
  }
}
```

**Implementation:**
- Derive from existing `graphCoverage` and `confidence.level`
- Track files opened vs files actually used in edits
- Surface in final metrics

**Benefit:** User knows if agent had sufficient context or missed key files.

## Recommended Implementation Order

1. **Solution 2** (Inline Metrics Display) - Quick win, high impact
   - Add `metricsDisplay` to tool responses
   - Update agent rules to surface it
   - Estimated effort: 2-3 hours

2. **Solution 1** (Real-Time Visibility) - Higher effort, high value
   - Requires streaming support in MCP SDK
   - Add progress events to tools
   - Estimated effort: 1-2 days

3. **Solution 3** (Task Sizing) - Medium effort, medium value
   - Add complexity heuristic
   - Implement fast path
   - Validate with benchmarks
   - Estimated effort: 1 day

4. **Solution 4** (Context Scoring) - Low priority
   - Nice-to-have, not critical
   - Estimated effort: 4-6 hours

## Success Criteria

After implementation, user should be able to:
- See which files agent read and why (real-time or in final summary)
- Know execution time and token cost per operation
- Understand if agent had sufficient context (coverage score)
- Experience fast execution for simple tasks (<5s for single-file changes)

## Related Issues

- `topTools` visibility (implemented in v1.7.1) - addresses aggregate metrics
- This issue addresses per-operation visibility and task sizing
