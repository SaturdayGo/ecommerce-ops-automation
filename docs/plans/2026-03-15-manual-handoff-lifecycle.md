# Manual Handoff Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent stale `runtime/latest-handoff.json` from surviving into blocked, failed, or no-handoff runs.

**Architecture:** Keep the handoff artifact contract unchanged and move lifecycle decisions into a small helper. `main.ts` clears stale state at run start and delegates final pointer sync after `S5 Verify`.

**Tech Stack:** `TypeScript`, `node:test`, runtime artifacts (`runtime/state.json`, `runtime/latest-handoff.json`)

---

### Task 1: Write failing lifecycle tests

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/manual-handoff-summary.test.ts`

**Step 1: Add red tests**

Cover:
1. `null` snapshot clears a stale latest pointer
2. auto-only snapshot clears a stale latest pointer
3. manual snapshot writes fresh artifacts and latest pointer

**Step 2: Run the targeted test**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/manual-handoff-summary.test.ts
```

Expected: FAIL because lifecycle helper does not exist yet.

### Task 2: Implement lifecycle helper and wire it into main

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/manual-handoff-summary.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`

**Step 1: Add helper**

Implement a helper that:
- clears stale latest pointer on `null`
- writes fresh artifacts when manual outcomes exist
- clears latest pointer when no manual outcomes exist

**Step 2: Integrate**

- clear stale pointer at run start
- replace inline handoff branching after `S5 Verify`

### Task 3: Sync docs and lessons

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/agent-index.md`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: Update retrieval snapshot**

Make `docs/agent-index.md` match README truth.

**Step 2: Record the lifecycle lesson**

Add:
- `source`
- `relation`
- `failure_signature`
- `working_selector_or_action`
- `rollback_condition`

### Task 4: Verify

**Step 1: Run targeted tests**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/manual-handoff-summary.test.ts
```

**Step 2: Run typecheck**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
npm run typecheck
```

**Step 3: Report evidence**

Completion evidence must include:
1. verification commands
2. exit codes
3. relevant artifact/runtime paths
