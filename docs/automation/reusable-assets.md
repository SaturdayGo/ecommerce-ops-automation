# Reusable Automation Assets

本文件只记录**已经验证过、可复用、可调用**的资产。  
不记录一次性补丁，不记录仍依赖运气的 fallback。

## 1. Runtime Assets

### 1.1 State + Supervision Contract

**文件:**
- [`runtime/state.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json)
- [`runtime/intervention.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/intervention.json)
- [`src/runtime-supervision.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-supervision.ts)

**复用价值:**
- 表达半自动状态机
- 接入 Gemini/其他诊断器
- 把“执行状态”和“监督动作”解耦

### 1.2 Evidence Sidecars

**文件/目录:**
- [`runlogs/`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs)
- [`screenshots/`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/screenshots)
- [`artifacts/browser-video/`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video)
- [`src/runtime-evidence.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-evidence.ts)

**复用价值:**
- 每次运行都有证据链
- 适合前台人工监督
- 适合模型做二次诊断

### 1.3 HUD + Events Timeline

**文件:**
- [`src/runtime-observability.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/runtime-observability.ts)
- `artifacts/browser-video/<run>/events.json`

**复用价值:**
- 把“静默等待”变成可解释状态
- 适合视频复盘
- 适合后续诊断模型先读事件，再看录屏

### 1.4 Manual Handoff Summary

**文件/目录:**
- `artifacts/manual-handoffs/<run_id>/handoff-summary.json`
- `artifacts/manual-handoffs/<run_id>/handoff-summary.md`
- [`runtime/latest-handoff.json`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/latest-handoff.json)
- [`src/manual-handoff-summary.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/manual-handoff-summary.ts)

**复用价值:**
- 把 `module_outcomes` 变成可直接交接给人的短摘要
- 给 Gemini/其他模型提供稳定的 JSON 事实源
- 保留每次 run 的历史 handoff 资产，而不是只看最新状态

## 2. Interaction Assets

### 2.1 Recent Bootstrap

**能力:**
- `最近使用 -> 对应类目`

**适用:**
- 类目前置
- 单模块测试时的最小 bootstrap

**原因:**
- 真实页面经常把后续模块挂在类目锁定之后

### 2.2 Label-scoped / Row-scoped Resolver

**能力:**
- 以标签和同一行容器回溯真实输入控件

**适用:**
- 模块 2 属性
- 模块 3 海关
- 模块 7 物流

**价值:**
- 比 placeholder roulette 更稳

### 2.3 Live Interaction Gate

**能力:**
- 先看真实候选项，再决定是否沿用旧逻辑

**价值:**
- 防止页面交互变了还盲点旧 selector
- 这是“依据真实上架情况适配”的核心资产

### 2.4 Manual Gate

**能力:**
- 显式把步骤交给人工，而不是伪装成功

**当前已落地模块:**
- `3`
- `6c`
- `8`

**价值:**
- 半自动主线成立的前提

## 3. Process Assets

### 3.1 Module-Scoped Testing

**原则:**
- 新模块先单测，不带整条链
- 前台可视，用户监督

**文件:**
- [`docs/plans/2026-03-07-module-scoped-testing.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-07-module-scoped-testing.md)

### 3.2 Evidence Before Success

**原则:**
- 没有命令、退出码、日志、可视证据，就不能宣称“已完成”

**价值:**
- 直接压制假阳性

### 3.3 Half-Auto / Half-Manual Strategy

**原则:**
- 自动化负责低风险高重复区
- 高漂移低 ROI 区显式交给人工

**价值:**
- 这是当前项目的真实 MVP，不是妥协，而是正确边界

### 3.4 Duplicate-Intent Audit

**文件:**
- [`scripts/duplicate-intent-audit.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/scripts/duplicate-intent-audit.ts)
- [`tests/duplicate-intent-audit.test.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/duplicate-intent-audit.test.ts)

**能力:**
- 扫描 `src/**/*.ts` 的函数目录
- 用轻量 token 归一化给出“重复意图候选组”
- 输出 markdown 报告，供结构收缩前人工审计

**价值:**
- 补上 “shared helper 双真相漂移” 之前的上游视图
- 让下一轮 `modules.ts` 收缩先看证据，再决定合并对象
- 借用 `finding-duplicate-functions` 的思路，但不把实验性插件 runtime 引进主仓

## 4. Candidate Reusable Hooks / Skills

下面这些已经足够成熟，可以继续固化成独立 hook/skill：

1. `Manual Gate Hook`
2. `Label-scoped Field Resolver`
3. `Media Library Selector`
4. `Recent Bootstrap Hook`
5. `Runtime Evidence Hook`
6. `Manual Handoff Summary Hook`
7. `Duplicate-Intent Audit`

## 5. 明确不应复用的东西

以下内容只能算临时补丁，不能升级为通用资产：

1. 盲扫视口右下角网格点击
2. 一次性的 XPath 漂移修补
3. 只对 legacy URL 生效的硬编码路径
4. 把 `modal hidden` 当成成功
