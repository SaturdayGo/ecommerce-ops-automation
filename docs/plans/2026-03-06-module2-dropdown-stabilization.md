# Module 2 Dropdown Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make module 2 reliably fill `品牌 / 产地 / 高关注化学品` when the label node and dropdown trigger are siblings under a larger field row container.

**Architecture:** Reproduce the current miss in a local Playwright-backed DOM fixture, then harden the label-to-field container lookup so dropdown fields use the same robust row scoping strategy as text inputs. Validate with the static fixture first, then run a real smoke flow.

**Tech Stack:** TypeScript, Playwright, Node test runner

---

### Task 1: Reproduce the dropdown miss with a local DOM fixture

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module2-dropdowns.test.ts`

**Step 1: Write the failing test**

Create a minimal static HTML page where:
- the field label is nested inside `.field-label`
- the dropdown trigger lives in sibling `.field-control`
- no fallback selectors uniquely identify the trigger

Call `fillAttributes()` and assert:
- `品牌` becomes `No Brand`
- `产地` becomes `China`
- `高关注化学品` becomes `No`

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/module2-dropdowns.test.ts`

Expected: at least one of the three selections remains `请选择`

### Task 2: Harden label-to-field container lookup

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`

**Step 1: Add a shared field-container helper**

Walk upward from the resolved label node and choose the nearest ancestor that:
- still contains the label text
- contains relevant interactive controls
- is smaller/more specific than the whole section

**Step 2: Reuse the helper in dropdown selection**

Apply it to:
- `selectBulkDropdownByLabel()`
- `selectDropdownWithOptionHintsByLabel()`

Add a `following::*` fallback for dropdown triggers when the nearest row container still misses.

### Task 3: Verify locally and against real flow

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: Run tests**

Run:
- `node --import tsx --test tests/module2-dropdowns.test.ts`
- `npm test`
- `npm run typecheck`

**Step 2: Run real smoke**

Run:
- `printf '\\n' | DEBUG_ATTRIBUTES=1 npm run smoke -- ../products/test-module5-sku-3.yaml --auto-close`

Expected:
- module 2 hit count improves beyond `3/6`
- or, if option text still mismatches platform values, logs clearly expose the option gap rather than a silent selector miss

**Step 3: Capture lesson**

Record the field-row scoping fix and rollback condition in `lessons.md`.
