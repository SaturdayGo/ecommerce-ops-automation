# Browser Video Artifacts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional Playwright browser video recording and frame extraction artifacts so failed or noisy runs can be reviewed visually without system-wide screen recording.

**Architecture:** Keep recording as a sidecar evidence channel. `main.ts` owns the run-scoped artifact directory using `run_id`, `browser.ts` receives an optional `recordVideo.dir`, and a small helper module handles path construction, ffmpeg-based frame extraction, and manifest writing. No real-time video supervision in this task.

**Tech Stack:** TypeScript, Playwright persistent context, Node fs/path/child_process, local `ffmpeg`

---

### Task 1: Add failing tests for browser-video helpers

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-video.test.ts`
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser-video.ts`

**Step 1: Write the failing test**

Cover:
- artifact config is disabled by default
- artifact config becomes deterministic when `RECORD_BROWSER_VIDEO=1`
- frame extraction uses a provided ffmpeg executable and returns generated frame paths

**Step 2: Run test to verify it fails**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/browser-video.test.ts`

Expected: FAIL because helper module does not exist yet.

### Task 2: Implement browser-video helper module

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser-video.ts`
- Test: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-video.test.ts`

**Step 1: Add config builder**

Implement:
- `getBrowserVideoArtifactsConfig(projectRoot, runId, mode, env?)`

It should produce:
- `enabled`
- `artifactRoot`
- `videoDir`
- `videoPath`
- `framesDir`
- `manifestPath`
- `frameFps`
- `extractFrames`
- `ffmpegPath`

**Step 2: Add artifact finalizers**

Implement:
- `extractVideoFrames(videoPath, framesDir, ffmpegPath, fps)`
- `writeBrowserVideoManifest(...)`

Rules:
- only run ffmpeg when extraction is enabled
- keep deterministic paths
- return frame path list

**Step 3: Run targeted test**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/browser-video.test.ts`

Expected: PASS

### Task 3: Wire recording into browser launch and main execution

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- Reference: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runlog.ts`

**Step 1: Extend `launchBrowser()`**

Add optional argument:
- `recordVideoDir?: string`

When present, pass `recordVideo.dir` to `launchPersistentContext`.

**Step 2: Bind artifacts to `run_id`**

In `main.ts`:
- build artifact config after `run_id`
- pass `videoDir` into `launchBrowser()`
- capture `page.video()` handle

**Step 3: Finalize artifacts after browser close**

After the browser is closed:
- save/copy the video to deterministic `videoPath`
- optionally extract frames
- write manifest JSON
- print artifact paths to stdout/runlog

### Task 4: Verify with real smoke run

**Files:**
- Verify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/`

**Step 1: Run tests**

Run:
- `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm test`
- `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm run typecheck`

Expected: PASS

**Step 2: Run real smoke with recording**

Run:
`cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && RECORD_BROWSER_VIDEO=1 EXTRACT_VIDEO_FRAMES=1 DEBUG_SKU_FIELDS=1 npm run smoke -- ../products/test-module5-sku-3-position.yaml --auto-close`

Expected:
- smoke exits `0`
- video artifact exists
- frame directory exists with extracted JPGs
- manifest exists

### Task 5: Capture lesson

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

Add:
- `source`
- `relation`
- `failure_signature`
- `working_selector_or_action`
- `rollback_condition`
