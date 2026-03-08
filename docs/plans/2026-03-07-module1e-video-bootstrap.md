# Module 1e Video Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `--modules=1e` run a minimal recent-category bootstrap before video upload so the video section can render.

**Architecture:** Keep full module `1a` untouched. Add a lightweight recent-path bootstrap helper in `modules.ts`, then invoke it from `main.ts` only when the execution plan is video-only. Lock behavior with unit tests and a visible module-only run.

**Tech Stack:** TypeScript, Playwright, node:test

---

### Task 1: Write the failing tests

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/execution-plan.test.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`

**Step 1: Add a failing execution-plan test**

Assert that a `1e`-only selection requires video category bootstrap while `1a + 1e` does not.

**Step 2: Add a failing video bootstrap integration test**

Build a DOM fixture where:
- `最近使用` reveals a `头灯总成` item
- Clicking that item reveals the video upload panel
- `fillVideo()` then completes local upload

**Step 3: Run targeted tests and confirm failure**

Run:
```bash
node --import tsx --test tests/execution-plan.test.ts tests/module1e-video.test.ts
```

Expected:
- One or more failures due to missing bootstrap helper / missing execution decision

### Task 2: Implement minimal bootstrap

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/execution-plan.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`

**Step 1: Add an execution-plan predicate**

Add a small pure helper that returns `true` when the current plan is video-only and requires minimal bootstrap.

**Step 2: Implement `bootstrapVideoCategoryFromRecent(page, data)`**

Behavior:
- Read `data.category`
- Click `最近使用`
- Select matching recent path using YAML-driven matching
- Verify only that video section is now visible
- Screenshot and return `false` on failure

**Step 3: Wire the bootstrap into `main.ts`**

Before `fillVideo(page, data)`:
- If video bootstrap is required, run it
- Do not call full `fillCategory()`

### Task 3: Update the video fixture

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/products/test-module1e-video.yaml`

**Step 1: Set category to the headlight path**

Use:
```yaml
category: "汽车及零配件 > 车灯 > 头灯总成"
```

### Task 4: Verify and document

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: Run verification**

Run:
```bash
node --import tsx --test tests/execution-plan.test.ts tests/module1e-video.test.ts
npm test
npm run typecheck
```

**Step 2: Visible module-only verification**

Run:
```bash
npm run fill -- ../products/test-module1e-video.yaml --modules=1e --keep-open
```

Expected:
- Front-end visible
- Only minimal recent bootstrap + video upload
- No module 2 / SKU / image execution

**Step 3: Update lessons**

Record:
- `source`
- `relation`
- `failure_signature`
- `working_selector_or_action`
- `rollback_condition`
