# Automation Lessons

## 2026-03-06 / Module 1a / Category Fail-Fast Gate
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_full_profile_20260306_083637.log`
- relation: enriches
- failure_signature: 类目 input 值常为空，若只看 value 会误判失败并连锁中断。
- working_selector_or_action: 类目门控改为三信号 (`value / reference checked / schema loaded`)；检测到“更换类目”弹窗时自动点 `确定`。
- rollback_condition: 若三信号放行导致后续模块连续 2 次找不到 `光线颜色` 或 SKU 区域，则恢复更严格熔断并强制人工确认类目。

## 2026-03-06 / Runtime / Smoke vs Full Profile
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_smoke_profile_20260306_083408.log`
- relation: enriches
- failure_signature: 全链路调试 token 成本高，定位慢。
- working_selector_or_action: 新增 `--smoke` 执行模块 `1/2/5`；回归再用 `full` 跑全链路。
- rollback_condition: 若 smoke 与 full 输出差异扩大（同一 YAML 关键字段结果不一致）超过 2 次，暂停 smoke-only 调试并回归 full。

## 2026-03-06 / Module 2 / Attributes Partial Automation
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_module2_enable_20260306_081825.log`
- relation: enriches
- failure_signature: 模块 2 初版“0 命中”，根因是标签定位命中大容器文本而非具体字段行。
- working_selector_or_action: 先滚到属性区锚点，再用“最短文本 + 最小容器优先”选标签；当前稳定命中 `材质/电压/适用车型`。
- rollback_condition: 如果页面属性布局改为多列虚拟化表单，且上述三项命中连续 2 次失败，回退为模块 2 人工并启用 DOM 探针重建映射。

## 2026-03-06 / Module 8 / Manufacturer & EU Linkage
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_module8_row_scope_20260306_005024.log`
- relation: enriches
- failure_signature: `⚠️ 制造商设置异常`（宽泛 `text=制造商` 选择器在动态页面误命中/不可点击）
- working_selector_or_action: 先进入 `其它设置` tab，再按“关联行”范围定位并优先点击 `欧盟责任人管理/制造商管理`；未命中时转人工，不再盲点全文本。
- rollback_condition: 如果后续页面恢复稳定的统一管理入口且 2 次可视运行都稳定命中，可替换当前人工兜底为自动点击。

## 2026-03-06 / Module 5 / Batch Fill Positioning
- source: `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close`
- relation: confirms
- failure_signature: 滚轮定位曾出现“滚到底 -> 回拉”抖动，导致定位延迟和误操作风险。
- working_selector_or_action: 批量区采用 `DOM-first` 直达策略，先定位可见 `批量填充`，再短距补偿；去除触底回拉链路。
- rollback_condition: 若页面结构变更导致 `DOM-first` 连续 2 次失败，再启用有限步数滚轮补偿，但必须保留触底即停规则。

## 2026-03-06 / Module 5 / No-Wheel SKU Anchor Reset
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V5_batch_anchor_no_wheel_20260306_085533.log`
- relation: enriches
- failure_signature: SKU 阶段仍可能因为 `mouse.wheel` 兜底出现“先触底再回拉”的迟滞，影响 `批量填充` 首次命中率。
- working_selector_or_action: SKU 路径改为“切到 `SKU价格与库存` -> 主容器 `scrollTop=0` 锚点重置 -> 禁用 wheel fallback 的容器滚动 -> 定位 `批量填充`”。
- rollback_condition: 如果 AliExpress 容器滚动实现变化，导致无 wheel 情况下连续 2 次无法暴露 `零售价/批量填充`，临时恢复 wheel fallback，但仅允许小步长并强制触底即停。

## 2026-03-06 / Runtime / YAML-Driven Safety Guard
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/p0-safety.test.ts`
- relation: enriches
- failure_signature: 测试标题与 SKU 自定义名被硬编码覆盖，且批量填充用固定模板写入真实商业字段，导致 YAML 与实际上架内容脱钩。
- working_selector_or_action: 标题与 SKU 名称统一从 YAML 解析；批量填充只写共享字段（库存/重量/长宽高），价格与货值保留逐行填写；YAML 载入前先过 Zod schema 校验。
- rollback_condition: 若某批量 SKU 场景必须共享价格/货值，且连续 2 次被逐行回填拖慢调试，再引入“显式开关控制的共享商业字段模式”，禁止默认恢复固定模板。

