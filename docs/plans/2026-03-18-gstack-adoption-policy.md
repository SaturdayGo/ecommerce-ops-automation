# Gstack Adoption Policy

## Goal

定义 `gstack` 在本仓库中的采用边界，避免它与现有 process skills、runtime truth contract、manual gate 策略、以及单一证据链发生冲突。

本文件不是安装说明。  
它定义的是：

- 哪些 `gstack` 角色默认允许
- 哪些只能在安全区使用
- 哪些当前阶段不进入日常主线
- 调用优先级、任务粒度、执行中切换规则

## Project Reality

本仓库不是通用 Web App，也不是“越自动越好”的产品研发流水线。

当前项目是：

- `AliExpress Seller Center` 半自动上架系统
- `YAML + Playwright + runtime evidence + manual gate`
- 高物理风险、高平台漂移、高错发成本

当前项目最重要的边界：

1. `manual_gate` 是合法完成态
2. `1e` 单独维护，不并回稳定主链
3. `3 / 6c / 8` 保持人工门禁
4. `README / runtime / handoff / lessons` 必须描述同一个真相
5. 浏览器执行和证据链必须保持单栈

## Why Gstack Helps

`gstack` 对本项目有帮助，但帮助主要来自 **角色化流程增强**，不是来自“更自动、更完整”。

本仓适合借用的能力是：

- 角色清晰的浏览器验证
- findings-first 预落地 review
- ship gate
- docs release
- 架构/失败模式前置评审

不适合原样照搬的是：

- `Boil the Lake` 的 completeness 冲动
- 对真实 seller flow 默认运行 `test -> fix -> verify`
- 第二套独立 browser runtime

## Priority Chain

后续若 `gstack` 角色与现有 skill / 项目规则冲突，按以下优先级裁决：

1. **Project rules**
2. **Process skills**
3. **Gstack team roles**
4. **Tool/runtime preferences**

### 1. Project Rules Override Everything

高于所有角色层的项目规则来源：

- [`README.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/README.md)
- [`AGENTS.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/AGENTS.md)
- [`docs/agent-index.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/agent-index.md)
- [`docs/plans/2026-03-14-prioritized-hardening-roadmap.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-14-prioritized-hardening-roadmap.md)
- [`docs/plans/2026-03-16-hardening-closeout.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-hardening-closeout.md)
- [`docs/plans/2026-03-16-post-closeout-maintenance.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-post-closeout-maintenance.md)

如果 `gstack` 某个角色建议：

- 扩大自动化覆盖
- 弱化 manual gate
- 忽略 stop rule
- 用额外浏览器栈替换当前证据链

则一律以项目规则为准，拒绝该建议。

### 2. Process Skills Override Team Roles

以下 process skills 高于 `gstack` 角色：

- [`brainstorming`](/Users/aiden/.codex/superpowers/skills/brainstorming/SKILL.md)
- [`systematic-debugging`](/Users/aiden/.codex/skills/systematic-debugging/SKILL.md)
- [`test-driven-development`](/Users/aiden/.codex/skills/test-driven-development/SKILL.md)
- [`verification-before-completion`](/Users/aiden/.codex/skills/verification-before-completion/SKILL.md)

解释：

- `gstack` 角色负责“谁来做”
- process skills 负责“怎么做才不说谎”

任何角色都不能跳过这些底层纪律。

### 3. One Primary Team Role Per Task

单个任务只允许一个主角色持有。

允许：

- `codex-browse` -> quick repro / screenshot / state check
- `codex-review` -> pre-merge findings-first review
- `codex-qa-only` -> browser QA report only
- `codex-qa` -> browser QA plus fixes in safe zones
- `codex-ship` -> release-readiness gate
- `codex-document-release` -> docs drift repair
- `codex-plan-eng-review` -> architecture / execution planning

不允许：

- 在同一任务里默认串成 `browse -> qa -> review -> ship`
- 未经明确切换就从 quick repro 升级到 full QA
- 未经 gate 就从 code change 升级到 ship

### 4. Browser Runtime Must Stay Single-Stack

本仓库的浏览器执行与证据链必须保持单一栈。

当前唯一允许的浏览器执行底层：

- [`playwright`](/Users/aiden/.codex/skills/playwright/SKILL.md)
- 项目自身的 runtime evidence 目录和输出约定

因此：

- 允许使用 [`codex-browse`](/Users/aiden/.codex/skills/codex-browse/SKILL.md)，因为它底层要求走现有 Playwright
- 不允许把原版 `gstack browse` 独立 browser daemon 当成第二套运行时接进这个项目主线

原因：

- 防止 auth state / tabs / logs / screenshots / runlogs 分叉
- 防止出现双浏览器、双证据链、双真相

## Approved Roles

### Default Allowed

