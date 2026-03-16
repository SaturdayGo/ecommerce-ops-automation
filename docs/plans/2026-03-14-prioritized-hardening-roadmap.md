# Semi-Auto Hardening Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前项目收口成“稳定半自动主链 + 明确人工门禁”，避免继续拿过时状态和过早重构做决策。

**Architecture:** 当前最值钱的资产不是新增 fallback，而是让 `README / lessons / runtime / tests` 四层描述同一个真相。先修主链缺口和状态一致性，再做局部拆分，不做大重构。

**Tech Stack:** `TypeScript`, `Playwright`, `YAML`, runtime evidence (`state.json`, runlogs, screenshots, browser-video), manual gates

---

## 当前共识

| 模块 | 当前判断 | 说明 |
|---|---|---|
| `1a/1b/1c/1d/2/5/6a/6b/7` | 稳定 | 可作为半自动主链骨架 |
| `3` | 人工门禁 | 真实页已漂移到海关监管属性/资质信息流 |
| `4` | 稳定 | 已通过单测与真实页最小链路验证（`1a + 4`） |
| `6c/8` | 人工门禁 | 当前策略正确，不应再硬闯 |
| `1e` | 单独维护 | 仍应单模块试跑，不并入主整合 |

## 立即执行

### 1. 修正文档状态

**目标:** README 与真实运行状态一致。

**动作:**
- 模块 `3` 改为 `人工门禁`
- 模块 `4` 改为 `收口中`
- 模块 `1e` 改为 `单独维护`
- 补一条原则：`S6 Done` 不等于“全自动完成”

### 2. 给 runtime 增加模块级结果

**目标:** `runtime/state.json` 能区分：
- `auto_ok`
- `manual_gate`
- `detect_only`
- `failed`

**原因:** 当前只有全局状态，不能表达半自动策略的真实完成度。

### 3. 收口模块 4

**目标:** 让测试里的“最小计量单元 + 销售方式”与实现对齐。

