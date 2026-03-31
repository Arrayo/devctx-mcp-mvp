# Product Improvement Roadmap

## Purpose

This roadmap turns the recent review findings into a concrete product backlog so the next improvements stay visible, ordered, and testable.

It complements:

- `docs/default-on-improvements.md`
- `docs/adoption-improvements-phase2.md`

Those documents describe specific improvement slices already implemented. This document is the forward-looking plan for the next product steps.

---

## Current Position

After the latest review and fixes, `devctx` is already credible for real long-running agent work:

- session continuity is stronger
- workflow tracking is more honest
- net savings are clearer
- repo-safety enforcement is much harder to bypass
- client layers surface blocked-state remediation better

The remaining work is now less about proving the core and more about closing the full product experience.

---

## Priorities

### P0. Client Integration Consistency

**Goal:** Make the main clients behave consistently around `smart_turn`, continuity, repo safety, and remediation.

**Why first:**
- product value is only fully realized when clients actually consume the MCP correctly
- this has the highest user-facing impact

**Scope:**
- align Claude hooks, headless wrapper, Codex guidance, and other adapters around the same contract
- standardize use of:
  - `smart_turn(start/end)`
  - `mutationSafety`
  - `workflow`
  - `recommendedActions`
- reduce client-specific ad hoc logic where possible

**Concrete tasks:**
- add the same blocked-state remediation ergonomics to other supported adapters beyond Claude/headless
- audit generated client setup files to ensure they reference the real recommended flow
- define a minimal “client contract” for what each adapter must surface from `smart_turn`

**Exit criteria:**
- each supported client path exposes continuity + blocking + remediation consistently
- client docs no longer rely mainly on “prompt discipline” for critical flows

---

### P1. More Default-Safe Automation

**Goal:** Reduce how much the product depends on the agent remembering the right tool sequence.

**Why second:**
- the MCP is strongest when it removes agent discipline burden, not when it merely documents it

**Scope:**
- safer defaults
- more automatic orchestration
- less manual glue in common workflows

**Concrete tasks:**
- identify which `smart_turn(start)` actions can become automatic without introducing hidden cost
- tighten default rehydration heuristics with explicit quality/cost thresholds
- unify the “recommended path” for task start, task switch, checkpoint, and resume

**Exit criteria:**
- common long-form flows work well even with a merely competent agent
- fewer critical behaviors depend on custom prompt instructions

---

### P1. Evaluation and Product Metrics

**Goal:** Measure not only token savings but also whether the product improves workflow quality and recovery in practice.

**Why second-tier priority:**
- the product is already measurable on tokens, but not enough on usefulness

**Scope:**
- workflow-level measurement
- regression detection
- explicit proven vs inferred claims

**Concrete tasks:**
- define evaluation dimensions:
  - net token savings
  - continuity recovery quality
  - blocked-state handling quality
  - context refresh usefulness
- add repeatable benchmark scenarios
- record coverage and quality signals in reports where possible

**Exit criteria:**
- README and docs can distinguish clearly between:
  - measured
  - inferred
  - not yet measured
- regressions are detectable before release

---

### P2. SQLite Operational Maturity

**Goal:** Make the project-local SQLite state feel operationally boring and safe.

**Why here:**
- core safety is much better now, but durability and maintenance ergonomics still matter for a serious product

**Scope:**
- migrations
- compact/retention policy
- diagnostics and repair
- failure handling

**Concrete tasks:**
- document and test migration expectations more explicitly
- improve troubleshooting flows for stale, corrupted, oversized, or locked state
- define clearer retention/compaction defaults for long-lived repos
- review whether more state should move into or stay out of SQLite

**Exit criteria:**
- operational failure modes have documented diagnosis and safe remediation
- long-lived project state remains maintainable without manual cleanup folklore

---

### P2. Remediation UX and Error Contracts

**Goal:** Make blocked or degraded states easy to understand and act on across all tools.

**Why still needed:**
- `mutationSafety` is a good step, but the product should feel uniform whenever something is blocked, degraded, or partial

**Scope:**
- stable response contracts
- predictable remediation messages
- consistent degraded-mode semantics

**Concrete tasks:**
- standardize blocked/degraded response shapes beyond `smart_turn`
- normalize remediation categories, not just free-form action strings
- define which tools should expose:
  - `blockedBy`
  - `recommendedActions`
  - `sideEffectsSuppressed`
  - coverage/degraded-mode metadata

**Exit criteria:**
- clients can handle blocked/degraded states without per-tool custom logic
- user-facing remediation feels consistent across the product

---

### P3. Documentation and Adoption UX

**Goal:** Make product adoption and daily usage easier for a new team member without deep MCP knowledge.

**Why later:**
- docs are already decent, but they should follow the stabilized contracts, not run ahead of them

**Scope:**
- onboarding
- quick-start paths
- troubleshooting
- honest expectations

**Concrete tasks:**
- create a concise “best path by client” page
- add a product mental model page:
  - what `devctx` controls
  - what it does not control
  - how to interpret continuity/blocking/coverage signals
- keep roadmap-adjacent docs synced with actual shipped behavior

**Exit criteria:**
- a new user can choose a client, install, start, debug, and recover context without reading half the repo

---

## Suggested Execution Order

### Phase A
- P0 client integration consistency
- P1 default-safe automation

### Phase B
- P1 evaluation and product metrics
- P2 remediation UX and error contracts

### Phase C
- P2 SQLite operational maturity
- P3 documentation and adoption UX

---

## Recommended Next Implementation

If continuing immediately, the best next step is:

1. audit the remaining client adapters and setup generators against the new `smart_turn` / `mutationSafety` contract
2. define a minimal client-integration checklist
3. patch any adapters that still depend mainly on prompt discipline instead of structured MCP outputs

---

## Tracking Notes

This roadmap should be updated when:

- a priority area starts implementation
- a priority area is split into smaller phases
- a priority area reaches its exit criteria
- product claims change because new measurement exists
