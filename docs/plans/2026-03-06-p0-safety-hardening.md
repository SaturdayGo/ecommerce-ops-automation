# P0 Safety Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove test-only data pollution from the listing flow, restore YAML-driven behavior, and prevent multi-SKU batch fill from silently writing wrong commercial values.

**Architecture:** Add small pure helpers for title/SKU-name resolution and shared batch-fill planning, then route browser code through those helpers. Move YAML loading onto strong schema validation so invalid payloads fail before browser execution.

**Tech Stack:** TypeScript, Playwright, Node test runner, Zod

---

### Task 1: Lock the new behavior with focused tests

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/p0-safety.test.ts`

**Step 1: Write failing tests**

Cover:
- title resolution uses YAML title rather than a hardcoded test string
- SKU custom name uses YAML `sku.name` and falls back to image basename only when missing
- multi-SKU batch planning only emits shared fields
- invalid YAML payload fails schema validation

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/p0-safety.test.ts`

Expected: import or assertion failure because helper APIs do not exist yet

### Task 2: Implement minimal pure helpers

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/types.ts`

**Step 1: Add pure helpers**

Add:
- `resolveListingTitle(data)`
- `resolveSkuCustomName(sku)`
- `deriveMultiSkuBatchPlan(data)`
- `parseProductData(raw, source)`

**Step 2: Wire runtime code through helpers**

Change:
- `fillTitle()` to use YAML title
- SKU custom name fill to use `sku.name`
- batch fill path to only fill shared fields, then continue with row-level price/declared filling
- `loadProductData()` to validate parsed YAML before returning

### Task 3: Verify and document

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/package.json`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: Add a reusable test command**

Add `test` script using Node test runner with `tsx`.

**Step 2: Run verification**

Run:
- `node --import tsx --test tests/p0-safety.test.ts`
- `npm run typecheck`

**Step 3: Capture lesson**

Record the new failure signature, working action, and rollback condition in `lessons.md`.