**当前事实:**
- 测试已定义 [`tests/module4-pricing.test.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module4-pricing.test.ts)
- 实现仍未完整覆盖基础售卖流程

### 4. 删除临时调试垃圾

**目标:** 降低误导和噪音。

**首要对象:**
- [`tmp-module3-dump.ts`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tmp-module3-dump.ts)

## 下一阶段

### 5. 给模块 5 增加独立测试面

**原因:** SKU 是最高复杂区之一，但测试覆盖仍不成体系。

### 6. 第一刀局部拆分 `modules.ts`

**只拆两块:**
- `shared`：共享 DOM helper / label-scoped / row-scoped / manual gate
- `video`：模块 `1e` 的隔离维护区

**不做:** 全量拆成 6-7 个文件

## 暂缓项

以下方向成立，但现在不是优先级：

1. `Legacy / Modern UI Adapter`
2. `A11y Tree` 或 AI 自愈层
3. 让 Gemini + CDP 接手主执行器
4. 全面重构 `modules.ts`

## 当前推荐顺序

1. 修 README 与项目状态
2. 增加 `module_outcomes`
3. 收口模块 `4`
4. 清理临时调试文件
5. 给模块 `5` 补独立测试
6. 再做第一刀局部拆分

## 2026-03-15 修正后的下一阶段顺序

方向不变，但优先级更精确：

1. **先修运行时真相一致性**
   - `preflight blocked` 时不启动浏览器
   - `runtime/state.json` 必须落成当前 run 的 `S0 blocked`
   - 不得残留旧的 `runtime/latest-handoff.json`
   - 无人工项时不得生成 handoff
2. **再补真相层一致性测试**
   - `state.json.module_outcomes`
   - `artifacts/manual-handoffs/.../handoff-summary.json`
   - `runtime/latest-handoff.json`
   三者必须互相对得上
3. **再修路径与文档入口一致性**
   - 清理仓库内旧的全局路径引用
   - 统一到当前 canonical 全局文档路径
4. **最后继续补 stable chain 回归面**
   - 不开新模块
   - 不扩高摩擦自动化覆盖
   - 先做耗时归因，再决定继续削哪一段等待链

## 2026-03-16 执行口径修正

当前路线不变，但要补三个硬门：

1. **Stable-chain 微调必须先做归因**
   - 对 `module5` 这类已经砍掉大块 blind sleep 的模块，后续每一刀都先看真实运行证据
   - 优先证据：`runlogs` / `artifacts/browser-video/*/events.json` / 当前定向回归耗时
   - 只有在归因仍显示同一段等待链是主热点时，才继续削它
2. **收口验收物是半自动主线，不是纯自动链**
   - 收口前除了 stable auto chain，还必须再跑一轮“半自动真实主线”
   - 这轮验证必须覆盖 `3 / 6c / 8` 的 manual gate、handoff、`module_outcomes`、runtime 描述一致性
3. **Stable-chain hardening 有停损线**
   - 连续 2 个 slice 只带来小幅时延下降，且没有新增正确性覆盖、truth-layer 覆盖或真实页 canary 收益
   - 就停止 micro-hardening，转入收口验证和文档同步

## 当前活跃阶段（2026-03-16）

前 3 阶段已完成：

1. 运行时真相一致性
2. 真相层一致性测试
3. 路径与文档入口一致性

第 4 阶段已执行并触发停损线：

4. **Stable-chain regression / hardening**
   - 不开新模块
   - 不扩高摩擦自动化覆盖
   - `module5` 先做耗时归因，再决定下一刀
   - `module5` 图片树导航已切到 level markers；当前真实页上 `ancestor reuse` 路径连续 smoke `0` 命中
   - 在 smoke 出现真实 `目录层已复用` 命中前，停止继续围绕 tree reuse 做 micro-hardening
   - 截至 `run-20260316081202-856ef0`，这条 stop rule 已命中；后续不再继续磨 tree reuse

第 5 阶段已完成：

5. **收口验证**
   - stable auto chain 定向回归
   - 半自动真实主线验证
   - manual gate / handoff / runtime / README 最终一致性检查

## 收口验证结果（2026-03-16）

已完成：

1. stable auto chain 定向回归
2. 半自动真实主线 `run-20260316093829-2dc580`
3. `manual_gate / handoff / runtime` 一致性核对

关键结论：

- closeout smoke 先暴露了 `before_fill` 截图会卡在 Playwright `waiting for fonts to load` 的 runtime blocker；现已改为在截图超时时回退到 Chromium CDP capture，避免证据链因为字体等待而断掉
- closeout smoke 还暴露了 `6b` 旧实现会在日志提示“人工补充详情图”时，仍由 `main.ts` 硬记 `auto_ok`；现已改成 `fillDetailImages()` 显式返回 `ModuleExecutionResult`
- 最新半自动真实主线结果是：`1c/1d/1e/3/6c/8 -> manual_gate`，`1a/1b/2/4/5/6a/6b/7 -> auto_ok`
- 这里再次确认：README 中的“稳定 / 人工门禁 / 单独维护”是成熟度与默认策略，不是单次运行结果；单次 run 一律以 `runtime/state.json.module_outcomes` 和 `runtime/latest-handoff.json` 为准

第 6 阶段当前状态：

6. **development closeout / 文档同步 / 最终交付说明**
   - 项目内收口记录见 [`2026-03-16-hardening-closeout.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-hardening-closeout.md)
   - git 提交切片建议见 [`2026-03-16-closeout-commit-slices.md`](/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-closeout-commit-slices.md)
   - 技术收口已完成
   - 当前 git worktree 直接在 `main`，且存在并行脏改动；merge / cleanup 需要人工决定，不自动执行

## 1e 的边界（2026-03-15 修正）

`1e` 仍是单独维护模块，但不等于冻结。

允许继续做：

- 真成功判定硬化
- 商品视频区回写验证
- 证据闭环（runtime / screenshot / handoff）

不允许继续做：

- 扩张 `1e` 自动化覆盖范围
- 并回半自动主链
- 为了“看起来更自动”牺牲成功门禁

一句话：

**不扩张 `1e` 的覆盖范围，但继续收紧它的成功判定和证据闭环。**

当前维护达标条件：

- `modal hidden`
- 商品视频区已回写
- `runtime / screenshot / handoff` 三层证据一致

即使达标，`1e` 仍不并回半自动主链。

## 已完成（2026-03-14）

- README 已与运行真相同步：`3 -> 人工门禁`、`1e -> 单独维护`
- `runtime/state.json` 已落地 `module_outcomes`
- 模块 `4` 已通过：
  - `tests/module4-pricing.test.ts`
  - 真实页最小链路 `--modules=1a,4`
- 临时调试文件 `tmp-module3-dump.ts` 已删除
- 模块 `5` 已新增：
  - `tests/module5-batch-plan.test.ts`
  - `tests/module5-ui-flow.test.ts`
- 第一刀局部拆分已完成：
  - `src/modules/shared.ts`
  - `src/modules/video.ts`

## 当前执行入口（2026-03-15）

接下来直接执行两项：

1. `preflight blocked` 端到端测试
2. `latest-handoff / module_outcomes / handoff` 一致性测试

## 当前执行入口（2026-03-16）

接下来按以下顺序执行：

1. `module5` 耗时归因
2. 仅在主热点被确认后继续做 stable-chain 微调
3. 触发停损线后转入收口验证
