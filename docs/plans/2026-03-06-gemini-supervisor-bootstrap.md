# Gemini Supervisor Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bootstrap a real Gemini CLI supervision scaffold for the AliExpress automation project by adding project-local Gemini context files and runtime state/intervention templates.

**Architecture:** Keep Gemini CLI out of the browser control loop. Codex remains the executor. Gemini reads project-local context, `runtime/state.json`, `runtime/intervention.json`, logs, and screenshots, then emits structured supervision decisions. The initial implementation is a bootstrap layer only, not a full runtime integration into `src/main.ts`.

**Tech Stack:** Markdown docs, JSON config, JSON runtime contract, Node test runner (`node --import tsx --test`)

---

### Task 1: Add a bootstrap verification test

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/gemini-supervisor-bootstrap.test.ts`
- Reference: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/supervisor/gemini-supervisor-agent-template.md`
- Reference: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/supervisor/state-intervention-schema.md`

**Step 1: Write the failing test**

Write a test that asserts these files exist and are structurally valid:
- `.gemini/GEMINI.md`
- `.gemini/settings.json`
- `runtime/state.json`
- `runtime/intervention.json`

The test should parse JSON files and verify key fields such as:
- settings `context.fileName`
- state template `version`, `state.code`, `module.id`
- intervention template `version`, `decision`, `problem_class`

**Step 2: Run test to verify it fails**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/gemini-supervisor-bootstrap.test.ts`

Expected: FAIL because the bootstrap files do not exist yet.

**Step 3: Keep the test narrow**

Do not test browser behavior. This test is only for bootstrap file presence and structural sanity.

### Task 2: Create Gemini project context files

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/.gemini/GEMINI.md`
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/.gemini/settings.json`
- Reference: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/supervisor/gemini-supervisor-agent-template.md`

**Step 1: Create `.gemini/GEMINI.md`**

Include:
- supervisor-only role boundary
- allowed inputs
- forbidden actions
- key state progression target
- intervention philosophy: preserve forward progress, avoid noise

**Step 2: Create `.gemini/settings.json`**

Use a conservative settings file that:
- loads `AGENTS.md` and `GEMINI.md` as context files
- avoids experimental subagents
- defaults to a planning/read-only stance suitable for supervision

**Step 3: Keep settings minimal**

Do not add speculative or undocumented Gemini CLI settings.

### Task 3: Create runtime contract templates

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json`
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/intervention.json`
- Reference: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/supervisor/state-intervention-schema.md`

**Step 1: Create `runtime/state.json`**

Include a realistic example with:
- `version`
- `run_id`
- `updated_at`
- `project_root`
- `mode`
- `status`
- `state`
- `module`
- `target`
- `last_action`
- `next_expected_action`
- `gates`
- `anomalies`
- `evidence`

**Step 2: Create `runtime/intervention.json`**

Include a realistic example with:
- `version`
- `run_id`
- `created_at`
- `decision`
- `priority`
- `state`
- `problem_class`
- `problem`
- `root_cause`
- `instruction_for_codex`
- `fallback`
- `stop_condition`
- `confidence`
- `evidence`

**Step 3: Make examples consistent**

`run_id` and example evidence should correspond to the current project’s AliExpress workflow.

### Task 4: Verify bootstrap contract

**Files:**
- Test: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/gemini-supervisor-bootstrap.test.ts`
- Verify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/.gemini/settings.json`
- Verify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json`
- Verify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/intervention.json`

**Step 1: Run targeted test**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && node --import tsx --test tests/gemini-supervisor-bootstrap.test.ts`

Expected: PASS

**Step 2: Run full test suite**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm test`

Expected: PASS

**Step 3: Run typecheck**

Run: `cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation && npm run typecheck`

Expected: PASS

### Task 5: Document result and handoff

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: Add one bootstrap lesson**

Capture:
- `source`
- `relation`
- `failure_signature`
- `working_selector_or_action`
- `rollback_condition`

The lesson should state that Gemini supervision must remain file-based and read-only unless a future explicit architecture change is approved.

**Step 2: Report exact usage path**

The final handoff must tell the user:
- where the files live
- how to call Gemini CLI in headless mode against `runtime/state.json`
- what this bootstrap does not yet automate
