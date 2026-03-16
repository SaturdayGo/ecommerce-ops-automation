# Security Boundaries

This repository is public. It must never contain live seller credentials, browser session state, runtime evidence, or local environment secrets.

## Never Commit

- `.auth/`
- `.chrome-profile/`
- `runtime/`
- `runlogs/`
- `screenshots/`
- `artifacts/`
- `.env` and `.env.*`
- any `storage-state.json`
- any cookie, session, token, or secret dump

## Why

This project automates the real AliExpress Seller Center publish flow. A leaked browser state file can be more dangerous than a leaked password because it may already contain authenticated session material.

## Guardrails In This Repo

- `.gitignore` blocks common auth, runtime, evidence, and environment files
- `.githooks/pre-commit` runs `scripts/check-safe-commit.sh`
- the pre-commit scanner blocks both sensitive paths and staged diffs containing common secret/session markers

## Local Setup

Run this once after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit scripts/check-safe-commit.sh
```

## If You Suspect Exposure

1. Rotate the affected credential immediately.
2. Invalidate any saved browser session.
3. Remove the material from git history, not just the latest commit.
4. Audit the public repository state before continuing development.
