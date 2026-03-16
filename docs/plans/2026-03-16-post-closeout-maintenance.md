# Post-Closeout Maintenance Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 hardening closeout 已发布的前提下，隔离并管理当前本地的新一轮维护工作，避免把已发布基线和未收口探索混成一个状态。

**Architecture:** 把当前本地工作严格拆成两条线：`Track A = module5 post-release slice`，`Track B = duplicate-intent audit asset`。两条线都必须单独验证、单独裁决，不重新打开 broad hardening。

**Tech Stack:** `TypeScript`, `Playwright`, `node:test`, `tsx`, repo docs, runlogs

---

## Baseline

当前已发布基线：

- closeout 记录：[`2026-03-16-hardening-closeout.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-hardening-closeout.md)
- release note：[`2026-03-16-hardening-closeout-release-note.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/releases/2026-03-16-hardening-closeout-release-note.md)
- truth snapshot：[`runtime/state.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json)

当前本地未收口改动只允许归入以下两条线。

## Track A / Module 5 Post-Release Slice

**Files**

- [`src/modules.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts)
- [`tests/module5-ui-flow.test.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts)

**Intent**

把 `ensureRetailPriceHeaderVisible()` 从“盲等 retail header”改成“row cells already visible 也算 ready signal”，减少单 SKU 稳定税。

**Execution Gate**

只有同时满足以下条件，才允许收口：

1. 定向测试 fresh 通过
2. 类型检查 fresh 通过
3. 至少有一条定向耗时/等待证据证明它确实减少了 `220ms` 重复等待

**Kill Condition**

若只证明“测试能过”，但没有 fresh 证据证明它仍是值得保留的 slice，就不进入下一轮 broad hardening；只裁决“提交还是放弃”。

**Current Verification Snapshot**

- `node --import tsx --test tests/module5-ui-flow.test.ts --test-name-pattern='retail-header waits'`
  - 当前实际结果：Node test 执行了整份 [`tests/module5-ui-flow.test.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts)，`7/7 pass`
  - log: [`runlogs/20260316_post_closeout_module5_retail_ready.log`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260316_post_closeout_module5_retail_ready.log)
- 关键门禁已过：
  - `fillSKUs does not keep repeated 220ms retail-header waits when row cells are already visible`
  - 单测时长：`2407.360458ms`
- 当前判断：这条 slice 已具备“单独收口或单独提交”的条件，但不自动升级成新的 broad hardening 入口

## Track B / Duplicate-Intent Audit Asset

**Files**

- [`scripts/duplicate-intent-audit.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/scripts/duplicate-intent-audit.ts)
- [`tests/duplicate-intent-audit.test.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/duplicate-intent-audit.test.ts)
- [`docs/plans/2026-03-16-duplicate-intent-audit-design.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-duplicate-intent-audit-design.md)
- [`docs/plans/2026-03-16-duplicate-intent-audit.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-duplicate-intent-audit.md)
- [`docs/automation/reusable-assets.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/reusable-assets.md)
- [`docs/automation/lessons.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md)
- [`package.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/package.json)

**Intent**

把 `superpowers-lab` 里最有价值的 `finding-duplicate-functions` 思路压缩成一个本仓维护资产，不引入外部 skill runtime，不接 CI。

**Execution Gate**

只有同时满足以下条件，才允许收口：

1. 提取/分组/报告测试 fresh 通过
2. 类型检查 fresh 通过
3. `npm run audit:duplicate-intent` fresh 可运行，并落出报告文件

**Boundary**

- 当前阶段它是 soft audit，不是阻断器
- 当前真实仓库即使跑出 `0` 个 strong candidate groups` 也不算失败
- 这条线的价值是维护视图，不是当前主链性能收益

**Current Verification Snapshot**

- `node --import tsx --test tests/duplicate-intent-audit.test.ts tests/modules-shared-split.test.ts`
  - 结果：`4/4 pass`
  - log: [`runlogs/20260316_post_closeout_duplicate_intent_tests.log`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260316_post_closeout_duplicate_intent_tests.log)
- `npm run audit:duplicate-intent -- --out runlogs/20260316_duplicate_intent_audit.md`
  - 结果：exit `0`
  - cli log: [`runlogs/20260316_post_closeout_duplicate_intent_cli.log`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260316_post_closeout_duplicate_intent_cli.log)
  - report: [`runlogs/20260316_duplicate_intent_audit.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260316_duplicate_intent_audit.md)
- 当前报告落点：`0` 个 strong candidate groups
- 当前判断：这条线已具备“作为维护资产单独收口”的条件；现阶段不应因为 `0 groups` 而强行继续扩功能

## Shared Rules

1. 不恢复 broad hardening
2. 不把 release baseline 和本地实验态混写到同一份状态描述里
3. 两条线任一条收口前，都不得声称“项目又进入新一轮主线 hardening”
4. 当前 worktree 在 `main` 上，提交前必须先做切片裁决

## Immediate Next Step

1. 先对 `Track A` 跑定向 fresh verification
2. 再对 `Track B` 跑定向 fresh verification
3. 根据结果决定：
   - 单独提交
   - 暂缓
   - 放弃某一条线

## Current Recommendation

1. `Track A` 和 `Track B` 都不要再继续扩实现面
2. 下一步只做 git 层切片裁决
3. 若提交：
   - `Track A` 单独一刀
   - `Track B` 单独一刀
