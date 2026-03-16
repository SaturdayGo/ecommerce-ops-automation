# 2026-03-15 Preflight Hardening Plan

## Objective

Stop invalid module runs before Chrome opens.

## Steps

1. Add `src/preflight.ts`
   - selected-module validation
   - local-file existence helpers
   - structured result object

2. Add tests
   - module-aware validation
   - local template/video existence
   - mixed hard-fail + warning behavior

3. Integrate into `src/main.ts`
   - run after YAML load
   - fail before `launchBrowser()`
   - write blocked runtime snapshot

4. Update `docs/automation/lessons.md`
   - preflight is for minimal execution conditions only
   - do not let preflight compete with runtime selectors

## Verification

1. `node --import tsx --test tests/preflight.test.ts`
2. `npm run typecheck`
3. One real CLI run with invalid selected-module payload that must fail before browser launch
