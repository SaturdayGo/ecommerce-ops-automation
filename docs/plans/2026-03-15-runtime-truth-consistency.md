# Runtime Truth Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把半自动系统的真相层做实，优先验证 `preflight blocked` 行为与 `module_outcomes / handoff / latest-handoff` 的一致性。

**Architecture:** 不扩功能面，只给现有运行时契约补端到端和跨产物一致性测试。必要代码改动限定在测试注入点和最小的运行时路径控制，不改业务流程语义。

**Tech Stack:** `TypeScript`, `node:test`, subprocess CLI tests, runtime artifacts (`state.json`, `latest-handoff.json`, handoff-summary`)

---

### Task 1: 写 `preflight blocked` 端到端红测

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/main-preflight-blocked.integration.test.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser.ts`

**Step 1: 写 failing test**

覆盖：
- CLI 退出码为 `1`
- `runtime/state.json` 为当前 run 的 `status=blocked` + `state.code=S0`
- 旧 `runtime/latest-handoff.json` 被清掉
- 浏览器启动 marker 不存在

**Step 2: 运行红测**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/main-preflight-blocked.integration.test.ts
```

Expected: FAIL，因为当前还缺最小测试注入点。

### Task 2: 写真相层一致性红测

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-truth-consistency.test.ts`

**Step 1: 写 failing test**

覆盖：
- `module_outcomes` 的 `manual_gate/detect_only` 条目必须出现在 handoff JSON
- `auto_ok` 条目不得混入 handoff
- `runtime/latest-handoff.json` 必须指向刚生成的 handoff artifact
- 无人工项时 latest pointer 必须不存在

**Step 2: 运行红测**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/runtime-truth-consistency.test.ts
```

Expected: FAIL，直到一致性断言被真实覆盖。

### Task 3: 以最小代码满足测试

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/browser.ts`
- Optionally modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/manual-handoff-summary.ts`

**Step 1: 增加测试注入点**

仅允许：
- `AUTOMATION_PROJECT_ROOT` 覆盖测试运行目录
- `AUTOMATION_TEST_BROWSER_LAUNCH_MARKER` 标记浏览器是否被调用

**Step 2: 保持业务语义不变**

禁止：
- 改写 preflight 判定规则
- 改 handoff schema
- 把测试逻辑渗进生产分支

### Task 4: 回归与文档

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: 跑定向验证**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/main-preflight-blocked.integration.test.ts tests/runtime-truth-consistency.test.ts
```

**Step 2: 跑相关回归**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/manual-handoff-summary.test.ts tests/runtime-supervision.test.ts
```

**Step 3: 跑类型检查**

Run:
```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
npm run typecheck
```

**Step 4: 更新 lessons**

记录：
- 为什么只测函数不够
- 为什么 truth-layer 必须跨产物校验
