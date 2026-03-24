# Publish Ready Gate Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复真实页 `publish_ready` 假阳性，让半自动主线在登录页、空壳页、会话失效场景下尽早 fail closed，而不是把失败拖到模块填写阶段。

**Architecture:** 这一刀只收浏览器导航与状态门控契约，不碰业务模块。先用定向红测锁住两类假阳性：`login return_url` 误判成卖家后台，以及 `csp` 壳页无表单仍被视为 ready。然后在 [`src/browser.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser.ts) 做最小修复：URL 判断收紧到 host/path 级别，fallback/reload 后继续执行登录页探测，未就绪则直接报错。最后用同一条真实 canary 验证失败前移到 gate，而不是晚炸在 `1b`。

**Tech Stack:** `TypeScript`, `Playwright`, `node:test`, `tsx`, runtime evidence, runlogs, browser video

---

## Task 1: Lock The Failure Shape In Tests

**Files:**
- Modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-navigation.test.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-navigation.test.ts)

**Step 1: Write the failing tests**

Add coverage for:

- login URL contains `return_url=http://csp.aliexpress.com...` but host is still `login.aliexpress.com`
- fallback/reload still has no publish form and must reject instead of returning `publish`

**Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test tests/browser-navigation.test.ts
```

Expected:

- fail on `login return_url` false positive
- fail on unresolved `csp` shell false positive

## Task 2: Fix Browser Gate Contract Minimally

**Files:**
- Modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser.ts)
- Test: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-navigation.test.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-navigation.test.ts)

**Step 1: Implement minimal fix**

Rules:

- treat publish page as ready only when current page host/path is actually publish host/path
- if fallback or reload lands on seller login page, return `login`
- if still no form after fallback/reload and no login form, throw `发布页未就绪`

**Step 2: Run targeted verification**

Run:

```bash
node --import tsx --test tests/browser-navigation.test.ts tests/browser-visibility.test.ts tests/main-preflight-blocked.integration.test.ts
npm run typecheck
```

Expected:

- all pass
- no type errors

## Task 3: Prove The Failure Moves To The Correct Gate

**Files:**
- Reuse runtime truth outputs only
- Canary input: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/products/test-semi-auto-canary-20260323.yaml`](/Users/aiden/Documents/Antigravity/ecommerce-ops/products/test-semi-auto-canary-20260323.yaml)

**Step 1: Re-run the same semi-auto canary**

Run:

```bash
RECORD_BROWSER_VIDEO=1 RUNTIME_VISUAL_OBSERVABILITY=1 npm run smoke -- /Users/aiden/Documents/Antigravity/ecommerce-ops/products/test-semi-auto-canary-20260323.yaml --modules=1a,1b,1c,1d,2,3,4,5,6a,6b,6c,7,8 --auto-close
```

**Step 2: Verify runtime truth**

Inspect:

- [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json)
- latest runlog under [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs)
- latest browser video under [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video)

Expected:

- if session is invalid, failure happens at `S1 / auth / publish_ready` or `login`
- no more `publish_ready.passed = true` with login URL evidence
- `1b` should not become the first visible failure in this scenario

## Task 4: Sync The Verified Lesson

**Files:**
- Modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md)
- Optionally modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-19-skills-aware-project-retro.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-19-skills-aware-project-retro.md)

**Step 1: Record the real invariant**

Capture:

- login page with `return_url` must not satisfy publish-host detection
- empty `csp` shell is not a valid ready state

**Step 2: Keep docs narrow**

Do not reopen broad hardening. Document only:

- root cause
- working guard
- rollback condition

## Task 5: Leave The Next Stage Clean

**Files:**
- Modify if needed: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-19-skills-aware-project-retro.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-19-skills-aware-project-retro.md)
- Modify if needed: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/decision-log.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/decision-log.md)

**Step 1: Summarize the new stage boundary**

If the gate bug is fixed and canary now fails or pauses at auth correctly, the next meaningful phase is:

- auth/session reliability
- fresh canary cadence
- maturity recalibration from real-page evidence

**Step 2: Do not expand module scope**

No new module automation. No `1e` expansion. No broad performance work.

---

## Execution Snapshot / 2026-03-24

### Verified Outcome

- 定向回归已锁住 3 个关键契约：
  - `fallback 跳 seller login -> login`
  - `login host + csp return_url -> immediate login`
  - `csp shell 无表单 -> reject`
- fresh 半自动真实主线 canary 已重新跑通：
  - run id: `run-20260324082021-be0536`
  - runtime: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json)
  - handoff: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/latest-handoff.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/latest-handoff.json)
  - runlog: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/run-20260324082021-be0536_modules-1a-1b-1c-1d-2-3-4-5-6a-6b-6c-7-8.log`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/run-20260324082021-be0536_modules-1a-1b-1c-1d-2-3-4-5-6a-6b-6c-7-8.log)
  - video: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260324082021-be0536_modules-1a-1b-1c-1d-2-3-4-5-6a-6b-6c-7-8/browser-run.webm`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260324082021-be0536_modules-1a-1b-1c-1d-2-3-4-5-6a-6b-6c-7-8/browser-run.webm)

### Runtime Truth After Fix

- `status = completed`
- `1a/1b/1c/2/4/5/6a/7 -> auto_ok`
- `1d/3/6b/6c/8 -> manual_gate`
- latest handoff 只包含人工项，与 `module_outcomes` 一致

### Next Meaningful Stage

这刀完成后，下一阶段不该回到 broad hardening，而该转去：

1. auth/session reliability
2. fresh real-page canary cadence
3. maturity recalibration from real-page evidence