## 2026-03-06 / Module 2 / Dropdown Ancestor Ordering
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_module2_fix_smoke.log`
- relation: enriches
- failure_signature: `品牌/产地/高关注化学品` 的下拉明明存在，但脚本总是反复点到第一列字段；静态夹具里只填 `hazardous_chemical` 时，实际却把 `brand` 改成了 `No Brand`。
- working_selector_or_action: 不能再用 `ancestor::*[...][1]` 取“最近祖先”；XPath 这里拿到的是最外层祖先。修复为自下而上遍历 label 祖先，选最近且包含可交互控件的 field container，并优先在 row-local 可见 dropdown 内找选项，再回退全局。
- rollback_condition: 若 AliExpress 表单改成 portal 浮层 + 虚拟列表并导致 row-local 选项作用域连续 2 次失效，暂停自动选择这三个下拉，回退到 DOM 探针重建映射后再恢复。

## 2026-03-06 / Module 7 / Shipping Scope by Dimension Trio
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_module7_shipping_fix_with_skus_v4.log`
- relation: enriches
- failure_signature: 模块 7 的 `总重量` 和模块 5 的行内 `重量/长/宽/高` 同名；如果 scope 过大，就会把 `7.0` 写进 SKU 首行重量，或完全找不到模块 7 的总重量输入。
- working_selector_or_action: 先点 `包装与物流` tab；再用 `长(cm)/宽(cm)/高(cm)` 这组三联输入反推模块 7 根容器，只接受同时包含三联尺寸和额外输入/重量文本的祖先；总重量在该容器内按 label 近邻填写，尺寸优先命中 `长(cm)/宽(cm)/高(cm)`。
- rollback_condition: 如果平台移除 `长(cm)/宽(cm)/高(cm)` 占位符，或总重量行脱离同一祖先导致连续 2 次失配，停止自动写模块 7，回退为“只保留模块 5 + 模块 7 人工”，并重建物流区 DOM 探针。

## 2026-03-06 / Module 1a / Recent Button Loading Shell
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_sku2_modal_cancel_recovery_smoke.log`
- relation: enriches
- failure_signature: 发布页在标题后偶发回到“顶栏 + 转圈”壳页；如果直接用 `text=最近使用`.first() + 短超时，会误判“未找到最近使用按钮”并在类目前门熔断。
- working_selector_or_action: 类目入口改为 `pickNthVisible(text=最近使用)` 选真实可见按钮，并显式等待加载壳页恢复；若检测到 spinner / shell-like DOM，持续轮询而不是立即抛错。
- rollback_condition: 如果后续页面彻底去掉 `最近使用` 入口，或加载壳页持续超过 12s 且连续 2 次不可恢复，停止自动类目锁定，回退到人工类目确认。

## 2026-03-06 / Module 5 / SKU Image Modal Recovery
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_sku2_modal_cancel_recovery_smoke.log`
- relation: confirms
- failure_signature: SKU 图片图库弹窗可能因超时、误触取消或弹窗关闭而中断；若直接停在原地等待，会浪费已完成的前序步骤。
- working_selector_or_action: 单个 SKU 图库失败后立即重开重试一次；仍失败则跳过当前 SKU、继续后续 SKU，并在模块尾统一回补。受控注入 `INJECT_IMAGE_MODAL_CANCEL_ONCE=SKUb.jpg` 已验证 `SKU2` 首次弹窗关闭后会自动重开并完成上传。
- rollback_condition: 如果图库在重开后连续 2 次仍卡在同一目录层或同一图片名，停止自动回补该 SKU，转人工单独处理，避免整个模块反复空转。

