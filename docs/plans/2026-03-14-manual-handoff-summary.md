# Manual Handoff Summary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为半自动运行生成可复用的人工交接摘要资产，输出 JSON 事实源和 Markdown 人类视图，并通过 `latest-handoff.json` 暴露最新结果。

**Architecture:** 在现有 `module_outcomes + state.json + evidence` 之上新增一层纯派生产物，不改状态机语义。实现放在独立 runtime helper 中，`main.ts` 只负责在 `S5 Verify` 前后调用并落盘。

**Tech Stack:** `TypeScript`, `node:test`, existing runtime artifacts (`state.json`, runlogs, screenshots`)

---

### Task 1: 写 design 文档并固定接口

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-14-manual-handoff-summary-design.md`

**Step 1: 保存 design**

已完成。设计文档已固定：
- 产物路径
- JSON schema
- Markdown 视图
- 触发时机

### Task 2: 为 handoff 生成器写红测

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/manual-handoff-summary.test.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-supervision.test.ts`

**Step 1: 写 failing tests**

覆盖：
1. `manual_gate + detect_only` 会生成 handoff 对象
2. 只有 `auto_ok` 时不生成 handoff
3. Markdown 会包含模块、原因、下一步和证据
4. writer 会落盘 artifact 和 latest 指针

**Step 2: 运行红测**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/manual-handoff-summary.test.ts
```

Expected: FAIL，提示缺少 handoff 生成器

### Task 3: 实现 handoff 生成器

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/manual-handoff-summary.ts`

**Step 1: 写最小实现**

实现：
- `buildManualHandoffSummary(snapshot)`
- `renderManualHandoffMarkdown(summary)`
- `writeManualHandoffArtifacts(summary, projectRoot)`

**Step 2: 运行红测转绿**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/manual-handoff-summary.test.ts
```

Expected: PASS

### Task 4: 接入 `main.ts`

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`

**Step 1: 在 `S5 Verify` checkpoint 后生成 handoff**

规则：
- 只有 `module_outcomes` 含 `manual_gate / detect_only` 才生成
- 生成后把 `handoff-summary.json/.md` 路径追加到 evidence

**Step 2: 追加 runtime latest 指针**

写：
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/latest-handoff.json`

### Task 5: 回归与文档同步

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`
- Optionally modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/README.md`

**Step 1: 跑定向测试**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/manual-handoff-summary.test.ts tests/runtime-supervision.test.ts
```

Expected: PASS

**Step 2: 跑类型检查**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
npm run typecheck
```

Expected: PASS

**Step 3: 真实最小链路验证**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
RUNLOG_PATH=runlogs/20260314_manual_handoff_summary_verify.log npm run fill -- ../products/test-module6c-8-manual.yaml --modules=6c,8 --auto-close
```

Expected:
- PASS
- 生成：
  - `artifacts/manual-handoffs/<run_id>/handoff-summary.json`
  - `artifacts/manual-handoffs/<run_id>/handoff-summary.md`
  - `runtime/latest-handoff.json`

**Step 4: 更新 lessons**

记录：
- `failure_signature`
- `working_selector_or_action`
- `rollback_condition`

### Task 6: 收尾

**Step 1: fresh 验证**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/manual-handoff-summary.test.ts tests/runtime-supervision.test.ts && npm run typecheck
```

**Step 2: 输出证据**

完成声明前必须给出：
1. 运行命令
2. 退出码
3. 关键日志路径
4. 生成的 handoff 产物路径

