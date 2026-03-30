# Compact Task-Specific Profiles

These rules are **conditionally applied** based on file globs and task context.

## Architecture

**Two-layer design:**

1. **Base rule** (`devctx.mdc` in parent directory)
   - Always active (`alwaysApply: true`)
   - Ultra-short (~150 tokens)
   - Core tool preferences + entry point guidance

2. **Task profiles** (this directory)
   - Conditionally applied based on globs
   - Compact (~100-150 tokens each)
   - Detailed workflows per task type

## Why This Design?

**Problem:** Dense rules always active = fixed context cost (contradicts "token savings" value prop)

**Solution:** Minimal base + conditional profiles = low fixed cost + high value when needed

## Profiles

| Profile | Globs | Token Savings | Use Case |
|---------|-------|---------------|----------|
| `debugging.mdc` | `**/*.test.*`, `**/tests/**` | 90% | Error-first, symbol-focused debugging |
| `code-review.mdc` | `**/*.{js,ts,jsx,tsx,py,go,rs,java}` | 87% | Diff-aware API review |
| `refactoring.mdc` | `**/*.{js,ts,jsx,tsx,py,go,rs,java}` | 89% | Graph-aware, test-verified refactoring |
| `testing.mdc` | `**/*.test.*`, `**/test/**` | 90% | Coverage-aware, TDD-friendly testing |
| `architecture.mdc` | `**/*.{js,ts,jsx,tsx,py,go,rs,java}` | 90% | Index-first, minimal-detail exploration |

## Context Cost Comparison

**Before (single dense rule):**
- Always active: ~600 tokens
- Fixed cost per interaction: 600 tokens

**After (two-layer design):**
- Base rule (always): ~150 tokens
- Profile (conditional): ~100-150 tokens when needed
- Fixed cost per interaction: 150 tokens (75% reduction)
- Total cost when profile applies: 250-300 tokens (50% reduction)

## Installation

These profiles are automatically installed by:

```bash
npx smart-context-init --target . --clients cursor
```

**Files created:**
- `.cursor/rules/devctx.mdc` - Base rule (always active)
- `.cursor/rules/profiles-compact/*.mdc` - Task profiles (conditional)

## How Cursor Applies Rules

1. **Base rule** (`devctx.mdc`) is always injected due to `alwaysApply: true`
2. **Profile rules** are injected when:
   - Current file matches glob pattern
   - OR task context suggests profile relevance

This ensures:
- ✅ Low fixed context cost (150 tokens)
- ✅ High value when needed (250-300 tokens total)
- ✅ Agent always has core guidance
- ✅ Agent gets detailed workflow when relevant

## Customization

You can:
- Edit base rule to adjust core preferences
- Edit profiles to refine workflows
- Add new profiles for custom tasks
- Adjust globs to change when profiles activate

**Important:** Keep base rule short. Move details to profiles.
