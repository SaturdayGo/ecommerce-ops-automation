# Browser Use 2.0 Pilot Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不替换现有 `Playwright + runtime evidence` 主线的前提下，验证 `Browser Use CLI 2.0` 是否适合作为 auth/session 恢复与真实页探索的旁路工具。

**Architecture:** 这不是主线迁移计划，而是旁路试点。现有主线继续作为唯一 truth source；`Browser Use 2.0` 只在独立试点里验证 `login -> publish page ready` 的稳定性、失败形状、和可观测性。所有试点结果必须能回链到现有 `runtime/*`、runlog、video 证据体系，任何时候都不允许让 Browser Use 直接接管 handoff、manual gate、或主线发品执行。

**Tech Stack:** `Browser Use CLI 2.0`, current `Playwright` stack, `runtime/state.json`, runlogs, browser video, decision log

---

## Pilot Boundary

### In Scope

1. seller login 恢复
2. `login -> publish page ready` 到达率
3. session 失效时的失败前移能力
4. 真实页 quick repro / evidence capture

### Out Of Scope

1. 不接管主线发品执行
2. 不生成 runtime truth
3. 不生成 handoff
4. 不替代 manual gate
5. 不先碰模块 `5 / 6b / 6c / 8`

## Success Criteria

试点只有在同时满足以下条件时，才允许进入下一阶段：

1. Browser Use 在 `auth/session recovery` 上的成功率不低于当前 Playwright 主线
2. 失败时能稳定暴露在 `login / publish_ready` 边界，而不是把错误拖进模块层
3. 试点不会引入第二套正式 truth source
4. 试点日志和证据能被当前仓库的文档/治理层清晰引用

## Stop Rule

出现任一情况立即停止，不扩试点范围：

1. 需要把 Browser Use 接进主线 runtime 才能证明价值
2. 需要放宽 manual gate 或 truth layer 规则
3. 连续 3 次试点都不能稳定复现 `login -> publish ready`
4. 试点只能证明“更灵活”，不能证明“更可控”

## Task 1: Lock The Trial Contract In Governance

**Files:**
- Modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/decision-log.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/decision-log.md)

**Step 1: Add a trial-only decision**

Record:

- Browser Use 2.0 is allowed only as a sidecar pilot
- current mainline runtime remains `Playwright + runtime evidence`
- no direct mainline execution replacement

**Step 2: Verify the decision is searchable**

Run:

```bash
rg -n "Browser Use 2.0|sidecar pilot|auth/session recovery|no direct mainline replacement" docs/automation/decision-log.md
```

Expected:

- pilot boundary entry exists

## Task 2: Define The Auth-Only Trial Harness

**Files:**
- Create or modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-24-browser-use-2-pilot.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-24-browser-use-2-pilot.md)
- Optionally modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/reusable-assets.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/reusable-assets.md)

**Step 1: Define one narrow trial**

Only compare:

- login restore
- seller session detection
- publish page ready detection

**Step 2: Keep metrics explicit**

Metrics:

- success rate
- median time to publish page ready
- first failure location
- evidence completeness

## Task 3: Run A/B Trial Against Current Mainline

**Files:**
- Reuse current canary profile: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/products/test-semi-auto-canary-20260323.yaml`](/Users/aiden/Documents/Antigravity/ecommerce-ops/products/test-semi-auto-canary-20260323.yaml)

**Step 1: Baseline with current Playwright mainline**

Use current verified run shape:

- `run-20260324082021-be0536`

**Step 2: Browser Use auth-only trial**

Run Browser Use only up to:

- logged in seller state
- publish page ready

Do not proceed into module fills.

**Step 3: Compare**

Compare:

- did it recover auth?
- did it reach publish page?
- where did it fail?
- what evidence did it leave?

## Task 4: Decide Whether It Earned A Bigger Role

**Files:**
- Modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/decision-log.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/decision-log.md)
- Optionally modify: [`/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-19-skills-aware-project-retro.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-19-skills-aware-project-retro.md)

**Step 1: If it succeeds**

Promote only to:

- auth/session recovery helper
- real-page exploration helper

**Step 2: If it fails**

Keep it outside mainline and record why.

## Current Recommendation

1. Do not start by replacing Playwright
2. First pilot only `auth/session recovery`
3. No module execution under Browser Use until auth-only trial wins