这些角色默认允许进入日常主线：

1. [`codex-browse`](/Users/aiden/.codex/skills/codex-browse/SKILL.md)
2. [`codex-review`](/Users/aiden/.codex/skills/codex-review/SKILL.md)
3. [`codex-document-release`](/Users/aiden/.codex/skills/codex-document-release/SKILL.md)
4. [`codex-plan-eng-review`](/Users/aiden/.codex/skills/codex-plan-eng-review/SKILL.md)

### Conditionally Allowed

这些角色可用，但要看上下文：

1. [`codex-ship`](/Users/aiden/.codex/skills/codex-ship/SKILL.md)
2. [`codex-qa-only`](/Users/aiden/.codex/skills/codex-qa-only/SKILL.md)
3. dedicated browser auth bootstrap role
4. [`codex-retro`](/Users/aiden/.codex/skills/codex-retro/SKILL.md)
5. [`codex-team-orchestrator`](/Users/aiden/.codex/skills/codex-team-orchestrator/SKILL.md)

条件：

- 不覆盖项目规则
- 不引入第二套浏览器栈
- 不把 role recommendation 当成 runtime truth

### Restricted Roles

这些角色只能在安全区使用：

1. [`codex-qa`](/Users/aiden/.codex/skills/codex-qa/SKILL.md)

安全区定义：

- fixture
- isolated smoke
- 无真实卖家数据破坏风险的页面
- report-first / bounded-fix 的测试环境

默认禁止：

- 对真实 seller publish 主线直接跑 `test -> fix -> verify`
- 在存在 `manual_gate` 边界的模块上自动扩大修复范围

### Not Default For Current Stage

这些角色当前阶段不进入日常维护主线：

1. [`codex-plan-ceo-review`](/Users/aiden/.codex/skills/codex-plan-ceo-review/SKILL.md)
2. [`codex-plan-design-review`](/Users/aiden/.codex/skills/codex-plan-design-review/SKILL.md)
3. [`codex-design-consultation`](/Users/aiden/.codex/skills/codex-design-consultation/SKILL.md)
4. [`codex-qa-design-review`](/Users/aiden/.codex/skills/codex-qa-design-review/SKILL.md)

原因：

- 当前项目不是在找新产品方向
- 也不是在打磨自有 UI 设计系统
- 当前最值钱的是 runtime truth、manual gate、stable-chain regression、docs sync

## Task Routing Table

| Task | Primary role | Hard boundary |
|---|---|---|
| 真实页快速复现、截图、状态核对 | `codex-browse` | 不自动升级为 `codex-qa` |
| 真实卖家后台只测不改 | `codex-qa-only` | 不进入 fix loop |
| fixture / isolated smoke 测试并修复 | `codex-qa` | 不默认扩到真实 seller destructive flow |
| 新 slice 的 architecture / failure-mode / test matrix | `codex-plan-eng-review` | 不漂到 CEO/design 角色 |
| pre-merge findings-first code review | `codex-review` | findings first，不变成 ship gate |
| release-readiness / PR gate | `codex-ship` | 只给 verdict，不顺手补功能 |
| release 后 docs 漂移修复 | `codex-document-release` | 以项目 truth snapshot 为准 |
| retrospective / trend review | `codex-retro` | 不代替当前 run 的 runtime truth |

## Execution-Phase Conflict Rules

### Rule 1: Manual Gate Cannot Be “Reviewed Away”

如果某角色建议“顺手把 `3 / 6c / 8` 自动化掉”，一律拒绝。

### Rule 2: Stop Rule Cannot Be Overridden By Role Enthusiasm

如果某角色建议在已触发 stop rule 的分支上继续 micro-hardening，必须先有新的真实页证据。

### Rule 3: Ship Gate Does Not Bless Dirty Truth

`codex-ship` 只能评估 readiness，不能把：

- stale runtime
- 未验证的 browser QA
- 缺证据的 success claim

包装成可发版状态。

### Rule 4: QA Does Not Own Runtime Truth

browser QA 结果是证据的一部分，不是 runtime truth 本身。

最终 truth 仍由以下文件定义：

- [`runtime/state.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json)
- [`runtime/latest-handoff.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/latest-handoff.json)

### Rule 5: Document Release Follows Truth Snapshot

`codex-document-release` 更新文档时，必须以后者为准：

- 最新通过验证的 run
- 最新 handoff
- 最新 closeout / maintenance plan

而不是以角色本身的工作叙事为准。

## Adoption Verdict

最终结论：

- `gstack` 组合对本项目 **有帮助**
- 但帮助来自 **角色化流程增强**
- 不来自“整套哲学和 runtime 接管”

一句话：

**采纳角色，不采纳第二套浏览器栈；采纳流程分工，不采纳完整性冲动覆盖 manual gate。**
