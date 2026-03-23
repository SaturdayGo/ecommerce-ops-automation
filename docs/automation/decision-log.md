# Automation Decision Log

本文件记录**长期生效的治理决策、知识分流规则、执行口径修正**。  
它不是单次运行真相，不是 failure/recovery lesson，也不是当前 phase 的临时待办。

## 什么时候写入

满足任一条件时，追加一条：

1. 改变了仓库的执行边界
2. 改变了 source-of-truth 优先级
3. 改变了 skill / role 的调用规则
4. 改变了“哪类知识该落到哪里”的路由

## 不应该写入的内容

- 单次 run 结果 -> `runtime/*`
- 具体 failure signature / selector / rollback 条件 -> `docs/automation/lessons.md`
- 当前阶段的执行顺序 -> `docs/plans/*`
- 一次性讨论、尚无结论的想法 -> 暂不沉淀

## Knowledge Routing Rule

| 知识类型 | 主落点 | 判断标准 |
|---|---|---|
| 单次运行真相 | `runtime/state.json`, `runtime/latest-handoff.json` | 只描述本轮 run 发生了什么 |
| 可复跑的 failure / recovery invariant | `docs/automation/lessons.md` | 有 `source + relation + failure_signature + working_selector_or_action + rollback_condition` |
| 阶段计划 / 本轮顺序 | `docs/plans/*` | 只对当前 phase 生效 |
| 长期治理决策 / 执行边界 | `docs/automation/decision-log.md` | 会改变后续 agent 的执行口径 |
| 跨项目可复用资产 | `docs/automation/reusable-assets.md` | 不依赖本仓独有页面细节也有价值 |

## Entry Template

```markdown
## YYYY-MM-DD / Area / Decision Title
- source: `path-or-chat-context`
- relation: enriches | replaces | confirms | challenges
- decision: 一句话写清“现在怎么做”
- rationale: 为什么要这么定
- impact: 会影响哪些文件、流程、角色或判断口径
- review_trigger: 什么情况下这条决策需要复验或失效
```

## 2026-03-16 / Closeout / Hardening Roadmap Became Historical Record
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-16-hardening-closeout.md`
- relation: enriches
- decision: `2026-03-14-prioritized-hardening-roadmap.md` 只作为已完成 hardening 的阶段记录，不再当当前 backlog 直接执行。
- rationale: closeout、release、半自动真实主线 smoke 已完成；继续把旧 roadmap 当 active queue，会诱导后续 agent 重复已完成任务。
- impact: 当前执行顺序应以后续 maintenance / closeout 文档为准，而不是重新打开历史 hardening phase。
- review_trigger: 如果项目未来重新进入 broad hardening phase，必须新建 phase 文档，而不是复活旧 roadmap。

## 2026-03-18 / Governance / Gstack Roles Must Not Override Project Rules
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-18-gstack-adoption-policy.md`
- relation: enriches
- decision: `gstack` 在本仓库中只作为角色化流程层使用；项目规则 > process skills > gstack team roles > tool/runtime preference。
- rationale: 本仓核心风险是 false success、manual gate 漂移、双证据链分叉，不是“自动化不够完整”。
- impact: `codex-browse` / `codex-review` / `codex-document-release` / `codex-plan-eng-review` 可默认使用；`codex-qa` 只能进安全区；不允许把原版 `gstack` 第二套浏览器运行时接进主线。
- review_trigger: 如果仓库未来切到全新浏览器执行栈，或 manual gate 策略发生结构变化，必须重审这条优先级链。

## 2026-03-18 / Knowledge Routing / Lessons Are Not A Governance Sink
- source: `2026-03-18 conversation review + /Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`
- relation: enriches
- decision: `docs/automation/lessons.md` 只承接已验证的 failure/recovery invariant；治理决策、执行边界、source-of-truth 优先级改为写入本文件。
- rationale: 近期对话里的治理修正已经持续写进 plan / AGENTS / policy，但没有统一长期账本，外部观感会误读成“没有主动蒸馏”。
- impact: 以后每次 substantial 对话结束，都应先做知识分流：runtime truth -> `runtime/*`，运行经验 -> `lessons.md`，治理修正 -> `decision-log.md`，阶段策略 -> `docs/plans/*`。
- review_trigger: 如果后续发现 `decision-log.md` 开始混入一次性 run 细节或失去检索价值，应拆出更细的 governance / architecture 子账本，而不是继续堆积。

## 2026-03-19 / Skills / Default Review Stack Should Be Retro -> Eng Review -> Browse -> Review -> Docs -> Ship Gate
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/plans/2026-03-19-skills-aware-project-retro.md`
- relation: enriches
- decision: 后续对整仓做深度回顾、评估新 slice、或判断是否重开 hardening 时，默认 skill 栈使用 `codex-retro -> codex-plan-eng-review -> codex-browse -> codex-review -> codex-document-release -> codex-ship-gate`，而不是直接进入 `codex-qa`。
- rationale: 当前项目的主要风险已从模块实现转向治理质量、证据 freshness、和角色串台；先做 retro 和 engineering review，能避免把“是否该继续做”误判成“先修再说”。
- impact: `codex-qa` 保持安全区限定；`codex-team-orchestrator` 只在任务归属不清时启用；真实 seller 主线默认先做 canary / evidence capture，不跑 full test-fix loop。
- review_trigger: 如果项目未来重新进入 broad implementation phase，或真实主线出现需要立即修复的 blocking regression，才重新评估是否让 `codex-qa` 进入默认路径。

## 2026-03-23 / External Skills / Web-Access Stays Outside Main Runtime
- source: `2026-03-23 technical comparison against https://github.com/eze-is/web-access`
- relation: enriches
- decision: `web-access` 可作为项目外围研究和网页登录探索工具使用，但不进入 AliExpress 发品主线 runtime，也不替换当前 `Playwright + runtime evidence` 单栈。
- rationale: 它在搜索、网页抓取、登录态动态页、CDP 直连日常 Chrome、多站点并行探索上更强；但主线发品自动化需要的是单一浏览器栈、单一证据链、per-run truth、manual gate 与 handoff 一致，而不是更灵活的多通道浏览代理。
- impact: 允许在 repo 外围调研、平台规则查看、非主线网页登录探索中参考 `web-access` 的通道调度思路；不允许把它接进主仓的 runtime truth、handoff、或主线 canary 流程。
- review_trigger: 如果未来项目主动放弃“单一浏览器栈 + 单一证据链”原则，或决定把仓库重构为通用联网代理框架，才重新评估是否引入 `web-access`。