## 2026-03-06 / Module 2 / Voltage Dropdown & Product Type Stable Gate
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_module2_voltage_producttype_smoke.log`
- relation: enriches
- failure_signature: `电压` 若按文本输入处理会触发页面联动跳动，并可能把值写到错误输入；`产品类型` 若只检查瞬时 `input.value`，会出现“看起来选中了，失焦后又掉”的假成功。
- working_selector_or_action: `电压` 必须走 label-scoped dropdown 选择，不再走文本输入；`产品类型` 点击候选后增加 `blur + 延迟 + 已提交值` 稳态校验，接受 input/value/title/aria 和行内选中显示节点中的命中。
- rollback_condition: 如果平台把 `产品类型` 改成纯 portal 组件且行内不再保留任何已提交痕迹，或 `电压` 连续 2 次无法在 label-scoped 下拉中命中，停止模块 2 的这两项自动化，转人工并重新做 DOM 探针。


## 2026-03-06 / Gemini Supervisor Bootstrap
- source: local_bootstrap_files
- relation: enriches
- failure_signature: supervision logic only existed in chat and docs; no project-local `.gemini` or `runtime` contract files were present, so Gemini CLI could not be attached deterministically.
- working_selector_or_action: keep Gemini CLI file-based and read-only; load project context from `.gemini/GEMINI.md`, use `.gemini/settings.json` for `context.fileName` + `general.defaultApprovalMode`, and exchange run state through `runtime/state.json` and `runtime/intervention.json`.
- rollback_condition: if future Gemini integration requires browser co-control or undocumented settings, stop and fall back to file-based supervision until the architecture is explicitly redesigned.


## 2026-03-06 / Runtime Supervision Integration
- source: src/main.ts + src/runtime-supervision.ts
- relation: enriches
- failure_signature: Gemini bootstrap files existed, but the executor did not emit live state snapshots during real runs, so the supervisor had no deterministic runtime hook.
- working_selector_or_action: emit `runtime/state.json` at guarded state boundaries (`S0`/`S1`/`S2`/`S3`/`S4`/`S5`/`S6`), read fresh `runtime/intervention.json` by `run_id`, and only hard-stop on `escalate` or `manual_stop`.
- rollback_condition: if runtime supervision causes state regressions or blocks the stable path, keep file emission only and disable intervention consumption until a narrower gate is designed.

## 2026-03-06 / Navigation Gate / Force Legacy Publish Shell
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_force_legacy_publish_smoke.log`
- relation: enriches
- failure_signature: 同一份 YAML 和模块 2 代码在 `ait/cn_pop` 前端稳定命中，但偶发停留在 `m_apps/product-publish-v2/pop` 新壳页时，`产地/产品类型/电压/配件位置` 会整段转人工，用户侧表现为“产品类型卡住/页面乱跳”。
- working_selector_or_action: `navigateToPublishPage()` 不能只判断“表单已渲染”；若当前 URL 命中 `m_apps/product-publish-v2/pop`，即使页面 marker 可见，也必须强制跳转到 legacy 发布页 `ait/cn_pop/item_product/product_publish?channelId=2202639` 后再放行模块执行。
- rollback_condition: 如果 AliExpress 后续下线 legacy 发布页，或强制保留在 `m_apps` 且连续 2 次无法进入 `ait/cn_pop`，停止沿用 legacy gate，改为针对新前端单独建 DOM 适配层，不再混跑两套页面。

## 2026-03-06 / Module 6a / Buyers Note Commit Events
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_next_modules_full_v2.log`
- relation: enriches
- failure_signature: 富文本编辑器 direct injection 虽然把 HTML 写进 DOM，但如果只触发 `input` 不触发 `change/blur`，平台可能把它当成半提交态；表现为“日志显示已注入，但失焦后内容不一定持久化”。
- working_selector_or_action: 在源码模式和 direct-injection 模式下，都在写入后补发 `input + change + blur` 事件；direct-injection 先 `focus()` 再写 `innerHTML`，保证更接近人工编辑结束语义。回归测试 `tests/module6-buyers-note.test.ts` 锁定了这条提交链路。
- rollback_condition: 如果后续编辑器升级为 iframe 或沙箱编辑器，导致 DOM 注入不再触发宿主框架状态更新，停止沿用 direct-injection，改回源码模式优先或转人工。

## 2026-03-06 / Runtime Supervision / Canonical Intervention Normalization
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/intervention.raw.json`
- relation: enriches
- failure_signature: Gemini CLI headless 实际落盘的 often 不是执行器契约对象，而是 wrapper (`session_id/response/stats`) 或替代字段 (`action/reason/target_state`)；执行器读 `runtime/intervention.json` 时会因为缺少 `run_id/decision/problem_class` 直接忽略。
- working_selector_or_action: 监督链路改为 `raw -> normalize -> canonical`：保留 `runtime/intervention.raw.json` 原始输出，再把 wrapper / fenced JSON / alternate schema 统一压成执行器契约写入 `runtime/intervention.json`；`readFreshIntervention()` 也同步具备归一化兜底能力。
- rollback_condition: 如果 Gemini CLI 后续稳定支持裸 schema JSON 且连续 2 次无 wrapper/替代字段，可简化脚本为直接落 canonical，但在验证前不得移除 raw 保存。

