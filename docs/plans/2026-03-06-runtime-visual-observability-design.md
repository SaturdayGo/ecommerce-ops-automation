# Runtime Visual Observability Design

**Goal:** 让录屏中的静默等待可解释，不改动执行链语义。

**Scope:**
- 页面内 HUD：显示 `state/module/field/action/status`。
- sidecar `events.json`：记录关键状态、异常、长等待。
- 不改变现有 selector、状态机和自动化控制权。
- 不做实时 Gemini 干预，不做系统全屏录屏。

**Approaches:**
1. 只加日志：实现最轻，但视频里仍然看不懂。拒绝。
2. HUD + events sidecar：实现成本低，和当前录屏/监管架构兼容。采用。
3. HUD + DOM 高亮 + 实时帧注释：太重，先不做。

**Architecture:**
- `main.ts` 的 `checkpoint()` 负责推送高层状态到 HUD 和 `events.json`。
- 新增轻量 `runtime-observability.ts`，负责 HUD DOM 注入/更新与事件落盘。
- 先把 HUD 接到 checkpoint；后续若要更细粒度，再在模块局部动作点追加 `recordEvent()`。

**Success Criteria:**
- 录屏中任意静默段都能看到当前 `state/module/field/action`。
- 每轮 run 生成 `artifacts/browser-video/<run_id>_<mode>/events.json`。
- 现有 smoke/full 主链不回归。
