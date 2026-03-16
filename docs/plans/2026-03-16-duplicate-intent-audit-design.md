# Duplicate-Intent Audit Design

**Context**

当前仓库已经多轮 hardening，且 `src/modules.ts` / `src/modules/shared.ts` / `src/modules/video.ts` 明确把“shared helper 双真相漂移”当成高风险。外部 [`superpowers-lab`](https://github.com/obra/superpowers-lab) 里真正对本项目有帮助的只有 `finding-duplicate-functions` 这条线，但把整套实验性 skill 插件接进仓库没有 ROI。

**Problem**

现有仓库已经有“结构测试防本地重定义”，但缺一个更上游的、可复用的审计资产：

- 哪些函数名字不同但意图相同
- 哪些 helper 正在跨文件平行生长
- 哪些区域值得在下一轮结构收缩时优先审计

如果没有这层审计，后续重构仍然会靠体感找重复，成本高，而且容易漏掉“语义重复、语法不重复”的 helper 家族。

**Options**

1. 直接接入 `superpowers-lab` 插件
   - 优点：复用现成思路
   - 缺点：引入外部 skill runtime 依赖，不符合当前仓库的确定性边界
2. 在本仓做轻量审计脚本
   - 优点：独立、可验证、可版本化，不碰主执行链
   - 缺点：只做第一阶段 catalog/report，不做 LLM 自动聚类
3. 直接把“重复 helper 检查”做成 CI 硬门
   - 优点：约束强
   - 缺点：当前证据还不够，容易先把噪音硬编码进门禁

**Recommendation**

选 `2`。

先把 `finding-duplicate-functions` 的核心价值压缩成一个本仓资产：

- 扫描 `src/`
- 提取命名函数/导出函数/方法的基础 catalog
- 用规则式 token 归一化生成“duplicate-intent 候选组”
- 输出 markdown 报告，供人审计

先给维护提供眼睛，不先给 CI 上枪。

**Scope**

本轮只做：

- 一个独立脚本，生成 duplicate-intent markdown 报告
- 一组单测，锁定最小提取/聚类行为
- 一个 npm script 入口
- 文档入口，明确它是“结构收缩前审计工具”

本轮不做：

- 不引入外部插件依赖
- 不接 LLM / API
- 不把结果接进 runtime
- 不把报告作为 CI 阻断
- 不自动删/改任何重复函数

**Proposed Files**

- Create: `scripts/duplicate-intent-audit.ts`
- Create: `tests/duplicate-intent-audit.test.ts`
- Modify: `package.json`
- Modify: `docs/automation/reusable-assets.md`
- Modify: `docs/automation/lessons.md`

**Data Flow**

```text
src/**/*.ts
  -> function extractor
  -> normalized intent tokens
  -> duplicate candidate groups
  -> markdown report
```

**Output Contract**

脚本默认输出 markdown，至少包含：

- 扫描目录
- 总函数数
- 候选组数
- 每组的归一化意图 key
- 命中的文件 + 行号 + 函数名

**Success Criteria**

1. 在 fixture/真实源码片段上能稳定提取函数定义
2. 能把明显的同意图命名（如 `findNearestFieldContainer` / `pickMostSpecificLabelNode` 这类家族）收进候选组，而不是只做字符串去重
3. 不需要接触当前脏的 `module5` 主链改动
4. 运行方式简单：`npm run audit:duplicate-intent`

**Risk Controls**

- 只读源码，不改源码
- 结果定义为“候选”，不是自动结论
- 先用测试锁定报告格式和最小聚类行为
- 若真实仓库噪音过高，只调整归一化规则，不升级成硬门