## 2026-03-06 / Runtime / Internal Runlog Mirror
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/run-20260306133955-93a506_smoke.log`
- relation: enriches
- failure_signature: 仅靠外层 `tee` 时，`state.json.evidence.log_path` 经常为空；监管器理论上能读日志，实际上拿不到稳定路径，导致监督只剩 `state.json` 摘要。
- working_selector_or_action: 执行器启动时自动创建 runlog mirror，把 `console.log/warn/error` 镜像到 `runlogs/<run_id>_<mode>.log`，并把相对路径写回 `state.json.evidence.log_path`；这样不依赖 shell 层 `tee` 也能保证监管证据闭环。
- rollback_condition: 如果未来切换到统一日志框架或外部 log collector，并能稳定回写真实路径，再移除 console mirror；在替代方案验证前不能回退到“空 log_path + 口头约定”。

## 2026-03-06 / Browser Video Sidecar Artifacts
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260306140310-62b8ed_smoke/manifest.json`
- relation: enriches
- failure_signature: Playwright persistent context 在浏览器关闭后调用 `video.saveAs()` 会报 `Target page, context or browser has been closed`，但原始随机名 `.webm` 其实已经写进 `recordVideo.dir`；错误发生在收口动作，不是录屏本身。
- working_selector_or_action: 把浏览器侧录当成 sidecar evidence。启用 `RECORD_BROWSER_VIDEO=1` 时只负责把 `recordVideo.dir` 绑定到 `run_id`；关闭后从 artifact 目录里规范化原始 `.webm` 到 `browser-run.webm`，再用 `ffmpeg` 抽帧并生成 `manifest.json`。不要在浏览器关闭后再依赖 `video.saveAs()` 做二次复制。
- rollback_condition: 如果后续 Playwright 或 Chrome channel 不再把原始 `.webm` 落到 `recordVideo.dir`，或 artifact 目录连续 2 次没有任何 `.webm` 输出，停止自动规范化，回退到只保留 before/after 截图并重新评估录屏通道。

## 2026-03-06 / Runtime Visual Observability / HUD + Events Sidecar
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260306142648-180716_smoke/events.json`
- relation: enriches
- failure_signature: 录屏中的静默等待段只看得到页面停住，无法判断当前是在模块 2 提交稳态、类目 gate，还是 SKU 阶段空转，导致复盘必须手动对秒数和 runlog，诊断成本过高。
- working_selector_or_action: 在不改执行语义的前提下，把 observability 做成 sidecar。`main.ts` 在 checkpoint 和模块开始点同步两类证据：页面左上角固定 HUD（显示 `state/module/field/action/status`），以及 run-scoped `events.json`。录屏复盘先看 HUD，再用 `events.json` 对齐精确时间点。
- rollback_condition: 如果 HUD 遮挡平台关键控件、导致点击命中率下降，或 `events.json` 连续 2 次出现写入阻塞/损坏，立即关闭 HUD 渲染，仅保留事件落盘，重新收缩可观察性范围。

## 2026-03-06 / Runtime Visual Observability / Browser-Safe HUD Script
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/screenshots/hud_probe.png`
- relation: enriches
- failure_signature: HUD 节点虽然被插入到 DOM，但 `textContent` 为空、尺寸只有 `26×22`，录屏和截图里都看不到任何状态信息。根因不是 CSS，而是 `tsx/esbuild` 会把 `page.evaluate()` 里的命名局部函数转成 `__name(...)`，浏览器上下文里没有这个 helper，导致 HUD 渲染逻辑在页面端直接抛 `ReferenceError: __name is not defined`。
- working_selector_or_action: 浏览器端 HUD 逻辑不要直接内联复杂函数到 `page.evaluate()`。改成 raw source string，通过 `new Function('hudPayload', source)` 在页面上下文执行，彻底绕开 `tsx` helper 注入；同时用回归测试锁死 `getHudEvaluateSource()` 里不得出现 `__name`。修复后，录屏关键帧能稳定看到 HUD，并在长等待阶段按阈值升为黄/红灯。
- rollback_condition: 如果后续运行环境禁用 `new Function` / eval-like 执行，或页面 CSP 让 raw source 无法运行，立即停用 HUD 注入，保留 `events.json` sidecar，并改为预注入静态脚本或更低权限的 DOM 标记方案。

