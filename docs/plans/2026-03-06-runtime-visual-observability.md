# Runtime Visual Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight in-page HUD and run-scoped `events.json` so browser video segments explain what the automation is waiting for.

**Architecture:** Keep observability as a sidecar. `main.ts` checkpoint updates a DOM HUD and appends structured events to the same run-scoped browser-video artifact directory. No behavior changes to selectors or control flow.

**Tech Stack:** TypeScript, Playwright page.evaluate, Node fs/path

---

### Task 1: Add failing tests for HUD/event helpers

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-observability.test.ts`
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-observability.ts`

**Step 1: Write the failing test**

Cover:
- disabled config by default
- deterministic `events.json` path when browser-video is enabled
- event append writes ordered JSON array
- HUD payload formatter returns concise labels

**Step 2: Run test to verify it fails**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/runtime-observability.test.ts`

Expected: FAIL because helper module does not exist yet.

### Task 2: Implement runtime observability helper module

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-observability.ts`
- Test: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-observability.test.ts`

**Step 1: Add config/path helpers**

Implement:
- `getRuntimeObservabilityConfig(browserVideoArtifactRoot, env?)`
- `recordRuntimeEvent(config, event)`
- `formatHudPayload(snapshot)`

**Step 2: Run targeted test**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/runtime-observability.test.ts`

Expected: PASS

### Task 3: Wire HUD and events into main execution

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser-video.ts`
- Create/Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-observability.ts`

**Step 1: Bind observability to `run_id`**
- build observability config near browser-video config
- for every `checkpoint()` call, append structured event

**Step 2: Inject/update HUD**
- on each checkpoint, update HUD text inside the real page
- HUD shows `state/module/field/action/status`

**Step 3: Reference events in manifest**
- extend video manifest payload with `events_path`

### Task 4: Verify with tests and real smoke

**Files:**
- Verify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/`

**Step 1: Run tests**
- `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm test`
- `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm run typecheck`

**Step 2: Run real smoke**
- `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && RECORD_BROWSER_VIDEO=1 EXTRACT_VIDEO_FRAMES=1 DEBUG_SKU_FIELDS=1 npm run smoke -- ../products/test-module5-sku-3-position.yaml --auto-close`

Expected:
- `events.json` exists
- `manifest.json` references `events_path`
- video exits `0`
- HUD visible in recorded frames

### Task 5: Capture lesson

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

Add:
- `source`
- `relation`
- `failure_signature`
- `working_selector_or_action`
- `rollback_condition`
