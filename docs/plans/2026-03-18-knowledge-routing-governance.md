# Knowledge Routing Governance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给仓库补上长期治理账本，并把知识分流规则接到主要入口文档。

**Architecture:** 保持现有四类知识分层不变，只补缺失的 governance sink。`lessons.md` 继续承接 runtime invariants，`runtime/*` 继续表达单次真相，`plans/*` 继续表达阶段策略，新增 `decision-log.md` 承接长期执行口径与路由决策。

**Tech Stack:** Markdown docs, repo entry docs, retrieval-first indexing

---

### Task 1: Add governance sink

**Files:**
- Create: `docs/automation/decision-log.md`

**Step 1: Write the document skeleton**

写入用途、适用边界、知识分流表、entry template。

**Step 2: Seed initial decisions**

至少写入：
- roadmap 历史化
- gstack 采用边界
- lessons 不再承担 governance sink

### Task 2: Sync repository entry points

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/agent-index.md`

**Step 1: Add decision-log to read order and source-of-truth tables**

**Step 2: Clarify routing language**

明确：
- runtime truth 看 `runtime/*`
- failure/recovery 看 `lessons.md`
- governance 看 `decision-log.md`

### Task 3: Record portability

**Files:**
- Modify: `docs/automation/reusable-assets.md`

**Step 1: Add knowledge routing as a process asset**

说明其跨项目复用价值、适用条件、失效边界。

### Task 4: Verify retrieval wiring

**Files:**
- Verify: `README.md`
- Verify: `AGENTS.md`
- Verify: `docs/agent-index.md`
- Verify: `docs/automation/decision-log.md`
- Verify: `docs/automation/reusable-assets.md`

**Step 1: Run targeted grep**

Run:

```bash
rg -n "decision-log|Knowledge Routing|governance|lessons.md|reusable-assets" README.md AGENTS.md docs/agent-index.md docs/automation/decision-log.md docs/automation/reusable-assets.md
```

Expected:
- 所有入口都能命中新 sink

**Step 2: Check git status**

Run:

```bash
git status -sb
```

Expected:
- 只出现本次文档改动
