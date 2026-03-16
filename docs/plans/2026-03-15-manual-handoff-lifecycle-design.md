# 2026-03-15 Manual Handoff Lifecycle Design

## Goal

Keep `runtime/latest-handoff.json` truthful across blocked, failed, and manual-gate runs.

## Problem

Current behavior only writes or clears the latest handoff pointer near `S5 Verify`.

That leaves a stale pointer when a new run:

1. blocks in preflight
2. fails before `S5`
3. finishes without any manual handoff

Result: operators and future agents can read the previous run's handoff artifact and mistake it for the current run.

## Options

### Option A: Clear latest pointer at run start, regenerate only at `S5`

Pros:
- Minimal contract change
- Small blast radius
- Fixes stale-pointer lie for blocked and failed runs

Cons:
- `latest-handoff.json` remains absent until a real handoff exists

### Option B: Overwrite latest pointer with a richer status object on every run

Pros:
- More explicit lifecycle state

Cons:
- Changes current artifact contract
- Higher integration risk for supervisor/docs/consumers

## Decision

Choose **Option A**.

This is the highest-ROI fix because it restores truth without redesigning the artifact format.

## Design

Add a lifecycle helper in `src/manual-handoff-summary.ts`:

- input: `RuntimeStateSnapshot | null`
- behavior:
  - `null` => clear stale `runtime/latest-handoff.json`
  - snapshot with `manual_gate/detect_only` => write fresh artifacts + latest pointer
  - snapshot without manual handoff => clear latest pointer

Integrate it in `src/main.ts`:

1. clear stale pointer when a new run starts
2. replace the inline `build/write/clear` branch after `S5 Verify`

## Non-Goals

1. No new runtime schema
2. No new supervisor behavior
3. No attempt to encode blocked/failed handoff state inside `latest-handoff.json`

## Docs Follow-Up

Sync `docs/agent-index.md` with the same module truth already stated in `README.md`:

- `4` stable
- `3` manual gate
- `6c/8` manual-first
- `1e` isolated maintenance
