# MCP Prompts - Forcing devctx Usage

## Overview

The devctx MCP server provides **prompts** that can be invoked by the client (Cursor) to automatically inject forcing instructions into the agent's context.

**Benefit:** No need to manually type forcing prompts - the MCP can inject them automatically.

---

## Available Prompts

### 1. `use-devctx` (Ultra-Short Forcing Prompt)

**Purpose:** Force the agent to use devctx tools for the current task.

**When to use:** At the start of any message when you want to ensure devctx is used.

**Injected text:**
```
Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)
```

**How to invoke in Cursor:**
- Type `/prompt use-devctx` in the chat
- Or use the prompts menu if available

---

### 2. `devctx-workflow` (Complete Workflow Template)

**Purpose:** Provide a complete step-by-step devctx workflow.

**When to use:** When starting a complex task that requires multiple steps.

**Injected text:**
```
Follow this devctx workflow:

1. smart_turn(start) - Start session and recover previous context
2. smart_context(task) - Build complete context for the task
3. smart_search(query) - Search for specific patterns if needed
4. smart_read(file) - Read files with appropriate mode (outline/signatures/symbol)
5. smart_turn(end) - Save checkpoint for next session

Use devctx tools instead of native Read/Grep/Shell when possible.
```

**How to invoke in Cursor:**
- Type `/prompt devctx-workflow` in the chat

---

### 3. `devctx-preflight` (Preflight Checklist)

**Purpose:** Ensure index is built and session is initialized before starting work.

**When to use:** At the beginning of a new session or when starting work on a new project.

**Injected text:**
```
Preflight checklist:

1. build_index(incremental=true) - Build/update symbol index
2. smart_turn(start) - Initialize session and recover context
3. Proceed with your task using devctx tools

This ensures optimal performance and context recovery.
```

**How to invoke in Cursor:**
- Type `/prompt devctx-preflight` in the chat

---

## How Prompts Work

### MCP Protocol

Prompts are part of the MCP (Model Context Protocol) specification:

1. **Server registers prompts** with name, description, and template
2. **Client (Cursor) lists available prompts** via `prompts/list`
3. **User invokes prompt** (e.g., `/prompt use-devctx`)
4. **Client calls `prompts/get`** with prompt name
5. **Server returns message template** with the forcing text
6. **Client injects message** into the conversation context

### Implementation

In `src/server.js`:

```javascript
server.prompt(
  'use-devctx',
  'Force the agent to use devctx tools for the current task.',
  {},
  async () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Use devctx: smart_turn(start) → ...',
        },
      },
    ],
  })
);
```

---

## Usage in Cursor

### Method 1: Slash Command (Recommended)

```
/prompt use-devctx
```

Then type your actual request:
```
/prompt use-devctx

Refactor the authentication module to use dependency injection
```

### Method 2: Prompts Menu

1. Open Cursor chat
2. Click on prompts icon (if available)
3. Select `use-devctx` from the list
4. Type your request

### Method 3: Automatic (Future)

In the future, Cursor may support:
- Auto-suggesting prompts based on context
- Keyboard shortcuts for prompts
- Default prompts for specific scenarios

---

## Comparison: Manual vs MCP Prompts

### Before (Manual)

User types:
```
Use devctx: smart_turn(start) → smart_context/smart_search → smart_read → smart_turn(end)

Refactor the authentication module
```

**Problems:**
- ❌ Have to remember the exact syntax
- ❌ Have to type it every time
- ❌ Easy to make typos
- ❌ Can't update centrally

### After (MCP Prompts)

User types:
```
/prompt use-devctx

Refactor the authentication module
```

**Benefits:**
- ✅ No need to remember syntax
- ✅ Quick to invoke
- ✅ No typos
- ✅ Centrally managed (updates automatically)
- ✅ Discoverable (shows in prompts list)

---

## Verification

After invoking a prompt, you can verify it worked by checking:

1. **Usage Feedback** (if enabled):
   ```bash
   export DEVCTX_SHOW_USAGE=true
   ```
   You'll see which devctx tools were used.

2. **Decision Explanations** (if enabled):
   ```bash
   export DEVCTX_EXPLAIN=true
   ```
   You'll see why devctx tools were chosen.

3. **Missed Opportunities** (if enabled):
   ```bash
   export DEVCTX_DETECT_MISSED=true
   ```
   You'll see warnings if devctx wasn't used.

---

## Troubleshooting

### Prompt not found

**Problem:** `/prompt use-devctx` shows "prompt not found"

**Solutions:**
1. Verify MCP server is running: Check Cursor MCP settings
2. Restart Cursor to reload MCP configuration
3. Check MCP logs for errors

### Prompt doesn't force devctx usage

**Problem:** Agent still uses native tools after invoking prompt

**Solutions:**
1. Verify prompt was actually injected (check conversation history)
2. Try more explicit instructions: `/prompt devctx-workflow`
3. Enable detection to see why: `export DEVCTX_DETECT_MISSED=true`
4. Check if index is built: `ls .devctx/index.json`

### Can't see prompts in Cursor

**Problem:** Prompts menu doesn't show devctx prompts

**Solutions:**
1. Update Cursor to latest version
2. Check if MCP prompts are supported in your Cursor version
3. Use slash command instead: `/prompt use-devctx`
4. Check MCP configuration in `.cursor/mcp.json`

---

## Best Practices

### 1. Use `use-devctx` for Quick Tasks

For simple, single-turn tasks:
```
/prompt use-devctx

Fix the bug in calculateTotal function
```

### 2. Use `devctx-workflow` for Complex Tasks

For multi-step tasks:
```
/prompt devctx-workflow

Implement user authentication with JWT tokens
```

### 3. Use `devctx-preflight` at Session Start

When starting a new session:
```
/prompt devctx-preflight

[Then proceed with your task]
```

### 4. Combine with Feedback Features

For maximum visibility:
```bash
export DEVCTX_SHOW_USAGE=true
export DEVCTX_EXPLAIN=true
export DEVCTX_DETECT_MISSED=true
```

Then use prompts as normal.

---

## Future Enhancements

### Planned Features

1. **Parameterized Prompts:**
   ```
   /prompt use-devctx task="refactor auth" intent="implementation"
   ```

2. **Context-Aware Prompts:**
   - Auto-suggest `devctx-preflight` at session start
   - Auto-suggest `use-devctx` for complex queries

3. **Custom User Prompts:**
   - Allow users to define their own prompts
   - Store in `.devctx/prompts/`

4. **Prompt Analytics:**
   - Track which prompts are used most
   - Measure effectiveness (adoption rate after prompt)

---

## Related Features

- **Usage Feedback** (`docs/usage-feedback.md`) - See what's used
- **Decision Explainer** (`docs/decision-explainer.md`) - Understand why
- **Missed Opportunities** (`docs/missed-opportunities.md`) - Detect gaps
- **Forcing Prompts** (manual) - Documented in README.md

---

## Summary

**MCP Prompts provide a convenient way to force devctx usage** without manual typing:

- ✅ **3 prompts available:** `use-devctx`, `devctx-workflow`, `devctx-preflight`
- ✅ **Easy to invoke:** `/prompt use-devctx`
- ✅ **Centrally managed:** Updates automatically with MCP
- ✅ **Discoverable:** Shows in prompts list
- ✅ **No typos:** Exact syntax every time

**Invoke with:** `/prompt use-devctx` in Cursor chat
