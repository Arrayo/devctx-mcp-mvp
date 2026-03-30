# Feedback When devctx Not Used

## Problem

The MCP tools are available, but agents often ignore them and use native tools instead (Read, Grep, Shell). Users have no visibility into:
- Whether the agent saw the devctx tools
- Why the agent chose not to use them
- How to encourage usage in the next turn

This leads to:
- Low adoption despite installation
- Confusion about whether MCP is working
- Missed opportunities for token savings

## Solution

Add a **feedback rule** to the base agent rules that instructs agents to:
1. Detect when they didn't use devctx tools in a non-trivial programming task
2. Add a brief note explaining why
3. Provide a short prompt for forcing usage next time

### New Rule Text

```markdown
If you didn't use devctx tools in a non-trivial programming task, add at the end:

**Note:** devctx not used because: [task too simple | MCP unavailable | index not built | already had sufficient context | native tool more direct for this case]. To use devctx next time: "Use smart-context-mcp: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)"
```

### Allowed Reasons (Constrained)

The rule provides **5 specific reasons** to prevent agents from inventing excuses:

1. **task too simple** - Single file read, one-off question, trivial operation
2. **MCP unavailable** - MCP server not running, tools not visible
3. **index not built** - `build_index` not run, search/context quality degraded
4. **already had sufficient context** - Previous turn already loaded needed context
5. **native tool more direct for this case** - Specific scenario where native tool is genuinely better

These reasons are:
- **Honest** - Reflect real agent decision-making
- **Actionable** - User can fix MCP/index issues
- **Educational** - User learns when devctx adds value
- **Non-defensive** - No "I forgot" or "I didn't think of it"

### Forcing Prompt

The rule provides a **short, copy-pasteable prompt**:

```
Use smart-context-mcp: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)
```

This prompt:
- Is concise (one line)
- Shows the recommended flow
- Is easy to copy/paste
- Works across all clients

## Why This Matters

### 1. Makes Non-Usage Visible

Before:
```
User: "Debug this error"
Agent: [uses Read, Grep, Shell]
User: [doesn't know devctx was available]
```

After:
```
User: "Debug this error"
Agent: [uses Read, Grep, Shell]
Agent: "Note: devctx not used because: already had sufficient context. 
       To use devctx next time: 'Use smart-context-mcp: smart_turn(start) → ...'"
User: [knows devctx exists, knows how to force it]
```

### 2. Educates Users

The feedback teaches users:
- When devctx adds value (non-trivial tasks)
- When it doesn't (simple tasks)
- How to force usage (copy prompt)
- How to fix setup issues (MCP/index)

### 3. Increases Adoption

By making non-usage visible and providing a forcing prompt, users are more likely to:
- Try devctx in the next turn
- Verify MCP is working
- Build the index if missing
- Understand the value proposition

### 4. Identifies Setup Issues

If the agent consistently says "MCP unavailable" or "index not built", the user knows:
- MCP server isn't running → check `.cursor/mcp.json`
- Index isn't built → run `build_index` tool
- Rules aren't installed → run `npx smart-context-init`

## Implementation

### Files Changed

1. `.cursor/rules/devctx.mdc` - Added feedback rule (3 lines)
2. `tools/devctx/agent-rules/base.md` - Added feedback section with rationale
3. `tools/devctx/agent-rules/compact.md` - Added feedback rule
4. `tools/devctx/scripts/init-clients.js` - Updated generator to include feedback rule

### Impact on Fixed Context Cost

**Before:** 10 lines (base rule only)  
**After:** 13 lines (base rule + feedback rule)  
**Increase:** 3 lines (30% increase in base rule, but still 68% smaller than original 42 lines)

**Trade-off:** 3 extra lines of fixed context cost for:
- Visibility into agent behavior
- User education
- Increased adoption
- Setup issue detection

**Verdict:** Worth it. The 3 lines provide high value for low cost.

## Expected Agent Behavior

### Scenario 1: Simple Task (Should NOT Add Feedback)

```
User: "What does this function do?"
Agent: [reads one file with Read]
Agent: "This function calculates the sum of an array."
```

No feedback needed - task is trivial, devctx wouldn't add value.

### Scenario 2: Complex Task, Agent Uses Native Tools

```
User: "Debug this authentication error"
Agent: [uses Grep, Read, Shell]
Agent: "The issue is in validateToken()..."
Agent: "Note: devctx not used because: already had sufficient context. 
       To use devctx next time: 'Use smart-context-mcp: smart_turn(start) → ...'"
```

Feedback added - task is non-trivial, agent chose native tools.

### Scenario 3: Complex Task, Agent Uses devctx

```
User: "Debug this authentication error"
Agent: [uses smart_turn(start), smart_search, smart_read]
Agent: "The issue is in validateToken()..."
```

No feedback needed - agent used devctx as recommended.

### Scenario 4: MCP Not Available

```
User: "Debug this authentication error"
Agent: [uses Grep, Read, Shell]
Agent: "The issue is in validateToken()..."
Agent: "Note: devctx not used because: MCP unavailable. 
       To use devctx next time: 'Use smart-context-mcp: smart_turn(start) → ...'"
```

Feedback reveals setup issue - user can check MCP configuration.

## User Experience

### Before (No Feedback)

User installs MCP, but agent keeps using native tools. User doesn't know:
- Is MCP working?
- Does the agent see the tools?
- Should I force usage?
- Is the index built?

Result: **Low adoption, confusion, frustration**

### After (With Feedback)

User installs MCP. If agent uses native tools, user sees:
- Why agent didn't use devctx
- How to force usage next time
- Whether there's a setup issue

Result: **Higher adoption, clarity, confidence**

## Metrics to Track

To measure the impact of this change, track:

1. **Feedback frequency** - How often does the agent add the note?
2. **Reason distribution** - Which reasons are most common?
3. **Follow-up usage** - Do users force devctx after seeing the note?
4. **Setup issue detection** - How often is "MCP unavailable" or "index not built" the reason?

These metrics will help optimize the feedback rule over time.

## Next Steps

This feedback rule is **Step 2** of the adoption optimization plan. Next steps:

1. ✅ **Reduce base rule** (Step 1 - completed)
2. ✅ **Add feedback when devctx not used** (Step 2 - this document)
3. 🔄 **Make preflight (build_index) more visible** (Step 3 - next)
4. 🔄 **Matize "faster and more accurate" claim** (Step 4 - next)

## References

- Base rule reduction: `docs/agent-rules/base-rule-reduction.md`
- Design rationale: `docs/agent-rules/design-rationale.md`
- Two-layer architecture: `docs/agent-rules/two-layer-architecture.md`
