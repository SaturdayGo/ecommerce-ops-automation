# Gemini Runtime Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the AliExpress executor to emit real runtime state snapshots and consume fresh supervisor interventions without giving Gemini direct browser control.

**Architecture:** Add a small runtime adapter module that owns `run_id`, writes `runtime/state.json` at state boundaries, reads `runtime/intervention.json` when fresh, and exposes a conservative policy to the executor. `main.ts` remains the orchestrator. No browser co-control, no autonomous code editing, no speculative runtime behavior.

**Tech Stack:** TypeScript, Node fs/path, existing `tsx` test runner, existing automation logs and screenshots

---

### Task 1: Add failing tests for runtime adapter behavior

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-supervision.test.ts`
- Reference: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json`
- Reference: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/intervention.json`

**Step 1: Write the failing test**

Cover these behaviors:
- `createRunId()` returns a non-empty run id string
- `writeRuntimeState()` writes a valid `runtime/state.json`
- `readFreshIntervention()` ignores stale or mismatched interventions
- `readFreshIntervention()` accepts a fresh matching intervention
- `shouldPauseForSupervisor()` only pauses on `escalate` or `manual_stop`

Use a temp directory for test isolation. Do not use the project runtime directory in tests.

**Step 2: Run test to verify it fails**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/runtime-supervision.test.ts`

Expected: FAIL because the adapter does not exist yet.

### Task 2: Implement runtime adapter

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-supervision.ts`
- Test: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-supervision.test.ts`

**Step 1: Add minimal types**

Include types for:
- `RuntimeStateSnapshot`
- `SupervisorIntervention`
- `RuntimePaths`

Keep them intentionally small and aligned with the schema docs.

**Step 2: Add file helpers**

Implement:
- `createRunId()`
- `getRuntimePaths(projectRoot?)`
- `writeRuntimeState(snapshot, paths?)`
- `readFreshIntervention(runId, stateUpdatedAt, paths?)`
- `shouldPauseForSupervisor(intervention)`

Rules:
- stale intervention = `created_at < state.updated_at`
- mismatched `run_id` = ignore
- invalid JSON = ignore safely
- missing file = ignore safely

**Step 3: Run targeted test**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/runtime-supervision.test.ts`

Expected: PASS

### Task 3: Wire state boundaries into `main.ts`

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- Modify if needed: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-supervision.ts`

**Step 1: Create one run id per execution**

Generate the run id at startup after argument parsing.

**Step 2: Write state snapshots at controlled checkpoints**

Emit snapshots for:
- `S0 Preflight`
- `S1 LoginReady`
- `S2 CategoryLocked`
- `S3 Module2Stable`
- `S4 SkuImagesDone`
- `S5 Verify`
- `S6 Done`
- `failed` path on catch

Keep fields minimal but useful:
- current state code/name
- module id/name/step
- last action summary
- next expected action summary
- evidence path when available

**Step 3: Consume intervention conservatively**

Before entering the next critical state:
- read fresh intervention
- log it if present
- only pause/stop on `escalate` or `manual_stop`
- continue on `observe` or `advise`
- log `intervene` but do not auto-apply browser actions yet

This is intentional. Do not introduce runtime browser co-control in this task.

### Task 4: Verify end-to-end integration

**Files:**
- Test: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-supervision.test.ts`
- Verify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- Verify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-supervision.ts`

**Step 1: Run targeted test**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/runtime-supervision.test.ts`

Expected: PASS

**Step 2: Run full test suite**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm test`

Expected: PASS

**Step 3: Run typecheck**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm run typecheck`

Expected: PASS

### Task 5: Capture lesson and operator guidance

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: Add a runtime supervision lesson**

Capture:
- `source`
- `relation`
- `failure_signature`
- `working_selector_or_action`
- `rollback_condition`

**Step 2: Final handoff must include**

- exact Gemini-readable directories
- which interventions are actionable today
- which interventions are advisory only until browser co-control is explicitly designed
