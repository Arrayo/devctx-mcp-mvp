# Agent Rules: Design Rationale

## Problem Statement

AI agents have access to powerful MCP tools, but without guidance they:

1. **Read full files by default** - Wastes 90% of tokens on irrelevant content
2. **Use built-in Grep** - Misses ranking, grouping, and intent-aware search
3. **Skip context recovery** - Repeats work across turns
4. **Don't follow task-specific workflows** - Inefficient exploration patterns

**Result:** High token costs, slow responses, repeated work.

## Solution: Task-Specific Agent Rules

Agent rules provide **actionable workflows** per task type, teaching agents:
- **When** to use devctx tools (task type detection)
- **How** to use them (workflow patterns)
- **Why** they're better (token savings, speed)

## Design Principles

### 1. Compact & Actionable

**Bad (verbose):**
```
When you need to debug an issue, you should first consider using the 
smart_search tool with the debug intent parameter, which will help you 
find error locations more efficiently than using grep...
```

**Good (actionable):**
```
Debugging: smart_search(intent=debug) → smart_read(symbol) → fix
```

**Rationale:** Agents scan rules quickly. Dense, actionable format is more effective.

---

### 2. Workflow-Oriented

**Bad (tool-centric):**
```
smart_read has 5 modes: outline, signatures, symbol, range, full.
Use outline for structure, signatures for API...
```

**Good (workflow-centric):**
```
Debugging workflow:
1. smart_search(intent=debug) - find error
2. smart_read(symbol) - extract function
3. smart_shell('npm test') - reproduce
```

**Rationale:** Agents think in workflows, not tool catalogs.

---

### 3. Progressive Disclosure

**Bad (flat):**
```
All rules in one file, no hierarchy
```

**Good (layered):**
```
core.md                    ← Universal rules (always apply)
profiles/
  ├── debugging.md         ← Debugging-specific
  ├── code-review.md       ← Review-specific
  ├── refactoring.md       ← Refactor-specific
  ├── testing.md           ← Testing-specific
  └── architecture.md      ← Architecture-specific
```

**Rationale:** Core rules always apply. Profiles activate per task type.

---

### 4. Honest About Limitations

**Bad (false promises):**
```
The agent will ALWAYS use devctx tools.
```

**Good (realistic):**
```
These are suggestions, not guarantees. You decide when to use 
devctx tools based on the task.
```

**Rationale:** Rules are guidance. Agents make final decisions. Honesty builds trust.

---

### 5. Evidence-Based

**Bad (claims without proof):**
```
Use smart_read for better performance.
```

**Good (quantified):**
```
smart_read(outline) → 90% savings (150K → 15K tokens)
```

**Rationale:** Agents respond to concrete benefits, not vague claims.

---

## Rule Structure

### Core Rules (Universal)

Applied to **every task**:

1. **Tool preference** - Prefer devctx over built-ins
2. **Context recovery** - `smart_turn` for session persistence
3. **Reading cascade** - `outline` → `signatures` → `symbol` → `full`
4. **Search strategy** - Always pass `intent`
5. **Repository safety** - Check `repoSafety` before mutations

**Format:** Compact, bullet-point, actionable

**Location:** 
- `.cursor/rules/devctx.mdc`
- `AGENTS.md`
- `CLAUDE.md`

---

### Profile Rules (Task-Specific)

Applied to **specific task types**:

1. **Debugging** - Error-first, symbol-focused
2. **Code Review** - Diff-aware, API-focused
3. **Refactoring** - Graph-aware, test-verified
4. **Testing** - Coverage-aware, TDD-friendly
5. **Architecture** - Index-first, minimal-detail

**Format:** Workflow diagrams, examples, anti-patterns

**Location:** `tools/devctx/agent-rules/profiles/`

**Usage:** Reference material for agents (not auto-injected)

---

## Why This Works

### 1. Reduces Decision Fatigue

Without rules:
- Agent must decide: "Should I use smart_read or Read?"
- Agent must decide: "Which mode should I use?"
- Agent must decide: "Should I search first or read?"

With rules:
- Clear preference: "Use smart_read(outline) first"
- Clear cascade: "outline → signatures → symbol → full"
- Clear workflow: "Search → Read → Edit"

**Result:** Faster decisions, better patterns.

---

### 2. Encodes Best Practices

Rules capture **learned patterns** from production use:

- **Debugging:** Error locations found faster with `intent=debug`
- **Review:** Diff-aware context reduces noise by 70%
- **Refactoring:** Signatures preserve API contracts
- **Testing:** Symbol reads extract only function under test
- **Architecture:** Minimal detail provides overview without full reads

**Result:** Agents benefit from accumulated wisdom.

---

### 3. Adapts to Task Type

Different tasks need different approaches:

| Task | Entry Point | Detail Level | Focus |
|------|-------------|--------------|-------|
| Debugging | `smart_search(debug)` | Symbol-level | Error location |
| Review | `smart_context(diff)` | Signatures | Changed API |
| Refactor | `smart_context(entry)` | Signatures | Impact radius |
| Testing | `smart_search(tests)` | Symbol | Function to test |
| Architecture | `smart_context(minimal)` | Index-first | Structure |

**Result:** Right tool, right mode, right time.

---

### 4. Maintains Flexibility

Rules are **guidance**, not **enforcement**:

- Agent can ignore rules when appropriate
- Agent can use built-in tools for simple tasks
- Agent can adapt to edge cases
- No false guarantees to users

**Result:** Practical, not dogmatic.

---

## Rule Evolution

### v1.0.0 - Basic Rules

```
Use smart_read instead of Read.
Use smart_search instead of Grep.
```

**Problem:** Too vague, no workflows, no task-specific guidance.

---

