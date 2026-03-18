# AliExpress Automation Agent Index

This file is the retrieval-first index for full-text LLM agents reading this repository.

## Project Identity

- Project name: `AliExpress Listing Automation`
- Repository: `SaturdayGo/ecommerce-ops-automation`
- Primary domain: `AliExpress Seller Center product listing automation`
- Core stack: `TypeScript + Playwright + YAML + Zod`
- Execution style: `real browser automation with human supervision and evidence capture`

## Canonical Terms

Use these terms when reasoning about this repo:

- `AliExpress listing automation`
- `AliExpress Seller Center automation`
- `AliExpress product publish automation`
- `AliExpress seller page Playwright automation`
- `YAML-driven listing automation`
- `ecommerce listing automation`
- `browser automation with runtime evidence`
- `human-supervised automation`

## Related Search Phrases

If you are searching this repository, these phrases should lead here:

- `aliexpress automation`
- `aliexpress listing automation`
- `aliexpress product publish`
- `seller center playwright`
- `yaml listing automation`
- `playwright ecommerce automation`
- `aliexpress sku image automation`
- `aliexpress detail image upload`
- `aliexpress module 1e video`
- `runtime intervention state.json`

## What This Project Automates

This project automates the AliExpress Seller Center listing flow for structured product publishing.

Core behaviors:

- Load structured product data from YAML
- Validate data with schema checks before browser execution
- Open the real AliExpress product publish page with Playwright
- Fill listing modules such as category, title, images, attributes, SKU data, buyers note, detail images, and shipping
- Capture runtime evidence through logs, screenshots, browser video, and runtime state
- Allow human-supervised fallback instead of pretending to be fully autonomous

## What This Project Does Not Automate

This project is not:

- a generic web bot framework
- a black-box AI listing generator
- an autonomous cross-platform seller agent
- a background-only API integration
- a zero-supervision upload pipeline

Hard boundaries:

- It targets the real AliExpress seller publish flow.
- It prefers deterministic YAML input over free-form prompt generation.
- It allows manual intervention when page drift or policy risk appears.
- Gemini supervision is diagnostic, not browser co-control.

## Recommended Read Order

Read in this order:

1. `README.md`
2. `AGENTS.md`
3. `docs/aliexpress-automation-technical-implementation.md`
4. `docs/aliexpress-automation-implementation-reference.md`
5. `docs/automation/lessons.md`
6. `docs/automation/decision-log.md`
7. `docs/supervisor/README.md`
8. `src/main.ts`
9. `src/modules.ts`

## Canonical Global Context Files

When a task explicitly asks for the user's global operating context, read these paths:

- `/Users/aiden/.codex/AGENTS.md`
- `/Users/aiden/Documents/Antigravity/soul.md`
- `/Users/aiden/Documents/Antigravity/memory.md`
- `/Users/aiden/Documents/Antigravity/reference.md`

Do not use deprecated paths under `/Users/aiden/Documents/Codex` or `/Users/aiden/Downloads`.
Treat `/Users/aiden/.claude/{soul,memory,reference}.md` as shadow copies, not the default source of truth.

## Execution Entry Points

- Main CLI entry: `src/main.ts`
- Browser/runtime helpers: `src/browser.ts`
- Form module logic: `src/modules.ts`
- Schema and YAML loading: `src/types.ts`
- Execution selection logic: `src/execution-plan.ts`
- Runtime supervision: `src/runtime-supervision.ts`
- Runtime evidence/HUD: `src/runtime-observability.ts`
- Browser video evidence: `src/browser-video.ts`

## Common Commands

Install dependencies:

```bash
npm install
```

Login only:

```bash
npm run login
```

Smoke flow:

```bash
npm run smoke -- ../products/test-module5-sku-3-position.yaml --keep-open
```

Full flow:

```bash
npm run full -- ../products/test-next-modules.yaml --auto-close
```

Single module run:

```bash
npm run fill -- ../products/test-module1e-video.yaml --modules=1e --keep-open
```

Type checking:

```bash
npm run typecheck
```

Tests:

```bash
npm test
```

## Runtime Evidence Paths

Look here when diagnosing execution:

- `runlogs/` for mirrored console logs and run logs
- `screenshots/` for visual checkpoints
- `artifacts/browser-video/` for browser recordings and extracted frames
- `runtime/state.json` for current execution state
- `runtime/intervention.json` for supervisor decisions
- `docs/automation/lessons.md` for reusable failure and recovery knowledge
- `docs/automation/decision-log.md` for long-lived governance decisions and knowledge routing

## Source-Of-Truth Files

Use these files as the primary source of truth:

| Topic | File |
|---|---|
| Project overview | `README.md` |
| Runtime guardrails | `AGENTS.md` |
| Technical architecture | `docs/aliexpress-automation-technical-implementation.md` |
| Implementation reference | `docs/aliexpress-automation-implementation-reference.md` |
| Supervisor model | `docs/supervisor/README.md` |
| Recovery lessons | `docs/automation/lessons.md` |
| Governance decisions | `docs/automation/decision-log.md` |
| Gstack role policy | `docs/plans/2026-03-18-gstack-adoption-policy.md` |
| Runtime control flow | `src/main.ts` |
| Module implementations | `src/modules.ts` |

## Module Coverage Snapshot

Stable or mostly stable:

- `1a` category lock
- `1b` title
- `1c` product images
- `1d` marketing images
- `2` structured attributes
- `4` price and base selling data
- `5` SKU data and SKU images
- `6a` buyers note
- `6b` detail images
- `7` packaging and shipping

Manual-first or isolated:

- `1e` product video
- `3` customs
- `6c` app description
- `8` other settings

## Known Limits

- The AliExpress DOM drifts; real page behavior overrides stale runbooks.
- Local Finder-based video upload on macOS is not treated as the stable primary path.
- Module `3` is detect-only/manual-gate when the page has drifted into customs compliance flows.
- Module `8` is still manual-first for low-ROI or policy-sensitive paths.
- `src/modules.ts` is still large and not fully split by control type.

## Runtime Supervision Contract

- Executor: `Codex / Playwright`
- Supervisor: `Gemini CLI`
- Gemini must remain read-only during live supervision.
- Runtime coordination files:
  - `runtime/state.json`
  - `runtime/intervention.json`

Do not assume dual browser control is allowed.
Do not assume gstack introduces a second browser runtime for this repo; role wrappers must respect the single evidence chain.
Do not treat `lessons.md` as a catch-all sink; runtime truth, phase plans, and governance decisions must stay separated.
