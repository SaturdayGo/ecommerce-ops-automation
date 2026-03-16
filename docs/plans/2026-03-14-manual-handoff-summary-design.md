# Manual Handoff Summary Design

**Date:** 2026-03-14

**Goal:** 为半自动运行生成一份可复用的人工交接摘要，既能给人直接看，也能给后续模型直接消费。

## Problem

当前项目已经有：
- `runtime/state.json`
- `module_outcomes`
- runlog / screenshots / browser-video

但人工门禁模块仍缺一个“当前到底该由人做什么”的收口产物。结果是：
- 人工接手要自己读日志和截图
- 其他模型接手也要重新理解状态机
- 历史运行没有独立 handoff 资产

## Chosen Approach

采用 **按 run_id 落历史产物 + runtime 只放最新指针** 的双层结构。

```text
artifacts/manual-handoffs/<run_id>/
  handoff-summary.json
  handoff-summary.md

runtime/
  latest-handoff.json
```

### Why

相比只写 `runtime/`：
- 能保留历史 handoff 资产，便于复盘
- 不会覆盖上一轮人工交接记录

相比运行时临时拼接：
- 可供人和模型直接复用
- 不依赖再次解析整份 `state.json` / runlog

## Data Model

`handoff-summary.json` 是唯一事实源。

```json
{
  "version": "1.0",
  "run_id": "run-...",
  "created_at": "ISO8601",
  "mode": "modules-...",
  "status": "needs_human_handoff",
  "log_path": "runlogs/...",
  "state_snapshot_path": "runtime/state.json",
  "items": [
    {
      "module_id": "6c",
      "module_name": "APP 描述",
      "status": "manual_gate",
      "reason": "APP 描述当前为人工门禁",
      "next_action": "在当前页面手动填写 APP 描述后继续检查",
      "evidence": [
        "screenshots/app_description_manual_gate_xxx.png"
      ]
    }
  ]
}
```

### Inclusion Rule

只收录以下模块结果：
- `manual_gate`
- `detect_only`

`failed` 只有在后续明确引入“需要人工接力的失败态”时再纳入；本次不扩大语义面。

### Evidence Rule

每个 `item.evidence` 只允许放已存在的路径：
- screenshot
- runlog
- state snapshot

禁止把推理文字当证据。

## Markdown View

`handoff-summary.md` 只服务人类接手：
- 一屏读完
- 不重复 runlog 噪音
- 每个模块只回答：
  - 为什么你现在要接手
  - 你现在要做什么
  - 看哪张图

## Trigger Timing

只在以下条件成立时生成：
1. 运行结束前，`module_outcomes` 中存在 `manual_gate` 或 `detect_only`
2. 当前 run 已经具备 `run_id / log_path / state snapshot`

不在每个 checkpoint 生成，不产空文件。

## Integration Point

在 `src/main.ts` 的最终 `S5 Verify` checkpoint 之后生成 handoff 产物。原因：
- 这时 `module_outcomes` 已完整
- `after_fill` 截图已生成
- 人工马上就要接手，时机正确

## Non-Goals

本次不做：
- 自动消费 handoff 再驱动执行器
- 为 `failed` 构建人工救援流程
- 与 Gemini Supervisor 自动联动
- 改动现有模块业务逻辑

## Testing Strategy

只做三层：
1. 单元测试：从 `RuntimeStateSnapshot` 生成 JSON/Markdown
2. 单元测试：无人工项时返回 `null`，不写文件
3. 集成测试：真实 `main.ts` 写出 artifact 和 `latest-handoff.json`

## Success Criteria

满足以下全部条件才算完成：
1. 真实运行包含 `manual_gate` 时，生成：
   - `artifacts/manual-handoffs/<run_id>/handoff-summary.json`
   - `artifacts/manual-handoffs/<run_id>/handoff-summary.md`
   - `runtime/latest-handoff.json`
2. 无人工项时不生成 handoff
3. JSON 与 Markdown 内容一致
4. 不改动现有主链状态机语义
