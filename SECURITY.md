# Security Policy

## Overview

`smart-context-mcp` is designed with security as a priority. This document explains what the MCP can and cannot do, security measures in place, and how to report vulnerabilities.

## Threat Model

### What This MCP Can Access

✅ **Read access:**
- Files within the project root only
- Git repository metadata (status, diff, log, blame)
- Symbol index (`.devctx/index.json`)
- Metrics database (`.devctx/state.sqlite`)

✅ **Write access:**
- `.devctx/` directory only (index, metrics, sessions)
- No write access to source code
- No write access to configuration files
- No write access outside project root

✅ **Execute access:**
- Allowlisted diagnostic commands only (see below)
- No arbitrary command execution
- No shell operators (`|`, `&`, `;`, `>`, `<`, `` ` ``)
- 15-second timeout on all commands

### What This MCP Cannot Do

❌ **Network access:** No HTTP requests, no external APIs

❌ **File system escape:** Cannot read/write outside project root

❌ **Arbitrary execution:** Cannot run non-allowlisted commands

❌ **Privilege escalation:** Cannot use `sudo`, `su`, or similar

❌ **Data exfiltration:** No network, no external writes

❌ **Process manipulation:** Cannot kill processes, modify system

## Security Measures

### 1. Command Execution (`smart_shell`)

**Allowlist-only approach:**

Only these commands are permitted:
- `pwd` - Print working directory
- `ls` - List files
- `find` - Find files (with `-maxdepth 8` auto-injected)
- `rg` - Ripgrep search (bundled binary)
- `git` - Git operations (read-only subcommands only)
- `npm`, `pnpm`, `yarn`, `bun` - Package managers (safe scripts only)

**Git subcommands allowed:**
- `status`, `diff`, `show`, `log`, `branch`, `rev-parse`

**Git subcommands blocked:**
- `commit`, `push`, `pull`, `checkout`, `reset`, `rebase`, `merge`, etc.

**Package manager scripts allowed:**
- `test`, `lint`, `build`, `typecheck`, `check`, `smoke`, `verify`

**Package manager scripts blocked:**
- `install`, `uninstall`, `publish`, `login`, etc.

**Shell operators blocked:**
- `|`, `&`, `;`, `>`, `<`, `` ` ``, `$(...)`, `&&`, `||`

**Execution limits:**
- 15-second timeout
- 10MB output buffer
- Runs from project root only

**Example blocked commands:**
```bash
rm -rf /                    # Dangerous pattern
git commit -m "test"        # Git write operation
npm install malicious       # Package install
ls | grep secret            # Shell operator
cat /etc/passwd             # Not in allowlist
```

### Real Rejection Examples

See [Security Rejection Examples](./docs/security/rejection-examples.md) for comprehensive list of 50+ blocked inputs with exact system responses.

**Quick examples with responses:**

```javascript
// Shell operator blocked
smartShell({ command: "ls | grep secret" })
→ { exitCode: 126, blocked: true, output: "Shell operators are not allowed (|, &, ;, <, >, `, $, (, ))" }

// Dangerous command blocked
smartShell({ command: "rm -rf /" })
→ { exitCode: 126, blocked: true, output: "Dangerous pattern detected: /rm\\s+-rf/i" }

// Git write blocked
smartShell({ command: "git commit -m 'test'" })
→ { exitCode: 126, blocked: true, output: "Git subcommand not allowed: commit. Allowed: status, diff, show, log, branch, rev-parse, blame" }

// Package install blocked
smartShell({ command: "npm install malicious" })
→ { exitCode: 126, blocked: true, output: "Package manager subcommand not allowed: install. Allowed: test, run, lint, build, typecheck, check" }

// Command not in allowlist
smartShell({ command: "cat /etc/passwd" })
→ { exitCode: 126, blocked: true, output: "Command not allowed: cat. Allowed: pwd, ls, find, rg, git, npm, pnpm, yarn, bun" }
```

**All blocked commands:**
- Return `exitCode: 126` (command not executable)
- Set `blocked: true`
- Log to metrics for audit trail
- Provide human-readable rejection reason

**Verification:**
```bash
# Run security tests to verify behavior
cd tools/devctx
npm test -- tests/smart-shell-security.test.js
```

60+ security tests prove that documented behavior matches actual implementation.

### 2. Path Validation (`resolveSafePath`)

All file operations validate paths to prevent directory traversal:

```javascript
// Allowed
resolveSafePath('src/server.js')      // ✓ Inside project
resolveSafePath('./config.json')      // ✓ Relative path

// Blocked
resolveSafePath('/etc/passwd')        // ✗ Absolute path outside project
resolveSafePath('../../../etc/passwd') // ✗ Escapes project root
```

**Protection:**
- All paths resolved relative to project root
- Paths escaping project root are rejected
- Symlinks are followed but still validated

### 3. Repository Safety (`repo-safety.js`)

Prevents accidental commit of local state:

**Checks:**
- ✅ `.devctx/` is in `.gitignore`
- ✅ `.devctx/state.sqlite` is not tracked
- ✅ `.devctx/state.sqlite` is not staged

**Enforcement:**
- Pre-commit hook blocks commits if state is staged
- `smart_summary` mutations blocked if state is tracked/staged
- `smart_metrics` writes suppressed if state is tracked/staged

**Auto-installed by:**
```bash
npx smart-context-init --target .
```

### 4. Binary File Detection

Prevents reading binary files as text:

```javascript
// Checks first 8KB for null bytes or control characters
if (isBinaryBuffer(buffer)) {
  throw new Error('Binary file, cannot read as text');
}
```

### 5. Resource Limits

**File reading:**
- Default mode: `outline` (compressed)
- Full mode: 12KB character limit with truncation
- Binary detection before reading

**Search:**
- 10MB output buffer
- Ranked results (top 10 by default)
- Compressed previews

**Command execution:**
- 15-second timeout
- 10MB output buffer
- Compressed output (5KB limit)

**Index building:**
- Skips `node_modules/`, `.git/`, `dist/`, `build/`
- 1MB file size limit
- Binary files skipped

## Configuration

### Disable Risky Features

```bash
# Disable shell execution entirely
export DEVCTX_SHELL_DISABLED=true

