# Module-Scoped Testing

## Goal
把 AliExpress 自动化调试从“整链 smoke 复跑”改成“单模块隔离验证优先，整链回归后置”。

## Rules
1. 用户指定单模块时，执行器必须使用 `--module/--modules`，禁止静默回退到 `--smoke`。
2. `smoke/full` 只用于集成回归，不用于新模块首轮定位。
3. 如果目标模块有前置依赖，必须显式声明为 `bootstrap prerequisite`，不能把前置依赖伪装成“顺手一起测”。
4. 测试夹具必须最小化；与当前目标模块无关的数据留空。
5. 每个模块稳定通过后，再纳入 smoke/full。
6. 单模块调试默认走“可视监督模式”：前台浏览器可见、TTY 会话、`--keep-open`、禁止 `--auto-close`。用户实时监督优先于后台无人值守。

## MVP CLI
- `--module=1e`
- `--modules=1e,6b`

## Current Limitation
模块 1e（视频上传）在真实页面上依赖前置 UI 状态显现。若页面未渲染视频区域，必须显式声明最小 bootstrap，而不是重跑整条 smoke。
