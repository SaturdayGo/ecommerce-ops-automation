# 2026-03-16 Closeout Commit Slices

## Goal

在当前 `main` + mixed dirty worktree 的前提下，给这轮 hardening 提供一个可执行的提交切片方案，避免把并行改动和收口改动一把混进同一个 commit。

## Review Outcome

- 已检查 closeout 相关核心 diff：`src/browser.ts`、`src/main.ts`、`src/modules.ts`、`tests/browser-screenshot.test.ts`、`tests/module6-detail-images.test.ts`、`README.md`、`docs/automation/lessons.md`、roadmap / closeout docs
- 当前没有发现新的 closeout blocker
- 当前真实风险不在代码逻辑，而在 git 集成边界：仓库直接工作在 `main`，且存在并行脏改动

## Recommended Commit Slices

### Slice A: Runtime Truth + Closeout Blockers

目标：

- 先提交这轮最值钱、最直接降低“系统说谎”概率的修复

建议文件：

- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-screenshot.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module6-detail-images.test.ts`

包含内容：

- screenshot font-timeout -> CDP fallback
- `6b` `ModuleExecutionResult` truth contract
- `main.ts` 对 `6b` 不再硬编码 `auto_ok`

### Slice B: Runtime / Manual Gate / Truth-Layer Infrastructure

目标：

- 提交这一轮真相层和人工交接基础设施，而不是把它们埋进 UI hardening commit

建议文件：

- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/manual-handoff-summary.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/preflight.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-evidence.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-supervision.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/main-preflight-blocked.integration.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/manual-handoff-summary.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/preflight.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-evidence.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-supervision.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-truth-consistency.test.ts`

包含内容：

- `preflight blocked` 行为
- `latest-handoff` 生命周期
- `module_outcomes / handoff / latest-handoff` 一致性

### Slice C: Stable-Chain Hardening

目标：

- 单独提交这轮稳定链 hardening 和回归锁，不要和 truth-layer commit 混在一起

建议文件：

- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules/`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/image-library-navigation.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1-carousel-images.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1-marketing-images.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module2-structured-fields.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module4-pricing.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-batch-plan.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-shipping-boundary.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-sku-image-recovery.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module6-buyers-note.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module6-detail-images.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module7-shipping.test.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/modules-shared-visible.test.ts`

包含内容：

- `module5` batch / row / image / observability hardening
- `module7` signal-first waits
- `module2` dropdown drift gates
- `1c/1d/6b` 的模块级回归锁

### Slice D: Docs / Retrieval / Operator Context

目标：

- 把文档和代理入口同步独立成一刀，避免和代码逻辑 commit 纠缠

建议文件：

- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/README.md`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/AGENTS.md`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/agent-index.md`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-14-prioritized-hardening-roadmap.md`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-hardening-closeout.md`

包含内容：

- canonical 入口
- README 真相同步
- lessons 沉淀
- roadmap / closeout 记录

## Files Requiring Separate Human Judgment

以下改动不建议在没有进一步拆分前直接跟本轮 hardening 一起提交：

- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/.gitignore`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/supervisor/state-intervention-schema.md`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/execution-plan.ts`
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/execution-plan.test.ts`

原因：

- 这些文件有一部分属于更早的 agent/repo hygiene 变更
- 另一部分和当前 closeout 的最小必要集不是同一个提交理由
- 如果一把混提，commit message 会失真，后续回滚边界也会变差

## Lowest-Risk Next Step

如果要继续执行而不是停在说明层，最低风险动作是：

1. 先按 Slice A 提交 truth-layer closeout blocker 修复
2. 再提交 Slice B / C / D
3. 其余文件单独裁决，不跟本轮 closeout 绑死