## 2026-03-06 / Runtime Visual Observability / Human Status + Event Tone
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260306150054-9deace_smoke/events.json`
- relation: enriches
- failure_signature: 即便 HUD 已经可见，`Status: running` 和 `events.json` 里的裸时间戳仍然偏工程视角；Gemini 或人工复盘时还要自己推断哪一段属于“长等待告警”，事件文件本身不可直接消费。
- working_selector_or_action: HUD 的 `status` 统一做人话映射：`running -> 进行中`、`waiting_human -> 等待人工确认`、`completed -> 已完成`、`failed -> 执行失败`。`events.json` 在写入新事件时回填上一段的 `duration_ms + tone(normal|warn|alert)`，直接把长等待语义编码进证据层；例如模块 2 的长静默段现在会在事件里直接标成 `tone=alert`。
- rollback_condition: 如果后续监管器需要机器优先消费原始状态，不再依赖人话标签，则保留 `status` 原始枚举并继续只把 `status_label/tone` 作为增强字段；不得反向删除原始状态码。

## 2026-03-06 / Module 6b / Detail Images Upload Path
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_module6_detail_images_full.log`
- relation: enriches
- failure_signature: 模块 6 一直只有买家须知，没有详情图链路；即使 `detail_images` 有值，也不会进入图库。另一个隐藏风险是详情图区和模块 1/5 都存在“上传图片”按钮，如果 scope 取错，会误吸到前面模块的上传入口。
- working_selector_or_action: 新增 `resolveDetailImageLibraryPaths()`，允许 `detail_images` 同时支持完整路径和纯文件名；纯文件名时优先从 `image_dir -> carousel -> white_bg_image -> marketing_image -> skus[].image` 反推公共图库目录。上传入口定位优先锚定模块 6 的编辑器后续按钮，再回退到带 `详情描述|详情图|商品详情|描述` 文本的可见容器内 `上传图片` 按钮。单张详情图失败只重试 1 次，仍失败则记入人工补充清单，不中断模块 7/8。
- rollback_condition: 如果 AliExpress 后续把详情图区上传入口从模块 6 容器中拆出，或连续 2 次命中到模块 1/5 的“上传图片”而不是详情图区，停止自动上传详情图，转回人工上传并先做 DOM 探针重新收 scope。

## 2026-03-06 / Module 2 / Live Interaction Gate Before Fallback
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260306_live_adapt_smoke.log`
- relation: enriches
- failure_signature: 页面交互变更时，脚本会继续沿用旧 runbook 假设，例如自动补全候选列表已经变成别的选项，但脚本仍尝试 `ArrowDown/Enter` 或继续旧 fallback；用户侧表现为字段来回跳、误选、甚至看起来像死循环。
- working_selector_or_action: 下拉和自动补全在 fallback 之前，必须先读取当前真实候选面板。只要可见候选项存在且与预期 hints 完全不匹配，就立即判定 `真实交互漂移`，记录前 5 个候选文本，停止旧逻辑并转人工；不要再盲按键盘猜第一个选项。只有当候选面板为空时，才允许保守的键盘 fallback。
- rollback_condition: 如果平台后续改成“无可见候选、只能键盘触发”的新控件，且连续 2 次在无候选面板场景下无法完成提交，需要单独为该控件建新适配层，不能删除这条 live gate 去恢复盲选。

## 2026-03-07 / Runtime / Module-Scoped Test First
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260307_module1e_only_video.log`
- relation: enriches
- failure_signature: 用户要求只测单个模块时，执行器仍沿用 `--smoke => 1/2/5` 默认链路，导致视频模块调试被商品属性、SKU、图片这些已验证模块污染；等待时间和 token 成本都被无意义放大。
- working_selector_or_action: 新增 `--module/--modules` 执行计划层。只要用户指定模块，显式模块选择就覆盖 `smoke/full` 默认链路；默认调试顺序改为“单模块隔离验证优先，整链 smoke/full 后置”。集成回归只在模块稳定后再跑。
- rollback_condition: 只有当目标模块在真实页面上存在明确前置依赖、且无法通过轻量 bootstrap 满足时，才允许附带最小前置模块；不得静默回退整条 smoke 链路。

