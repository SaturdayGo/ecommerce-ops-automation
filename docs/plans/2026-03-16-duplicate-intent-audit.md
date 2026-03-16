# Duplicate-Intent Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给仓库植入一个独立的重复意图函数审计器，用于结构收缩前发现语义重复 helper 候选，而不引入外部插件依赖或 CI 门禁。

**Architecture:** 用一个本仓 TypeScript 脚本扫描 `src/**/*.ts`，提取函数定义并做轻量 token 归一化，输出 duplicate-intent markdown 报告。先提供审计视图，不做自动修复或运行时集成。

**Tech Stack:** `TypeScript`, `tsx`, `node:test`, filesystem scanning, markdown report

---

### Task 1: Add failing tests for extraction and grouping

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/duplicate-intent-audit.test.ts`
- Test target: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/scripts/duplicate-intent-audit.ts`

**Step 1: Write the failing test**

Cover:
- extracts named functions from TS source
- groups duplicate-intent candidates by normalized tokens
- generates markdown report with file and line references

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/duplicate-intent-audit.test.ts
```

Expected: FAIL because script exports do not exist yet.

### Task 2: Implement minimal duplicate-intent audit script

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/scripts/duplicate-intent-audit.ts`

**Step 1: Write minimal implementation**

Implement:
- source scanner
- function extraction
- normalized intent key builder
- duplicate candidate grouping
- markdown renderer
- CLI entrypoint

**Step 2: Run targeted test to verify it passes**

Run:

```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/duplicate-intent-audit.test.ts
```

Expected: PASS

### Task 3: Wire npm script and docs entry

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/package.json`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/reusable-assets.md`
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`

**Step 1: Add npm entry**

Add:

```json
"audit:duplicate-intent": "tsx scripts/duplicate-intent-audit.ts"
```

**Step 2: Document why this asset exists**

Update docs to record:
- source
- relation
- failure signature
- working action
- rollback condition

**Step 3: Run script against real repo**

Run:

```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
npm run audit:duplicate-intent
```

Expected: exit `0`, markdown report printed to stdout or written to file.

### Task 4: Fresh verification

**Files:**
- Verify only

**Step 1: Run focused tests**

```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
node --import tsx --test tests/duplicate-intent-audit.test.ts tests/modules-shared-split.test.ts
```

Expected: PASS

**Step 2: Run typecheck**

```bash
cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
npm run typecheck
```

Expected: PASS

**Step 3: Record evidence**

Capture:
- command
- exit code
- report path or stdout artifact
- log path if redirected
