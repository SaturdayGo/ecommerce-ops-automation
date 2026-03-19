# 2026-03-19 Skills-Aware Project Retro

## Goal

在新 skill 组已安装、项目已完成 hardening closeout 的前提下，重新回顾整仓真实状态，并明确后续应如何发挥 skill 组合，而不是让它们反过来改写项目边界。

## Project Snapshot

### What The Project Is Now

当前仓库已经不是“继续大规模 hardening”的项目，而是：

- 已完成一轮 hardening closeout
- 已发布半自动真实主线基线
- 已补上 `gstack adoption policy`
- 已补上 `decision log` 和知识分流机制

当前项目形态仍然是：

- `YAML + Playwright + runtime evidence + manual gate`
- 半自动主线
- 高风险模块保留人工门禁
- 单次运行真相只看 `runtime/*`

### Current Runtime Truth

当前最新 runtime 快照：

- [`runtime/state.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json)
  - `run_id`: `run-20260317031719-adf44a`
  - `mode`: `modules-1a-1b-2-4-5-6a-6b-7`
  - `status`: `completed`
  - `module_outcomes`: `1a/1b/2/4/5/6a/6b/7 -> auto_ok`
- [`runtime/latest-handoff.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/latest-handoff.json)
  - 当前不存在

解释：

- 最新这轮是稳定链 fixture / subset run，不是新的半自动真实主线 run
- `latest-handoff` 缺失在这里是正确行为，因为当前 run 没有人工项

### Current Git Boundary

- 当前分支：`main`
- 当前状态：本地相对 `origin/main` `ahead 1`
- 最新本地提交：`6a9fd86 docs: add governance decision log`

## What Shipped

### 1. Runtime Truth Layer Became Real

最值钱的交付不是“更自动”，而是“更诚实”：

- `module_outcomes` 成为 per-run truth
- `latest-handoff` 不再遗留 stale pointer
- `6b`、`1c/1d/1e` 这类会退人工的模块不再被硬记成全局成功

### 2. Stable-Chain Hardening Stopped At The Right Boundary

这轮工程判断最对的一点不是“修得多”，而是“停得住”：

- `module5` tree reuse 在真实页 `0` 命中后停止继续 micro-hardening
- 说明 stop rule 不是写着好看，而是真被执行了

### 3. Governance Layer Finally Exists

现在仓库已经不止有：

- `runtime truth`
- `lessons`
- `plans`

还新增了：

- [`docs/plans/2026-03-18-gstack-adoption-policy.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-18-gstack-adoption-policy.md)
- [`docs/automation/decision-log.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/decision-log.md)

这意味着仓库终于把“运行经验”和“治理决策”分开了。

## What Created Leverage

### A. Truth + Evidence + Governance 三层组合

当前整仓最强资产不是某个 selector，而是三层闭环：

1. `runtime/*` 给单次真相
2. `lessons.md` 给可复跑 invariant
3. `decision-log.md` 给长期治理口径

这套分层比继续堆自动化覆盖更值钱，也更可迁移。

### B. Manual Gate 被正名为合法完成态

一旦 `manual_gate` 被当成合法结果，项目就从“全自动幻觉”切回了真实工程：

- `3 / 6c / 8` 不再背负错误目标
- `1e` 可以单独维护，而不是反复拖累主链
- reviewer / agent / 人工接手开始看同一个真相

### C. Skills As Routing, Not Runtime Replacement

新 skill 组最有价值的用途是：

- 明确谁来做什么
- 让复盘、评审、浏览器验证、发版 gate 各归其位

而不是：

- 再搞第二套浏览器栈
- 再开一条更完整的自动修复主线

## Repeated Friction

### 1. Fresh Real-Page Canary Is Lagging Behind Governance Updates

这是当前最真实的缺口。

仓库治理层已经更新到了：

- gstack role policy
- decision log
- knowledge routing

但最新 `runtime/state.json` 仍是 `2026-03-17` 的稳定链 subset run，而不是新的半自动真实主线。  
这不构成逻辑错误，但构成**运营视角的 freshness gap**。

### 2. Module 1e Is Still The Largest Test-Time Tax

fresh full suite 里，最重的时间税明显集中在 `1e`：

- 多条用例仍在 `30s+`
- 但这些测试大多在验证“不要假成功”和“媒体中心边界”，不是在为主线扩覆盖

结论：

- `1e` 继续单独维护是对的
- 但后续若要继续优化，优先应是“测试/验证成本分层”，不是“重新并回主链”

### 3. Integration Hygiene Is Now More Important Than More Hardening

当前逻辑层已经很完整。现在更容易出问题的地方反而是：

- 本地提交没 push
- 文档层更新了，但缺 fresh canary
- 后续 agent 把 retro、plan、qa、ship 角色串台

这说明项目已经从“实现型风险”转向“治理型风险”。

## Test Health

### Fresh Verification

Command:

```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
npm test
```

Result:

- exit code: `0`
- summary: `136/136 pass`
- duration: `494724.445542ms`

Command:

```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
npm run typecheck
```

Result:

- exit code: `0`

### Interpretation

- 整仓功能回归当前是绿的
- 但全套测试总时长接近 `495s`
- 这个时延结构不是 stable chain 主线坏了，而是 `1e` 这种单独维护边界测试很重

## How To Use The New Skills On This Project

### Default Review Stack

后续做“新一轮深度回顾 / 新 slice 评估”时，默认技能栈应是：

1. [`codex-retro`](/Users/aiden/.codex/skills/codex-retro/SKILL.md)
2. [`codex-plan-eng-review`](/Users/aiden/.codex/skills/codex-plan-eng-review/SKILL.md)
3. [`codex-browse`](/Users/aiden/.codex/skills/codex-browse/SKILL.md) 仅用于真实页 canary / evidence capture
4. [`codex-review`](/Users/aiden/.codex/skills/codex-review/SKILL.md) 做 findings-first review
5. [`codex-document-release`](/Users/aiden/.codex/skills/codex-document-release/SKILL.md)
6. [`codex-ship-gate`](/Users/aiden/.codex/skills/codex-ship-gate/SKILL.md) 仅在 merge / push 前启用

### Restricted Use

- [`codex-qa`](/Users/aiden/.codex/skills/codex-qa/SKILL.md)
  - 只进 fixture / isolated smoke / 无 destructive 风险页面
- [`codex-team-orchestrator`](/Users/aiden/.codex/skills/codex-team-orchestrator/SKILL.md)
  - 只在“下一步该让谁接手”本身不清楚时用

### Not Default For Current Stage

- `codex-plan-ceo-review`
- `codex-plan-design-review`
- `codex-design-consultation`
- `codex-qa-design-review`

原因：

- 当前不是产品方向重构期
- 不是自有 UI 打磨期
- 也不是要把项目再推回“更完整自动化”的阶段

## Three Strongest Next Actions

1. 推送当前本地治理提交  
   现在 `main` 还 `ahead 1`，这是最便宜也最该先做的 integration hygiene。

2. 跑一轮 fresh 半自动真实主线 canary  
   目的不是再开 hardening，而是把治理层更新后的 runtime truth 再刷新一次。

3. 固化默认 review stack  
   后续所有“重新评估项目 / 准备新 slice / 判断要不要继续做”的任务，先走 `codex-retro -> codex-plan-eng-review`，再决定是否需要 `browse/review/ship`，不要一上来就 `qa`。

## Verdict

一句话：

**项目主线是健康的，最值钱的资产已经从模块逻辑转移到 truth/evidence/governance；新 skill 组应该增强分工与判断，而不是重启自动化野心。**