## 2026-03-07 / Tests / Playwright Long Test Isolation
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`
- relation: enriches
- failure_signature: `module1e-video.test.ts` 里多个长上传用例共享全局 `page`，导致 div-trigger 用例偶发读到错误页面状态；表象像“视频弹窗没打开”，实质是测试隔离破坏，不是生产逻辑稳定失败。
- working_selector_or_action: Playwright 长流程测试改成“每个测试自建 page、自闭环清理”；浏览器可以共享，但 `page` 绝不能共享。遇到上传/弹窗这类长用例，先怀疑测试隔离，再怀疑生产代码。
- rollback_condition: 若后续为了提速必须复用 page，只能在明确关闭并串行化测试的前提下做，并用独立回归测试锁死；否则保持每测一页。

## 2026-03-07 / Runtime / Module Tests Must Stay Visible
- source: user supervision requirement
- relation: enriches
- failure_signature: 单模块调试如果在后台 `--auto-close` 运行，用户看不到真实交互过程，执行器只能靠日志和截图事后推断；这会延迟问题发现，并把可由人工即时纠偏的错误拖成多轮重跑。
- working_selector_or_action: 单模块测试默认进入“可视监督模式”：使用前台可见 Chrome、TTY 会话、`--keep-open`、禁止 `--auto-close`。调试时由用户实时观察页面，必要时用截图指出偏差；后台自动关闭只允许用于无人值守集成回归。
- rollback_condition: 仅当任务明确声明“无人值守回归”或“批量夜跑”时，才允许回到 `--auto-close`；否则一律保持前台可见。

## 2026-03-07 / Module 1e / Video-Only Tests Need Recent Category Bootstrap
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`
- relation: enriches
- failure_signature: `--modules=1e` 把完整类目模块切掉后，视频模块会直接进入 `fillVideo()`；如果页面把「商品视频」区域挂在类目选择之后，前台表现就是“找不到上传视频按钮”，但根因其实是缺少最小类目前置，而不是视频上传控件本身失效。
- working_selector_or_action: 对 `1e-only` 单模块测试，不运行完整 `1a`，只执行最小 bootstrap：`最近使用 -> 选择 YAML 对应类目条目`。这条前置只验证视频区域出现，不验证 SKU Tab、不拉起商品属性/SKU/图片。当前实现使用 `requiresVideoCategoryBootstrap(plan)` + `bootstrapVideoCategoryFromRecent(page, data)`。
- rollback_condition: 如果后续平台改版为“视频区域不再依赖类目 recent path”，或视频上传入口在无类目状态下稳定可见，才允许移除这条 bootstrap；在验证前不得回退到“直接 `fillVideo()` 盲找按钮”。

## 2026-03-07 / Module 1e / Media Center Requires Exact Click Path
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`
- relation: enriches
- failure_signature: 视频弹窗已经切到媒体中心，也能选中目标视频并确认，但 `全部视频` 这一步没有真正命中。根因不是媒体中心分支整体失效，而是定位写得太宽，先点到了外层 pane，导致测试 fixture 看起来像“少了一步”，真实页也存在误点风险。
- working_selector_or_action: 媒体中心路径必须按用户图示的点击顺序执行：`媒体中心 -> 全部视频 -> 精确文件名卡片 -> 确定`。`全部视频` 和目标视频卡片都使用精确文本/属性定位，禁止用带 `hasText` 的宽泛容器去碰运气；视频上传按钮仍应优先锚定 `商品视频` 区域内的 `上传视频`，不要做全页全局命中。
- rollback_condition: 如果平台后续把媒体中心左侧导航改成虚拟列表、懒渲染或非文本图标入口，导致精确文本节点连续 2 次不可见，再降级为 DOM 探针 + 人工监督；不得恢复为宽泛容器盲点。

## 2026-03-07 / Module 1e / Media Center Mode Must Disable Local Fallback
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`
- relation: enriches
- failure_signature: 用户已经把视频模块策略切到“平台服务器/媒体中心选片”，但代码仍保留旧的 `媒体中心失败 -> 本地上传 fallback`。真实页结果就是一旦媒体中心没命中，又掉回 Finder / 本地上传，直接违背当前 MVP 规则。
- working_selector_or_action: 为视频模块增加显式模式 `video_selection_mode: auto | local | media_center`。当模式为 `media_center` 时，只允许执行 `媒体中心 -> 全部视频 -> 指定视频 -> 确定`；若未命中目标视频，立即截图并停在人工处理，不得回退本地上传。
- rollback_condition: 只有当用户明确切回 `auto/local`，或平台媒体中心入口本身失效到无法使用时，才允许重新打开本地上传 fallback；默认 MVP 不得隐式回退。