# Disable cache warming
export DEVCTX_CACHE_WARMING=false

# Use read-only metrics
export DEVCTX_METRICS_READONLY=true
```

### Restrict Project Root

```bash
# Lock to specific directory
export DEVCTX_PROJECT_ROOT=/path/to/safe/directory
```

### Audit Mode

```bash
# Log all tool calls
export DEVCTX_AUDIT_LOG=/path/to/audit.log
```

(Note: Audit mode is not yet implemented but planned for v1.2.0)

## Known Limitations

### What We Don't Protect Against

❌ **Malicious code in the project:** If your project contains malicious code, the MCP will index and read it.

❌ **Secrets in files:** The MCP can read any text file in the project, including files with secrets.

❌ **Resource exhaustion:** A very large project could cause high memory usage during indexing.

❌ **Agent misuse:** The agent could theoretically call tools in unintended ways.

### Recommended Practices

1. **Don't use in untrusted projects:** Only use the MCP in projects you trust.

2. **Keep secrets out of code:** Use environment variables, not hardcoded secrets.

3. **Review `.devctx/` before commits:** Although the pre-commit hook blocks it, always verify.

4. **Monitor metrics:** Check `smart_metrics` regularly for unexpected usage.

5. **Update regularly:** Security fixes are released as patch versions.

## Reporting Vulnerabilities

If you discover a security vulnerability, please:

1. **Do NOT open a public issue**
2. **Email:** fcp1978@hotmail.com with subject "SECURITY: smart-context-mcp"
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue.

## Security Checklist for Users

Before using this MCP in a project:

- [ ] Project is trusted (your own code or verified open source)
- [ ] No secrets hardcoded in files
- [ ] `.devctx/` is in `.gitignore`
- [ ] Pre-commit hook is installed (`smart-context-init` does this)
- [ ] You understand what commands `smart_shell` can run
- [ ] Node.js and dependencies are up to date

## Security Updates

Security fixes are released as:
- **Patch versions** (1.1.x) for minor issues
- **Minor versions** (1.x.0) for moderate issues
- **Major versions** (x.0.0) for critical issues

Subscribe to releases on GitHub to stay informed.

## Audit Trail

All tool calls are logged in `.devctx/state.sqlite` with:
- Tool name
- Timestamp
- Session ID
- Target (file path, query, command)
- Token metrics

Query the audit trail:

```bash
npm run report:metrics
```

Or inspect SQLite directly:

```bash
sqlite3 .devctx/state.sqlite "SELECT * FROM metrics_events ORDER BY created_at DESC LIMIT 10"
```

## Compliance

### Data Privacy

- All data stays local (`.devctx/` directory)
- No telemetry or external reporting
- No data sent to external services
- Metrics are project-local only

### License

MIT License - see [LICENSE](./LICENSE)

## Security Principles

1. **Least Privilege:** MCP has minimal permissions needed for its function
2. **Defense in Depth:** Multiple layers of validation (allowlist + path validation + timeout)
3. **Fail Secure:** Errors block execution, don't bypass security
4. **Transparency:** All security measures are documented and auditable
5. **Safe by Default:** Most restrictive settings out of the box

## Frequently Asked Questions

### Is it safe to use in production codebases?

Yes, if the codebase is trusted. The MCP only reads code and runs diagnostic commands. It cannot modify source code or execute arbitrary commands.

### Can the MCP leak secrets?

No. The MCP has no network access and cannot write outside `.devctx/`. However, if secrets are in your code, the MCP can read them (just like any tool that reads files).

### What if an agent tries to run malicious commands?

The command will be blocked by the allowlist. Only safe, diagnostic commands are permitted.

### Can I disable `smart_shell` entirely?

Yes. Set `DEVCTX_SHELL_DISABLED=true` or remove the tool from `src/server.js`.

### How do I verify the MCP is secure?

1. Review `src/tools/smart-shell.js` for command validation
2. Review `src/utils/fs.js` for path validation
3. Review `src/repo-safety.js` for git safety checks
4. Run `npm test` to verify security tests pass
5. Audit `.devctx/state.sqlite` for tool usage

## Version History

### v1.1.0 (Current)
- ✅ Command allowlist enforced
- ✅ Path validation for all file operations
- ✅ Repository safety checks
- ✅ Pre-commit hook protection
- ✅ 15-second command timeout
- ✅ Binary file detection

### Planned (v1.2.0)
- 🔄 Audit logging mode
- 🔄 Command allowlist customization
- 🔄 Rate limiting per tool
- 🔄 Enhanced path validation

## Contact

For security concerns: fcp1978@hotmail.com

For general issues: [GitHub Issues](https://github.com/Arrayo/smart-context-mcp/issues)
