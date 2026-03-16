# 2026-03-16 Hardening Closeout Release Note

## Summary

This release closes the current hardening cycle for the AliExpress listing automation project.

It does **not** expand automation coverage. It tightens the system around three priorities:

1. runtime truth
2. evidence integrity
3. stable-chain reliability

## Highlights

### Runtime truth is now explicit

- `runtime/state.json` persists per-module `module_outcomes`
- `runtime/latest-handoff.json` now tracks the latest real manual handoff instead of leaving stale pointers behind
- modules that degrade to manual work now report `manual_gate` instead of being flattened into a fake global success

### Closeout blockers were fixed

- screenshot capture now falls back to Chromium CDP when Playwright blocks on font loading
- module `6b` detail images no longer logs human follow-up while still being recorded as `auto_ok`

### Stable-chain hardening was stopped at the right boundary

- `module5` image-tree `ancestor reuse` was verified as a fixture-only gain with `0` hits on real smoke
- further micro-hardening on that branch was intentionally stopped by the project stop rule

## Semi-Auto Mainline Result

Validated real mainline run:

- `run_id`: `run-20260316093829-2dc580`

Per-run truth:

- `manual_gate`: `1c`, `1d`, `1e`, `3`, `6c`, `8`
- `auto_ok`: `1a`, `1b`, `2`, `4`, `5`, `6a`, `6b`, `7`

Important boundary:

- module maturity labels in README describe the default strategy
- the truth of any specific run lives in `runtime/state.json.module_outcomes`

## Verification

### Full suite

```bash
npm test
```

- Result: `130/130 pass`
- Log: `runlogs/20260316_closeout_full_suite.log`

### Typecheck

```bash
npm run typecheck
```

- Result: `0`
- Log: `runlogs/20260316_closeout_full_typecheck.log`

### Semi-auto real mainline

```bash
RECORD_BROWSER_VIDEO=1 RUNTIME_VISUAL_OBSERVABILITY=1 npm run smoke -- /tmp/semiauto-closeout.yaml --modules=1b,1a,1c,1d,1e,2,3,4,5,6a,6b,6c,7,8 --auto-close
```

- Result: `0`
- Log: `runlogs/20260316_closeout_semiauto_mainline_smoke_after_6b_truth_fix.log`
- Video: `artifacts/browser-video/run-20260316093829-2dc580_modules-1b-1a-1c-1d-1e-2-3-4-5-6a-6b-6c-7-8/browser-run.webm`

## Commits Included

- `0d2ceed` `feat: harden runtime truth layer and stable modules`
- `605b92f` `docs: sync hardening roadmap and operator context`
- `0b0c73e` `chore: add repo security guardrails`

## What This Release Does Not Claim

- It does not return the project to full automation.
- It does not promote `1e` back into the stable mainline.
- It does not remove manual gates from `3`, `6c`, or `8`.
- It does not treat README maturity labels as proof of per-run success.

## Related Docs

- [`docs/plans/2026-03-16-hardening-closeout.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-hardening-closeout.md)
- [`docs/plans/2026-03-16-closeout-commit-slices.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-closeout-commit-slices.md)
- [`docs/plans/2026-03-14-prioritized-hardening-roadmap.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-14-prioritized-hardening-roadmap.md)