## 2026-03-07 / Module 1e / Media Center Card Boundary + Footer Confirm
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`
- relation: enriches
- failure_signature: 视频媒体中心里，自动化容易把标题文本节点当成“卡片”，或根本识别不到真正可选的结果项；真实页表现为标题下方蓝色高亮、左上角热点没选中、`确定` 一直灰。另一个变体是选中已成功，但最终 `确定` 按钮渲染在 modal 外层 footer，导致 `modal.locator('确定')` 直接 miss。
- working_selector_or_action: 结果卡识别改成“卡片容器优先，标题文本永不直接视为可选对象”。接受两类结果项：1) 海报卡（有预览/复制链接/时长等媒体语义）；2) 行式卡（显式文件名属性 + 选择语义）。热点点击必须优先走真实鼠标坐标，目标是卡片左上角 12%-15% 区域；成功信号只认 `已选择:1` 或 `确定` 变亮。最终确认按钮定位改成 `modal 优先 + body 全局 footer 兜底`，只取可见且可点击的 `确定/确认/OK`。
- rollback_condition: 如果平台再次改版，导致媒体中心结果项既没有显式文件名属性、也没有稳定的媒体语义，或确认按钮同时存在多个同文案候选并连续 2 次误点到页面其他区域，停止自动视频选择，回退到人工选片并先做 DOM 探针。

## 2026-03-07 / Module 1e / Media Center Confirm Is A Delayed Stable-State Gate
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`
- relation: enriches
- failure_signature: 媒体中心里目标视频已经被选中，日志也能打印 `媒体中心选中`，但代码立刻去找最终 `确定` 按钮时经常 miss；用户前台随后能看到蓝色 `确定` 出现并可点。根因不是按钮不存在，而是“选中成功”和“确认按钮稳定出现/可点击”之间有提交延迟，且 hover 浮层会干扰最终状态。
- working_selector_or_action: 选中视频后，先把鼠标移出卡片 hover 区，再轮询等待最终 `确定/确认/OK` 最多 6 秒；定位范围不能只限于 `button,[role=button]`，还要接受 footer 场景下的 `div/span` 文案节点，并向上回溯到最近可点击祖先。只有在轮询窗口结束后仍未找到，才判定为 `video_confirm_button_missing`。
- rollback_condition: 如果未来真实页验证表明确认按钮是瞬时即出、且 hover 不再影响按钮出现，再把等待窗口压缩回更短时间；在此之前不得恢复为“选中后瞬时找一次确认按钮”。

## 2026-03-07 / Module 1e / Final Confirm Is A Viewport Bottom-Right Hit Target
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260307_module1e_media_center_keep_open_v19.log`
- relation: enriches
- failure_signature: 媒体中心里视频已经成功选中，`已选择:1` 也出现，但最终蓝色 `确定` 按钮在真实页和部分夹具里既不稳定暴露为可见 DOM 按钮，也不总落在 modal 边界内；结果就是代码一直报 `video_confirm_button_missing`，用户前台却能直接看见右下角蓝色按钮。
- working_selector_or_action: 最终确认不能只靠 `modal/body` 里的 `确定/确认/OK` locator。正确兜底是：先尝试文本按钮定位；若失败，直接对视口右下角做网格扫描点击，只要 modal 关闭就判定命中。这个步骤本质上是“页面级右下角主按钮热区点击”，不是“modal 内按钮点击”。
- rollback_condition: 只有当平台后续把最终确认重新收回到稳定可见的标准 DOM 按钮，且真实页连续 2 次验证都能被文本 locator 命中，才允许移除视口右下角网格 fallback；在此之前不得回退到只扫 modal 边界的旧逻辑。