### v1.1.0 - Current (Workflow-Oriented)

```
Debugging: smart_turn(start) → smart_search(intent=debug) → 
smart_read(symbol) → fix → smart_turn(end)
```

**Improvement:** Clear workflows, task-specific, actionable.

---

### v1.2.0 - Planned (Auto-Detection)

```
[Agent detects task type from prompt]
[Auto-loads appropriate profile]
[Suggests workflow]
```

**Goal:** Zero-config optimal workflows.

---

## Metrics & Validation

### Rule Effectiveness

Track via `smart_metrics`:

```bash
npm run report:metrics
```

**Key metrics:**
- Tool usage frequency (are agents using devctx?)
- Token savings per tool (are rules effective?)
- Session continuity (is `smart_turn` used?)
- Intent distribution (are intents used correctly?)

### A/B Testing (Planned v1.3.0)

Compare rule variants:
- **Variant A:** Verbose, explanatory rules
- **Variant B:** Compact, workflow-focused rules
- **Variant C:** No rules (baseline)

**Measure:**
- Token usage
- Task completion time
- Agent satisfaction (subjective)

---

## Installation & Distribution

### Auto-Generated

`npx smart-context-init --target .` generates:

```
.cursor/rules/devctx.mdc       ← Cursor
AGENTS.md                      ← Codex, Qwen
CLAUDE.md                      ← Claude Desktop
```

**Content:** Compact core rules + task workflows

**Format:** Client-specific (frontmatter for Cursor, markdown for others)

### Manual Reference

Detailed profiles in `tools/devctx/agent-rules/profiles/`:

```
debugging.md        ← Full debugging workflow with examples
code-review.md      ← Full review workflow with examples
refactoring.md      ← Full refactor workflow with examples
testing.md          ← Full testing workflow with examples
architecture.md     ← Full architecture workflow with examples
```

**Usage:** Agents can reference these for detailed guidance.

---

## Future Directions

### 1. Profile Auto-Detection

Detect task type from prompt:

```
"Fix login bug" → Debugging profile
"Review this PR" → Code Review profile
"Refactor auth module" → Refactoring profile
```

### 2. Dynamic Rule Generation

Generate rules based on project:

```javascript
// Detects: React project with Jest
// Generates: React-specific + Jest-specific rules

// Detects: Python project with pytest
// Generates: Python-specific + pytest-specific rules
```

### 3. Rule Learning

Learn from agent behavior:

```
Agent frequently uses smart_read(full) after smart_read(outline)
→ Adjust rules to suggest smart_read(signatures) as intermediate step
```

### 4. Custom Profile Templates

User-defined profiles:

```markdown
# Custom Profile: Performance Optimization

## Workflow
1. smart_search(intent=implementation, query='performance')
2. smart_read(mode=symbol, symbol='slowFunction')
3. [optimize]
4. smart_shell('npm run benchmark')
```

---

## Comparison: Tools-Only vs Tools + Rules

### Tools-Only MCP

```
Agent: "I need to debug this error"
[Uses built-in Read tool]
[Reads 5 full files]
[150K tokens]
```

**Problem:** Agent doesn't know better options exist.

### Tools + Rules MCP

```
Agent: "I need to debug this error"
[Reads rules: "Debugging: smart_search(intent=debug)"]
[Uses smart_search(intent=debug)]
[Uses smart_read(symbol)]
[15K tokens]
```

**Improvement:** 90% token savings, faster resolution.

---

## Design Trade-offs

### Trade-off 1: Compact vs Detailed

**Choice:** Compact core rules + detailed profile docs

**Rationale:**
- Compact rules scan faster
- Detailed profiles for deep dives
- Progressive disclosure

**Alternative rejected:** Single verbose rule file (too slow to scan)

---

### Trade-off 2: Enforcement vs Guidance

**Choice:** Guidance (suggestions, not guarantees)

**Rationale:**
- Agents need flexibility
- Edge cases exist
- False guarantees harm trust

**Alternative rejected:** Strict enforcement (too rigid, breaks edge cases)

---

### Trade-off 3: Universal vs Task-Specific

**Choice:** Both (core + profiles)

**Rationale:**
- Core rules always apply
- Profiles activate per task
- Best of both worlds

**Alternative rejected:** Universal only (misses task-specific optimizations)

---

### Trade-off 4: Auto-Inject vs Manual Reference

**Choice:** Auto-inject compact rules, manual reference for profiles

**Rationale:**
- Compact rules fit in agent context
- Detailed profiles too large to inject
- Agents can reference profiles when needed

**Alternative rejected:** Inject everything (context bloat)

---

## Success Criteria

Rules are successful if:

1. ✅ **Agents use devctx tools** - Metrics show high usage
2. ✅ **Token savings achieved** - 85-90% reduction maintained
3. ✅ **Task completion faster** - Fewer round-trips
4. ✅ **User satisfaction** - Positive feedback
5. ✅ **No false guarantees** - Honest about limitations

## Validation

Check rule effectiveness:

```bash
# View metrics
npm run report:metrics

# Expected:
# - smart_read usage: 60-80% of file reads
# - smart_search usage: 70-90% of searches
# - smart_turn usage: 50-70% of sessions
# - Token savings: 85-90%
```

If metrics don't match expectations:
1. Review rules for clarity
2. Check agent feedback
3. Iterate on rule design
4. A/B test variants

---

## Conclusion

Agent rules are **not just documentation**—they're a **core product feature** that:

1. Teaches agents optimal workflows
2. Reduces token usage by 85-90%
3. Speeds up task completion
4. Maintains flexibility for edge cases
5. Provides task-specific guidance

**The MCP provides tools. The rules teach agents how to use them effectively.**

This is what transforms a collection of tools into a **complete solution**.
