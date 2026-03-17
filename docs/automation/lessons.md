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

## 2026-03-15 / Stable Chain / Module 2 Dropdown Drift Must Not Reach Keyboard Fallback
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module2-structured-fields.test.ts`
- relation: enriches
- failure_signature: 旧 lesson 已经约束了“真实候选漂移时要停手”，但如果只锁 autocomplete，不锁 dropdown 变体，后续有人仍可能在 `电压/配件位置/产地` 这类下拉字段里恢复 `ArrowDown/Enter` 盲选。日志看起来像“字段已处理”，实际只是把第一个错误候选提交进去。
- working_selector_or_action: `selectDropdownWithOptionHintsByLabel()` 在 dropdown 面板可见且所有候选都不匹配预期 hints 时，必须直接判定 `真实交互漂移`，记录候选文本，发送 `Escape` 收起面板，并把字段留给人工；禁止继续走 `ArrowDown/Enter`。回归夹具固定用 `36V/48V` 这类错误候选，显式断言键盘 fallback 计数保持 `0`。
- rollback_condition: 如果未来平台下拉变成“先按键盘才能渲染候选”的新交互，不要删除这条 drift gate；先补能区分“候选尚未渲染”与“候选已漂移”的新探针，再决定是否恢复受限键盘触发。

## 2026-03-15 / Stable Chain / Module 5 SKU Image Recovery Must Preserve Later Rows And Final Retry
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-sku-image-recovery.test.ts`
- relation: enriches
- failure_signature: 真实 run 已经证明“图库中断后能恢复”，但如果没有独立回归锁住，后续很容易退化成两种坏结果之一：要么某个 SKU 连续失败后直接中断整个模块，要么只做当前行重试却不在模块尾回补。两种情况都会让后续 SKU 白白卡住，或者把失败行悄悄丢掉，形成“流程继续了但图片并不完整”的假成功。
- working_selector_or_action: `fillSKUImages()` 必须遵守固定恢复顺序：单行先重开重试一次；仍失败则记录 deferred item，继续后续 SKU；模块收尾阶段再对 deferred item 重试一次。为避免测试重新跑真实图库，允许像 `6b` 一样注入 `selectImageFromLibraryFn` 测试替身，但默认运行语义仍然走现有 `selectImageFromLibrary()`。
- rollback_condition: 如果未来 SKU 图片上传被改成整批多选或完全不同的媒体控件，不要保留这条“逐行 immediate retry + final retry”假设；先补新的控件级回归，再调整恢复策略。

## 2026-03-15 / Stable Chain / Module 5 Hidden SKU Tab Bootstrap Must Be Signal-Based, Not Blind Sleep
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-sku-image-recovery.test.ts`
- relation: enriches
- failure_signature: 当 SKU 区域默认折叠在 `SKU价格与库存` tab 后面时，旧逻辑既可能因为 tab 定位太脆而根本没点开，也可能在点开后无脑 `sleep 1800ms + 500ms`。前者会直接让 `fillSKUImages()` 报“未找到图片上传按钮”，后者即使最终成功也会把稳定模块拖进无意义长等待。
- working_selector_or_action: `ensureSkuSectionVisible()` 必须先用更鲁棒的 `SKU价格与库存` 交互节点定位把 tab 点开，再改成“信号到就放行”的等待：只要 `主色系下拉 / 光线颜色 / SKU grid` 任一信号变为可见，就立即继续；不得再保留固定长睡眠。回归夹具显式断言：隐藏 panel 能被打开，上传按钮能命中，且 `waitForTimeout` 不得出现 `>=1000ms` 的固定等待。
- rollback_condition: 如果未来平台把 SKU 区域改成完全无 tab 的单页懒加载，不要保留这条 tab bootstrap 假设；先补新的显式加载信号，再调整 `ensureSkuSectionVisible()`，禁止恢复 blind sleep。

## 2026-03-15 / Stable Chain / Module 5 Batch Happy Path Must Not Depend On Long Fixed Page Sleeps
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- relation: enriches
- failure_signature: 在测试夹具里，`SKU价格与库存`、`批量填充` modal、以及行内 grid 都是同步响应的，但 `fillSKUs()` 仍保留 `420/400/350/500ms` 这类固定 `page.waitForTimeout()`。这种等待不会提高命中率，只会把 happy path 回归时间线性拖长，掩盖真正的热点。
- working_selector_or_action: 模块 5 的固定 page sleeps 必须只保留短稳态 waits；一旦已有信号等待覆盖，就把长等待删掉或压到 `<300ms`。本轮已把 `resetSkuTabAnchor`、主色系选择、批量填充进入/提交后的几处 blind sleep 收缩，并用回归断言 `waitForTimeout` 最大值必须 `<300ms`。这条测试过绿但总时长仍高，说明后续瓶颈已转移到 locator/polling，而不是显式 sleep。
- rollback_condition: 如果未来真实页再次出现“点击后 DOM 信号延迟可见”的新控件，不要直接把固定 sleep 加回去；先补控件级可见信号或 committed-value probe，再决定是否增加受限短等待。

## 2026-03-16 / Stable Chain / Module 5 Contenteditable Row Fill Must Not Probe Missing Focused Inputs
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- relation: enriches
- failure_signature: 单 SKU contenteditable grid 在功能上已经写成功了 `价格/货值/库存`，但函数收尾仍会去读 `page.locator('input:focus').first().inputValue()`。当页面根本没有 focused input 时，Playwright 会在这一步吃满默认 action timeout，表现为“日志已经全绿、测试却还要再卡几十秒”；三格累计后就是分钟级空耗。
- working_selector_or_action: 这种 fallback 不能再走 Playwright action API。改成页面内即时 probe：直接读取 `document.activeElement`，只有它真的是 `input/textarea` 时才检查 `value`；否则立即返回 `false`，再走 cell text / committed value 验证。红测固定用单 SKU + contenteditable-only grid，要求总耗时 `<15s`；修复后该场景已从约 `94s` 降到 `5s` 级。
- rollback_condition: 如果未来真实页再次依赖“动态聚焦 input[rowindex]”作为唯一提交信号，不要恢复 `input:focus.inputValue()` 这类高成本 probe；先补一个“focused input 真存在时才读值”的轻量 guard，再决定是否增加更强验证。

## 2026-03-16 / Stable Chain / Visible Locator Picking Must Not Re-Probe Every Candidate In Hot Paths
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/modules-shared-visible.test.ts`
- relation: enriches
- failure_signature: `pickNthVisible()` 旧实现对每个候选都跑一次 `isVisible({ timeout: 100 })`。单次看起来不重，但它被模块 5 的批量按钮、批量 modal、dropdown、grid cell 等多处热路径反复调用后，会把“已经没有 blind sleep 的 happy path”重新拖成 locator/polling 风暴。
- working_selector_or_action: 可见元素选择优先走单次 DOM pass：用 `locator.evaluateAll()` 在页面内一次性找出第 `n` 个真正可见的节点，再回到 `locator.nth(index)`；只有 DOM pass 不可用时才回退逐项 `isVisible` 探针。这样保留原语义和 fallback，同时砍掉热路径里的 N 次 Playwright action 往返。
- rollback_condition: 如果后续某类复杂 portal/virtualized 控件出现“DOM 看起来可见但 Playwright 仍不可交互”的反例，不要直接删掉 DOM pass；先补针对该控件的回归，再把 fallback 收窄到那类控件，而不是恢复全局 N×probe。

## 2026-03-16 / Stable Chain / Empty Scroll Container Evaluate Must Not Eat The Default 30s Action Timeout
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-sku-image-recovery.test.ts`
- relation: enriches
- failure_signature: `fillSKUImages()` 的 hidden-tab 场景里，日志看起来只做了 `SKU tab -> 上传图片`，但真正的 `selectImageFromLibraryFn` 要到 `30s+` 才被调用。根因不是图库、不是随机等待，而是 `ensureSkuSectionVisible()` 在不存在的主滚动容器上直接 `locator.evaluate()`，空 locator 吃满了 Playwright 默认 action timeout。
- working_selector_or_action: 对主滚动容器这类“可能不存在”的节点，先判定 `count/visible`，再决定是否 `evaluate/scroll`。不要把“空 locator 也没关系，反正 catch 掉”当成无成本操作；在热路径里它等于一颗隐藏的 `30s` 地雷。回归门禁不只看 `waitForTimeout`，还要看上传流本身必须在几秒内真正启动。
- rollback_condition: 如果后续页面重新引入稳定的 `#ait-layout-content` 或其他主容器，不要恢复对空 locator 的裸 `evaluate()`；先补一个“容器存在时才滚动”的 helper，再复用到其他模块，避免把 30s timeout 复制到更多热路径。

## 2026-03-16 / Stable Chain / Module 7 Immediate-Ready Shipping Must Not Pay Random Delay Tax
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module7-shipping.test.ts`
- relation: enriches
- failure_signature: 物流区 DOM 已经完整可见、输入框也已 ready 时，`fillShipping()` 仍会在 `scrollIntoViewIfNeeded()` 后和模块结尾各付一次 `randomDelay()`。结果不是更稳，而是把 immediate-ready 场景从应有的秒级拖成 `2.7s+`，纯属时间税。
- working_selector_or_action: 对 `fillShipping()` 这类稳定模块，滚到目标区和字段填写完成本身已经是信号，不要再无条件加随机抖动。仅在真实需要等 UI 二次渲染的节点上保留受限等待；immediate-ready DOM 必须直接往下执行。回归门禁锁定总耗时 `<2.5s`。
- rollback_condition: 如果未来物流模块改成点击 tab 后还会延迟注入字段，先补“字段可见/可编辑”信号等待，再考虑加局部短等待；不要恢复模块级 `randomDelay()`。

## 2026-03-16 / Stable Chain / Module 7 Shipping Tab Must Wait On Field Signals, Not A Fixed 350ms
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module7-shipping.test.ts`
- relation: enriches
- failure_signature: 物流区挂在 tab 后面时，`openShippingTab()` 一点击就固定 `waitForTimeout(350)`。这在 hidden-tab fixture 里虽然最终能过，但属于无差别时间税；字段已经立即出现时，仍白白等满 350ms。
- working_selector_or_action: tab 打开后先看物流字段信号是否已到位，再决定是否给一小段 fallback。具体信号只认 `重量/长/宽/高` 这些输入本体可见；不要再用模块级固定等待去赌 DOM 注入时序。回归门禁锁住 `waitForTimeout` 最大值必须 `<300ms`。
- rollback_condition: 如果未来平台把物流 tab 切换改成多段异步渲染，先补更具体的“字段 ready”信号，而不是把 `350ms/500ms` 这类固定等待塞回 `openShippingTab()`。

## 2026-03-16 / Stable Chain / Shared Bulk Input Fill Must Probe Commit Before Paying A 120ms Wait
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module7-shipping.test.ts`
- relation: enriches
- failure_signature: `fillBulkInputByLabel()` 在 input 已经同步回显目标值时，仍然每个字段都固定 `waitForTimeout(120)` 再去读 `inputValue/value`。对物流模块这种四字段连续填写的稳定路径，这会白白叠出 `480ms` 稳定税，而且这条 helper 还会传染到模块 2。
- working_selector_or_action: 共享 input helper 应该先 probe 一次 committed value；只有第一次 probe 没看到目标值时，才付那 `120ms` 的短等待再复查。这样既保留了慢控件兜底，又不让 immediate-echo 的 input 每次都交时间税。
- rollback_condition: 如果后续某个控件变成“填完立即读不到值，但 120ms 后稳定回写”的唯一变体，不要把固定等待恢复成无条件；先把该控件单独圈进特定 fallback，再保留共享 helper 的 probe-first 行为。

## 2026-03-16 / Stable Chain / Module 5 Contenteditable Cell Commit Must Probe Cell Text Before Paying 180ms
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- relation: enriches
- failure_signature: `fillSkuCellValue()` 在 contenteditable grid 已经把值同步写进 cell text 时，仍然固定 `waitForTimeout(180)` 再去查 `rowindex input / focused input`。单行三格就是额外 `540ms`，而且这些等待完全不是为了真实稳定性，只是因为 probe 顺序写反了。
- working_selector_or_action: 对 contenteditable cell，提交后先 probe `rowindex input`、`focused input`，再直接看 cell text；只有这三路都没看到 committed value 时，才付 `180ms` fallback 等待。不要把“文本已回写”的成功状态拖到 sleep 之后才认。
- rollback_condition: 如果未来真实页改成“cell text 先显示旧值，只有 180ms 后才稳定回写”的特殊组件，不要恢复全局固定等待；先把那类组件单独识别出来，再在局部补受限 fallback。

## 2026-03-16 / Truth Layer / Stable Modules Must Return Explicit Manual Gate Results Instead Of Letting main.ts Assume auto_ok
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/run-20260316024942-e7388b_smoke.log`
- relation: enriches
- failure_signature: 真实 smoke 里，`1d` 明明打印“未找到上传按钮”，`1e` 明明打印“视频确认后弹窗仍未关闭，转人工”，但 `runtime/state.json.module_outcomes` 仍把它们记成 `auto_ok`。同类风险也出现在 `1c`：轮播图一旦让人手动多选，旧逻辑依旧会沿着 `main.ts -> markModuleOutcome('auto_ok')` 把失败伪装成成功，直接污染 handoff 和后续 agent 判断。
- working_selector_or_action: 不能再让稳定模块用 `Promise<void>` 默默 `return`。像 `1c/1d/1e` 这种“通常稳定，但允许在真实页降级到人工”的模块，必须显式返回 `ModuleExecutionResult { status, evidence, screenshotPaths }`；`main.ts` 只根据模块返回值写 `module_outcomes`，并把截图路径同时追加到 `capturedScreenshotPaths` 和 outcome evidence。这样 `runtime/state.json`、`handoff-summary.json`、`runtime/latest-handoff.json` 才会一起说真话。
- rollback_condition: 如果后续某个模块重新被验证为“绝无人工降级分支”，不要直接删掉结果契约；先跑一轮真实页 canary 证明它确实只会 `auto_ok`，再考虑把返回值压回更窄的成功路径。

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

## 2026-03-10 / Module 1e / Modal Closed Is Not Success
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module1e-video.test.ts`
- relation: enriches
- failure_signature: 视频弹窗在最终确认后会消失，但商品视频区仍保持空白上传占位；旧逻辑把 `modal hidden` 直接记成 `✅ 视频上传完成`，形成假阳性。
- working_selector_or_action: 视频模块的最终成功门禁必须升级为 `modal hidden + 商品视频区已回写`。实现上先等待弹窗关闭，再轮询检查商品视频区是否出现视频预览/封面/文件名等绑定证据；如果不能证明已回写，就截图并转人工，禁止打印成功。
- rollback_condition: 只有当平台后续明确提供稳定的绑定完成事件或可直接读取的 DOM 状态，才允许缩短这条回写验证；在此之前不得恢复为“弹窗关闭即成功”。

## 2026-03-10 / Module 6c / APP Description Is An Explicit Manual Gate
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- relation: enriches
- failure_signature: `6c APP 描述` 之前只存在于 YAML 和 README backlog，既不在执行计划里，也不会在运行时显式提醒，结果就是集成时看起来像“自动化已覆盖模块 6”，实际这块完全漏掉。
- working_selector_or_action: 把 `6c` 加入执行计划与模块别名，但当前策略明确设为人工门禁：若 `app_description` 有值，执行器只负责在正确时机提示人工进入 APP 详情描述编辑器，并落截图证据；不再让它隐形缺席。
- rollback_condition: 只有当 APP 详情描述的新页面/拖拽编辑链路被单独验证为可稳定自动化后，才允许把 `6c` 从人工门禁升级为自动模块；在验证前不得再次隐藏回 backlog。

## 2026-03-10 / Module 8 / Association Flows Are Manual Gates
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`
- relation: enriches
- failure_signature: 模块 8 旧逻辑在“欧盟责任人 / 制造商未关联”时还会继续点 `管理` 入口，把主链拖进低 ROI、高漂移的新页面；结果是明知不稳还继续闯，和半自动策略相反。
- working_selector_or_action: 模块 8 只保留低风险项自动化（如库存扣减）；对欧盟责任人 / 制造商，只检测“是否已关联”。未关联或未找到时，直接记录日志、截图并转人工，不再主动点击任何 `管理` 入口。
- rollback_condition: 只有当欧盟责任人 / 制造商的完整关联流程被单独验证为可稳定自动化，且连续 2 次真实页通过，才允许恢复自动进入管理页；在此之前不得回退到“先点进去再说”的旧逻辑。

## 2026-03-09 / Module 6a / Buyers Note Template Must Resolve From Repo Root First
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module6-buyers-note.test.ts`
- relation: enriches
- failure_signature: 买家须知模板传的是 `templates/foo.html` 这种仓库内相对路径，但模块按 `src/../../` 去解，结果会跳到仓库外层目录；表现是日志报 `模板文件不存在`，编辑器内容为空。
- working_selector_or_action: 相对模板路径优先按自动化仓库根目录解析，其次兼容旧的上层目录布局，最后再兜底 `process.cwd()`；绝对路径保持直通。不要把 `buyers_note_template` 绑死到作者本机目录。
- rollback_condition: 只有当模板资产被统一迁到单一外部目录并且调用方全部切到绝对路径，才允许移除多候选解析；在此之前不得回退到单一路径假设。

## 2026-03-09 / Runtime / Screenshot Evidence Must Be Bound Into State Snapshots
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/main.ts`
- relation: enriches
- failure_signature: 运行前后明明已经截图，但 `runtime/state.json` 的 `evidence.screenshot_paths` 一直是空数组。结果就是“证据存在”和“状态机声明有证据”脱钩，监督层看不到真实截图链。
- working_selector_or_action: `screenshot()` 必须返回实际产物路径，主执行流在 `before_fill / after_fill / error` 这些门禁点把路径归一化为相对仓库路径并累积写回每个 checkpoint。状态快照和日志产物必须引用同一批证据。
- rollback_condition: 只有当 runtime 监督层改成直接读取截图目录索引、完全不再依赖 `state.json` 内联证据时，才允许移除这条回填；在此之前不得恢复为空数组占位。

## 2026-03-12 / Module 3 / Customs Needs Label-scoped Fallback, Not Placeholder Roulette
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module3-customs.test.ts`
- relation: enriches
- failure_signature: 海关信息区并不总给 `placeholder`，有些布局只有“海关编码 / HS Code”标签和旁边的输入框。旧逻辑只赌 `input[placeholder*="海关"|"HS"]`，结果就是日志写着“未找到海关编码输入框，可能已有默认值”，实际该填的 HS code 根本没写进去。
- working_selector_or_action: `fillCustoms()` 先试 placeholder，再回退到 label-scoped 定位：接受 `海关编码 / HS编码 / HS Code / HS code` 文本，并从 label 或同一行容器里回溯出最近的 `input/textarea`，找到后清空并写入 HS code。
- rollback_condition: 如果平台后续把海关字段改成 Select / 复合控件，或标签文本完全脱离输入行导致上述 label-scoped XPath 连续 2 次失配，停止沿用当前输入框策略，转人工并先做 DOM 探针重建控件类型。

## 2026-03-12 / Module 3 / Compliance Tab Drifted Into Qualification Flow, So Customs Must Manual-Gate
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260312_module3_minimal_real_v4.log`
- relation: enriches
- failure_signature: 真实页点击顶部 `合规信息` 后，页面不再出现 `海关编码 / HS Code` 输入，而是进入 `海关监管属性 / 资质信息 / 关联欧盟责任人` 流。旧逻辑会把这种漂移误报成“未找到输入框，可能已有默认值”，让模块 3 看起来还能自动，实际上已经失效。
- working_selector_or_action: 模块 3 先切到顶部 `合规信息` tab；如果仍找不到 HS 输入，再检测 `海关监管属性 / 资质信息 / 关联欧盟责任人` 这些新流特征词。一旦命中，立即截图并明确记录 `模块 3 转人工处理`，不要继续伪装成默认值路径。
- rollback_condition: 只有当真实发布页再次出现稳定可写的 HS 输入，或找到新的海关填写入口并连续 2 次真实验证通过，才允许把模块 3 从人工门禁恢复为自动填写；在此之前不得再宣称“基本可用”。

## 2026-03-14 / Runtime / Docs Must Match Operational Truth
- source: `cross-review synthesis from model-b and model-c`
- relation: enriches
- failure_signature: README、runbook、lessons、runtime 状态如果不一致，就会导致后续模型和维护者基于错误前提继续执行，例如把 `人工门禁` 误当 `基本可用`，或把 `单独维护模块` 误当主链模块。
- working_selector_or_action: 项目规划必须显式区分 `稳定 / 收口中 / 人工门禁 / 单独维护` 四种状态；`S6 Done` 不得再被解释为“全自动完成”。README、roadmap、runtime 结构至少要共享同一套模块成熟度语义。
- rollback_condition: 只有当 runtime 已提供更细粒度的 `module_outcomes`，并且 README 能自动从运行时生成时，才允许减少手动同步；在此之前不得让文档与运行时分叉。

## 2026-03-14 / Module 4 / SKU Tab Anchor Must Not Assume Site-specific Scroll Containers
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module4-pricing.test.ts`
- relation: enriches
- failure_signature: 模块 4 单测会直接挂在 `fillPricingSettings()` 里，看起来像“价格逻辑卡死”，实际根因是 `resetSkuTabAnchor()` 默认假设页面一定有 `#ait-layout-content / #ait-microapp-content / .layout-content-container` 这类站点滚动容器。测试夹具没有这个容器时，代码会在 `scroller.evaluate(...)` 上悬空等待，导致后续 `SKU价格与库存` tab 根本没打开。
- working_selector_or_action: SKU tab 锚点和零售价 header 定位都必须先解析“主滚动容器是否存在”；若不存在，立即降级到 `window.scrollTo/window.scrollBy`，不要把站点专用容器假设写死成通用逻辑。同时，文本 tab/header 定位不要再用 `text=A, text=B` 这种不稳写法，改成 `locator('text=A').or(locator('text=B'))`。
- rollback_condition: 只有当滚动容器解析被统一封装成站点级 adapter，且所有测试夹具与真实页都共享同一解析层时，才允许移除当前的 window-level fallback；在此之前不得恢复对站点专用 scroll container 的强依赖。

## 2026-03-14 / Module 4 / Dropdown Helpers Must Recognize Bare role=option Overlays
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module4-pricing.test.ts`
- relation: enriches
- failure_signature: 下拉框明明已经弹出，测试页也能看到 `role=\"option\"` 的选项，但 helper 一直报告“未找到计量单元选择器/销售方式选择器”。根因不是字段定位失败，而是选项选择器只认识 `.next-overlay-wrapper / .ait-select-dropdown / .next-menu` 这类站点样式容器，完全忽略了裸 `div[role=\"option\"]` overlay。
- working_selector_or_action: 所有 dropdown helper 的可见选项集合必须把 `[role=\"option\"]:visible` 和 `[role=\"listbox\"] [role=\"option\"]` 作为通用兜底，站点 class selector 只作为优化层，而不是唯一真相。这样测试夹具和真实页都能共享一套更通用的控件类型识别。
- rollback_condition: 只有当项目正式引入控件级 adapter，并把不同 UI 壳页的 dropdown option 容器统一映射到同一抽象层后，才允许收紧这些通用 `role=option` fallback；在此之前不得回退到只认站点样式类名。

## 2026-03-14 / Module 5 / Batch Fill Plan Must Only Carry Shared Fields
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-batch-plan.test.ts`
- relation: confirms
- failure_signature: 多 SKU 批量路径最容易在后续修补中重新混入逐行商业字段（零售价、货值），形成“自动化成功但价格写错”的高风险假阳性。
- working_selector_or_action: `deriveMultiSkuBatchPlan()` 的测试面必须锁死四条语义边界：库存只在全部 SKU 一致时输出；重量和尺寸只在正值且完整时输出；任一尺寸缺失就整组不批量；价格和货值永远不能进入 batch plan。
- rollback_condition: 若未来有人想让批量填充承载价格/货值，必须先证明平台 UI 和业务规则允许共享商业字段，并新增独立测试；在此之前禁止修改这条保护。

## 2026-03-14 / Runtime / module_outcomes Is The Truth Layer For Semi-Auto Runs
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json`
- relation: confirms
- failure_signature: 只看全局 `S6 Done` 会把“自动完成”“人工门禁后继续”“仅检测未填写”混成同一结果，监督层和复盘都会失真。
- working_selector_or_action: `runtime/state.json` 必须持久化 `module_outcomes`，每个模块至少记录 `id/name/status/evidence`。真实浏览器运行后要验证它确实落盘，而不是只在单元测试里存在。本轮最小真实链路已验证 `6c/8` 会正确落成 `manual_gate`。
- rollback_condition: 若未来改状态机或执行计划，必须保留 `module_outcomes` 这一层；不能再次退回“全局完成态代表一切”的简化做法。

## 2026-03-14 / Refactor / First-Cut shared + video Split Must Be Protected By Structural Tests
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/modules-shared-split.test.ts`
- relation: enriches
- failure_signature: `modules.ts` 和 `modules/video.ts` 同时保留同名 helper 时，后续修复会只落到其中一处，形成“video 流修了、主模块旧 helper 还在跑”的双真相状态。表面测试可能还绿，但真实行为会开始漂移。
- working_selector_or_action: 第一刀拆分只抽 `shared` 和 `video`，并用结构测试锁住“共享 helper 只能从 `src/modules/shared.ts` 导入、不能继续在 `modules.ts` 本地定义”。拆分后至少回归 `modules-shared-split`、`module1e-video-module-split` 和一组目标模块定向测试。
- rollback_condition: 如果共享 helper 抽取后导致 `module1e-video`、`module4-pricing`、`module5-batch-plan` 或 `runtime-supervision` 回归失败，不要继续扩大拆分范围；先把失败 helper 退回单点抽取模式，再逐个家族迁移。

## 2026-03-14 / Module 5 / Row Fill Must Treat Empty contenteditable As A Real Editor
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- relation: enriches
- failure_signature: 模块 5 在更接近真实 UI 的 grid fixture 中，批量共享字段能成功，但逐行价格/货值一直报 `未找到第 N 行价格输入框 / 货值输入框`。真实根因不是 cell 定位失败，而是空的 `contenteditable` 编辑节点不满足旧版 `input:visible` 路径，导致行内编辑分支根本没启动。
- working_selector_or_action: SKU grid 的逐行填写必须先判断“cell 内是否存在编辑节点”，再判断它是不是传统可见 input。只要存在 `[contenteditable="true"], input, textarea`，就允许进入编辑分支；对 `contenteditable` 优先用 DOM 写值并触发 `input/change/blur`，再回退键盘输入。验证仍以 committed value / cell text 为准。
- rollback_condition: 如果未来真实页要求只能通过键盘事件提交，不要删除这条 DOM-write fallback；改为在写值后补更硬的提交动作与最终校验。禁止退回“只认可见 input”的旧逻辑。

## 2026-03-14 / Module 4 / Small Real-Page Verification Is Enough To Promote Status
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260314_module4_minimal_real.log`
- relation: confirms
- failure_signature: 模块 4 之前一直停在“收口中”，原因不是持续失败，而是缺少一轮最小真实页验证，导致 README 和 roadmap 只能保守描述，后续决策会继续把它当成未完成模块。
- working_selector_or_action: 对“表单级 but 非高风险”的模块，不必等整条主链回归后再升级状态；跑一轮最小 bootstrap 即可。本轮用 `--modules=1a,4` 验证 `最近使用 -> 尾灯总成` 后，`fillPricingSettings()` 在真实页稳定完成了 `最小计量单元 + 销售方式`，足以把模块 4 从“收口中”升级为“稳定”。
- rollback_condition: 如果后续真实页再次出现“销售方式未命中/下拉漂移/最小计量单元回退默认值”，立即把模块 4 降回“收口中”，不要继续沿用当前稳定声明。

## 2026-03-14 / Runtime / Manual Handoff Summary Must Resolve Tokens To Real Evidence
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/manual-handoffs/run-20260314100758-37ba83/handoff-summary.json`
- relation: enriches
- failure_signature: 只从 `module_outcomes` 直接生成 handoff 时，`items` 虽然能列出 `manual_gate` 模块，但 `evidence` 会变成空数组。根因不是 handoff schema 错，而是 `module_outcomes.evidence` 当前很多是 token（如 `app_description_manual_gate`），而真实截图路径只存在于 `state.evidence.screenshot_paths`；如果模块内截图不回传到 runtime 证据层，摘要就会变成没有图的空壳。
- working_selector_or_action: 人工交接摘要必须建立在两层解析上：先把 manual gate 截图路径从模块函数回传给 `main.ts` 并追加到 `capturedScreenshotPaths`，再由 `buildManualHandoffSummary()` 用 token 去解析真实 screenshot path。最终产物固定落在 `artifacts/manual-handoffs/<run_id>/handoff-summary.json/.md`，`runtime/latest-handoff.json` 只保留最新指针。
- rollback_condition: 如果未来 `module_outcomes.evidence` 直接升级为完整路径，允许简化 token 解析逻辑；但在那之前，禁止再生成“有人工模块但 evidence 为空”的 handoff 摘要。

## 2026-03-15 / Runtime / Preflight Must Validate Only Browser-External Facts
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/20260315_preflight_block_video_empty.log`
- relation: enriches
- failure_signature: 旧版 `S0 Preflight` 只证明 YAML 能读、schema 能过，不能证明“本轮选中的模块值不值得开浏览器”。结果是用户经常在前台监督了半天，最后才发现选中的模块根本没有最小数据，比如 `--modules=1e` 但 `video_file` 为空。更糟的是，如果 preflight 去碰图库路径这类平台内语义路径，又会和真实运行逻辑打架，形成“预检说失败、页面其实能选”的双真相。
- working_selector_or_action: `validatePreflight()` 只能检查两类东西：`selected modules` 的最小 payload 是否存在，以及浏览器外的本地文件是否真实存在。适合做硬 fail 的包括 `1a/title/1c/1d/1e(local)/4/5/6a/6b/7`；`3/6c/8` 这类本来就允许 default/manual gate 的模块只给 warning，不阻断。图库语义路径（`carousel/white_bg_image/marketing_image/detail_images`）只检查“是否非空”，绝不按本地文件路径判死。
- rollback_condition: 如果未来 preflight 开始引入 DOM、选择器、平台壳页判断，立即回退；那已经越过了“浏览器外硬约束”的边界，会和模块内部运行时校验发生重复甚至冲突。

## 2026-03-15 / Runtime / latest-handoff Must Be Cleared At New Listing Run Start
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/latest-handoff.json`
- relation: enriches
- failure_signature: 新 run 已经在 `S0 Preflight` 被 `blocked`，但 `runtime/latest-handoff.json` 仍指向上一轮 `2026-03-14` 的人工交接摘要。这样人工接手和后续 agent 都可能误以为“当前 run 还有这些手工项要补”，实际看到的是旧尸体，不是当前现场。
- working_selector_or_action: 人工交接 latest pointer 不能只在 `S5 Verify` 附近维护。新的 listing run 一开始就先清掉旧 `runtime/latest-handoff.json`；只有当当前 run 真正走到 `S5` 且 `module_outcomes` 里存在 `manual_gate/detect_only` 时，才重新生成 handoff artifact 并写回 latest pointer。若当前 run 没有人工交接项，则 latest pointer 保持不存在。
- rollback_condition: 如果未来 handoff 契约升级为“latest 文件本身就能表达当前 run 的 blocked/failed/no-handoff 状态”，可以把“删除文件”收敛成更显式的状态对象；在那之前，禁止保留跨 run 的旧 latest pointer。

## 2026-03-15 / Runtime / Preflight Needs A Real Main-Flow Test, Not Just Function Tests
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/main-preflight-blocked.integration.test.ts`
- relation: enriches
- failure_signature: 只测 `validatePreflight()` 函数本身，会让人误以为“preflight 已经可靠”，但主流程仍可能在别处说谎，比如写错 runtime 根目录、残留旧 `latest-handoff`、甚至已经开了浏览器才失败。函数绿，不代表 `main.ts` 的行为绿。
- working_selector_or_action: preflight 必须至少有一条真实子进程集成测试，直接跑 `src/main.ts` 并断言四件事同时成立：当前 run 的 `runtime/state.json` 写成 `S0 blocked`、浏览器启动 marker 不存在、旧 `latest-handoff` 被清掉、CLI 退出码非零。为此只允许加入最小测试注入点，例如 `AUTOMATION_PROJECT_ROOT` 和 browser launch marker；不要把测试逻辑渗进业务分支。
- rollback_condition: 如果未来 `main.ts` 被拆成可直接注入依赖的 orchestration 层，可以把子进程测试缩成更快的进程内集成测试；但在完成这种重构前，禁止退回“只测 preflight 函数”的假覆盖。

## 2026-03-15 / Runtime / Truth Layer Must Be Checked Across Files, Not Inside One Object
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/runtime-truth-consistency.test.ts`
- relation: enriches
- failure_signature: 单看 `module_outcomes`、单看 handoff helper、或单看 `latest-handoff.json` 都可能各自正确，但组合起来未必一致。最典型的假象是：`module_outcomes` 标了 `manual_gate`，latest pointer 也存在，但 handoff JSON 里缺条目，或者反过来 latest pointer 还指向旧 run。
- working_selector_or_action: 真相层测试必须跨文件校验：从当前 snapshot 生成 handoff 后，直接读取 `runtime/latest-handoff.json` 指向的 artifact，再比对 `module_outcomes` 中的 `manual_gate/detect_only` 集合。规则只有三条：有人工项就必须在 handoff 中逐项出现；`auto_ok` 不得混入 handoff；没有人工项时 latest pointer 必须不存在。
- rollback_condition: 如果未来 handoff 事实源被重新建模成单一数据库表或统一 runtime ledger，可以把跨文件断言迁移到新事实源；在此之前，不能再偷懒只测单个 helper 返回值。

## 2026-03-15 / Stable Chain / Module 5 Shared Weight-Dim Inputs Must Stay Inside SKU Scope
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-shipping-boundary.test.ts`
- relation: enriches
- failure_signature: 模块 5 后半段填写共享 `重量/长/宽/高` 时，如果继续用全页 `page.locator(...).first()`，一旦 DOM 顺序变化或模块 7 物流区更早出现在页面上，就会把 SKU 共享字段写进物流总字段，随后模块 7 再写一次自己的总重量总尺寸，形成“日志全绿但两边语义串位”的假成功。
- working_selector_or_action: `fillSKUs()` 的共享重量和尺寸必须先定位 SKU 区域 scope，再只在这个 scope 内找 `重量/长/宽/高` 输入。可以接受 `#sku-panel` 这类显式容器，也可以从 `posting-feild-color-item / sell-sku-cell / 批量填充` 这些 SKU 标记向上回溯出最近祖先，但找到 SKU scope 后不得再回退全页 `first()`。
- rollback_condition: 如果未来 AliExpress 把 SKU 共享重量尺寸完全拆出 SKU 区域并挂到独立 step，需要先新增新的模块边界测试再调整 scope；在那之前不得恢复全页无 scope 的输入定位。

## 2026-03-15 / Stable Chain / Module 6b Detail Upload Fallback Must Reject Broad Ancestor Wrappers
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module6-detail-images.test.ts`
- relation: enriches
- failure_signature: 当详情编辑器锚点暂时不存在、逻辑退回“带 `详情描述|详情图|商品详情|描述` 文本的容器内找 `上传图片`”时，外层 page wrapper 也会匹配这段文本。若直接在第一个匹配容器里拿 `.first()`，就会先点到模块 1/5 的上传入口，日志仍可能显示“详情图完成”，实际却把图片送进错误模块。
- working_selector_or_action: 模块 6b 的 fallback scope 必须先排除“内部还套着更细 detail 容器”的 broad ancestor wrapper，只在最内层 detail-like container 内取上传按钮。红测固定用“page wrapper + module1 upload + detail section upload”的混合 DOM 验证，确保最终命中的是详情区 `upload`，不是前序模块入口。
- rollback_condition: 如果未来真实页把详情文案和上传入口拆成兄弟节点、导致“最内层 detail container”不再持有上传按钮，不要删除这条 broad-wrapper 过滤；应先补新 fixture，明确新的 sibling scope 规则后再调整。

## 2026-03-16 / Runtime Observability / Module 5 Needs Start Markers For Real Sub-Phase Attribution
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260316034018-f331fe_smoke/events.json`
- relation: enriches
- failure_signature: 只在 `module5_running` 开始和 `fill_sku_images` 完成时写事件，会把真实耗时吞进错误阶段。典型假象是 `fill_sku_shared_fields` 看起来耗时 56s，实际上那 56s 大部分是 SKU 图片流程；另一个真实页分支是“传统 grid 不可见 -> 直接走批量填充”，如果不在这条分支补 marker，`events.json` 会直接跳过 batch 阶段。
- working_selector_or_action: `module5` 的 observability 必须按“阶段开始”落 marker，而不是等阶段完成后再补记。当前最小有效切分是：`fill_sku_variants`、`fill_sku_batch_fields`、`fill_sku_row_values`、`fill_sku_shared_fields`、`fill_sku_images_running`。其中 `fill_sku_batch_fields` 必须覆盖 direct-batch fallback，`fill_sku_images_running` 必须在第一张图上传前写入，这样下一条事件才能准确给出该阶段时长。
- rollback_condition: 如果未来改成更细粒度的 timing span 或统一 tracer，可以替换这些阶段 marker；但在新的 tracer 能证明 direct-batch 和 SKU 图片开始时点都被覆盖前，禁止删回“只有 module start / module done”的粗粒度事件。

## 2026-03-16 / Image Library / selectImageFromLibrary Must Wait For Signals Before Paying Delay Tax
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260316041745-ab303d_smoke/events.json`
- relation: enriches
- failure_signature: 图库 helper 在 modal、tab、目录树、确认按钮都已经 ready 的场景里，仍然无条件支付 `500-1000ms`、`800-1500ms`、`300-700ms` 这类 blind delay。结果是单张 SKU 图即使 DOM 已 ready，也要重复吃“打开弹窗 -> 切 tab -> 点目录 -> 确认”的固定时间税，真实 smoke 里这条链会直接膨胀成 `fill_sku_images_running` 的主热点。
- working_selector_or_action: `selectImageFromLibrary()` 必须先等真实信号，再决定是否 fallback delay。当前有效规则是：点击上传后直接等 modal 可见；切到“选择图片”后直接等 folder/image/search signal；目录点击和展开优先等 spinner hidden，不再无条件 sleep；搜索后直接等 loading hidden；选图和确认后直接等 button / modal 的状态变化。只有信号没来时才付短 fallback delay。
- rollback_condition: 如果未来平台新增反爬节流，导致完全去掉 blind delay 后真实页开始丢点击或 modal 抖动，不要恢复旧的整段固定等待；应先加最小信号检测或仅对失败路径补短 fallback，再重新验证 smoke。

## 2026-03-16 / Image Library / Fixture-Only Folder Shortcuts Must Lose To Real-Page Evidence
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260316063507-5f5063_smoke/events.json`
- relation: replaces
- failure_signature: 在夹具里，如果产品目录节点和目标图片都提前可见，“直接点最深 product folder” 看起来能省掉 `商品发布 -> TailLights -> 分类 -> 产品` 的整段 traversal。但真实页 smoke 证明这条 shortcut 会把目录状态带偏：首个 SKU 先在错误层级找图失败，随后触发整轮 modal/tree retry，`fill_sku_image_tree_running` 单次就膨胀到 `26436ms`，比回滚前安全路径更慢。
- working_selector_or_action: `selectImageFromLibrary()` 可以保留“当前视图里目标图已可见 -> 直接选图/确认”的短路，但一旦目标图尚未可见，就必须回到 canonical tree path，按 `商品发布 -> TailLights/TailLight -> 分类 -> 产品` 顺序重放目录导航，不要假设“最深可见 product folder” 就等于当前真实上下文。对子阶段 observability 也要保留，这样 smoke 才能直接指出 modal/tree/select/confirm 到底哪段回归了。
- rollback_condition: 如果未来真实页再次证明某种目录 shortcut 稳定有效，不要直接恢复这条被证伪的 deepest-first 逻辑；先补新的真实页证据和回归夹具，确认它不会触发 missing-folder / retry 链，再决定是否替换 canonical tree path。

## 2026-03-16 / Image Library / Tree-Level Markers Must Exist Before You Optimize Folder Traversal
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/artifacts/browser-video/run-20260316072836-d005ff_smoke/events.json`
- relation: enriches
- failure_signature: 只有总的 `fill_sku_image_tree_running` 时，真实页里 30s+ 的目录导航只会表现成一个大黑箱。你知道“tree 慢”，但不知道是 `商品发布`、`TailLights`、分类层还是产品层在付税，于是下一刀很容易又落到广义 shortcut 或错误层级缓存上，重演 fixture 绿、真实页炸的回归。
- working_selector_or_action: `selectImageFromLibrary()` 在 canonical tree path 里必须在每一级点击前落 marker。当前最小有效切分是 `fill_sku_image_tree_level_1_running` 到 `fill_sku_image_tree_level_4_running`，分别对应 `商品发布 -> TailLights/TailLight -> 分类 -> 产品`。真实 smoke 已证明这组 marker 能直接暴露热点集中在前 3 层，而不是最后的 product 层。
- rollback_condition: 如果未来 runtime tracer 改成 span 模型，可以把这些 level marker 映射到更通用的 tree spans；但在新 tracer 能继续区分四层目录前，不能删回只有一个 `fill_sku_image_tree_running` 的粗粒度事件。

## 2026-03-16 / Image Library / Folder Visibility Polling Must Not Pay UI-Sized Random Delay Tax
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/image-library-navigation.test.ts`
- relation: enriches
- failure_signature: `waitFolderVisible()` 明明只是“等下一层目录露出来”的 probe，却继续沿用 UI 交互级的 `randomDelay(300, 700)`。在“上一层点击后 50ms 左右就出现下一层”的场景里，这会把简单的 visibility polling 硬拖成秒级；真实页分层 marker 也能看到 level 1/2/4 累积耗时被这类探测税放大。
- working_selector_or_action: 目录可见性 probing 必须降成短探针，并复用可注入的 `delayFn`。当前有效做法是 `waitFolderVisible()` 每轮先等 spinner hidden，再用 `delay(80, 160)` 做短轮询；测试环境可用 no-op delay 直接锁住“短延迟 reveal 不得再付长 polling 税”，真实 smoke 也验证 tree 四层总时长从 `31968ms` 降到 `30544ms`，其中 level 2 单独下降约 `10.8%`。
- rollback_condition: 如果未来平台开始对目录树探针限流，导致短轮询引发真实页 miss，不要直接恢复 `300-700ms` 的 UI 级随机等待；先保留 level marker，再按真实 smoke 证据微调 probe interval。

## 2026-03-16 / Image Library / Ancestor Reuse Only Counts When Real Smoke Actually Hits It
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/run-20260316081202-856ef0_smoke.log`
- relation: enriches
- failure_signature: 夹具能证明“下一层 canonical folder 已经可见时，当前层点击可以安全复用”，但真实 smoke 如果连续 0 次出现 `目录层已复用`，就说明当前页面每次重开图库仍基本从根状态开始。此时继续围绕 ancestor reuse 做 micro-hardening，只是在雕一条当前根本没被命中的分支。
- working_selector_or_action: ancestor reuse 必须保持极窄语义：只在 `下一层已可见` 且 `更深层还未全部可见` 时才允许跳过当前层，绝不退化成 broad shortcut。更重要的是，要把它当成“可选命中路径”而不是既成收益；真实 smoke 没 hit 时，下一步应停止在这条分支上继续优化，转去别的热点或进入收口验证。
- rollback_condition: 如果未来真实页开始保留更深的树展开状态，smoke log 连续出现 `目录层已复用` 命中，再回来评估它的真实收益；在那之前不要把这条分支当成已验证优化继续堆逻辑。

## 2026-03-16 / Browser / Screenshot Capture Must Fall Back When Font Loading Blocks Playwright
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/browser-screenshot.test.ts`
- relation: enriches
- failure_signature: 收口 smoke 在 `before_fill` 截图时，Playwright 可能卡在 `waiting for fonts to load` 并在 30s 后超时。页面本身没挂，但整条半自动主线会因为拿不到截图证据而被误判为失败。
- working_selector_or_action: `screenshot()` 遇到 Chromium `page.screenshot` 的 font-loading timeout 时，必须回退到 CDP `Page.captureScreenshot`，并保留原截图命名和证据路径。这样 runtime/handoff 证据链不会因为字体等待被截断。
- rollback_condition: 如果未来某类截图明确依赖 Playwright 独有语义，不要删掉这条 fallback；先证明 CDP capture 无法覆盖该场景，再为那一类截图单独分流。

## 2026-03-16 / Module 6b / Detail Images Must Return ModuleExecutionResult Instead Of Only Logging Follow-Up
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module6-detail-images.test.ts`
- relation: enriches
- failure_signature: 详情图部分失败时，日志会提示“人工补充详情图”，但旧实现只返回 `void`，主流程仍会把 `6b` 硬记成 `auto_ok`。结果是 runtime 和 handoff 同时说谎，人工接手看不到真实未完成项。
- working_selector_or_action: `fillDetailImages()` 必须显式返回 `ModuleExecutionResult`。无详情图 -> `detail_images_skipped_empty`；有 unresolved/partial failure -> `manual_gate + detail_images_manual_gate screenshot`；全部成功 -> `detail_images_done`。`main.ts` 只能 `recordModuleExecutionResult('6b', result)`，禁止再硬编码 `auto_ok`。
- rollback_condition: 如果未来详情图模块继续拆子阶段，也必须保留这个 result contract；不能退回“模块内部只打日志、主流程自己猜状态”。

## 2026-03-16 / Runtime / Module Maturity Labels Must Not Override Per-Run Outcomes
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/state.json`
- relation: enriches
- failure_signature: 文档把 `1c/1d` 归入“稳定”后，最容易发生的误读是“closeout 主线里它们也必然 auto_ok”。真实半自动 run `run-20260316093829-2dc580` 证明并非如此：当前页面现场里，`1c/1d` 仍可能按条件落成 `manual_gate`。如果继续把成熟度标签当作本轮结果，后续 agent 和人工接手会再次被文档带偏。
- working_selector_or_action: README / roadmap 里的“稳定 / 人工门禁 / 单独维护”只表达默认策略与成熟度；单次运行真相必须只看 `runtime/state.json.module_outcomes`，人工接手只看 `runtime/latest-handoff.json`。收口验证时必须同时核对 runtime 和 handoff，不能只看 README 表格。
- rollback_condition: 如果未来要展示更细的成熟度，不要再让一个标签兼任“模块成熟度”和“本轮执行结果”；应新增独立字段，而不是覆盖 per-run truth。

## 2026-03-16 / Stable Chain / Module 5 Retail Header Search Must Treat Visible Row Cells As Ready Signal
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- relation: enriches
- failure_signature: 单 SKU 场景下，即使 `td.sell-sku-cell.col-skuPrice/col-cargoPrice/col-skuStock` 已经全部可见可填，只要 fixture 没有显式 `零售价(CNY)` header 或 `批量填充` 按钮，`ensureRetailPriceHeaderVisible()` 仍会盲滚 10 轮并每轮支付 `220ms`。表现是价格/货值/库存最终都写成功了，但单测还会多卡约 `2.2s`，把热点错归到 `fillSkuCellValue()`。
- working_selector_or_action: `ensureRetailPriceHeaderVisible()` 先检查可见 `sell-sku-cell` 本体，把“row cells already visible”视为 SKU 数值区 ready signal；只有 row cells、retail header、batch button 全都不可见时，才继续滚动和 `220ms` fallback。归因脚本证明热点在前置定位链而不是 `fillSkuCellValue()` 提交确认，修完后对应回归从约 `6.5s` 降到 `2.0s`。
- rollback_condition: 如果未来真实页再次要求“必须看到 retail header 才能安全填写”且 row cells 可见并不代表 ready，不要直接删掉这条 ready signal；先补真实页 canary 或更具体的 header/grid 双信号，再决定是否恢复滚动链。

## 2026-03-16 / Maintenance / Duplicate-Intent Audit Should Stay A Soft Audit Asset Before CI Gate
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/duplicate-intent-audit.test.ts`
- relation: enriches
- failure_signature: 仓库已经有“共享 helper 不得在 `modules.ts` 本地重定义”的结构门，但没有一个更上游的视图去找“名字不同、意图相同”的函数家族。结果是每次想继续收缩 `modules.ts` 都只能靠体感搜代码，很容易漏掉正在平行生长的 helper，等到双真相已经形成才被结构测试打脸。
- working_selector_or_action: 在正式合并 helper 之前，先跑 `npm run audit:duplicate-intent`。这条审计器只扫描 `src/**/*.ts`，提取函数 catalog，用轻量 token 归一化输出 duplicate-intent markdown 候选组，给人做结构收缩前的证据视图。当前阶段它必须保持 soft audit，不接 CI，不自动判死刑。
- rollback_condition: 如果未来真实维护中连续多轮证明这份审计报告噪音低、且能稳定命中后续被人工确认的重复 helper，再考虑把其中一小部分规则升级成硬门；在那之前不要把“候选组”误升成阻断条件。

## 2026-03-17 / Stable Chain / Module 5 Variant Selection Should Wait On Selection Commit, Not 140-200-180 Blind Sleeps
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- relation: enriches
- failure_signature: 在单 SKU fixture 里，下拉和选中态都会立即反馈，但 `selectUniqueLightColorForRow()` 仍固定支付 `140ms + 200ms + 180ms`，`resetSkuTabAnchor()` 在根本没有 SKU tab 或滚动变化时也会额外支付 `140ms`。结果是颜色选择早已成功，测试仍被一串无意义的固定等待拖慢。
- working_selector_or_action: `resetSkuTabAnchor()` 只在真的点过 SKU tab 或滚动位置发生变化时才付 `140ms` 稳定等待；`selectUniqueLightColorForRow()` 打开下拉后直接检查 combobox 可见，提交后用 `MutationObserver` 等待 `.ait-select-selection-item / .color-value` 从“选择主色系”切到真实值，不再依赖 `140/200/180ms` 盲等。修完后新回归从约 `3.3s` 降到约 `2.6s`。
- rollback_condition: 如果未来真实页证明颜色下拉提交存在异步动画且 `MutationObserver` 提前返回，不能直接把盲等加回来；先补一个真实页 canary，把“下拉可见”“选中值变化”“焦点迁移”拆成更具体信号，再决定是否恢复最小等待。

## 2026-03-17 / Stable Chain / Module 5 Inline Editor Entry Should Probe Existing Editor Before Paying 120ms
- source: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module5-ui-flow.test.ts`
- relation: enriches
- failure_signature: 单 SKU 场景里，价格/货值/库存 cell 的 `contenteditable` editor 一开始就已经在 DOM 中，但 `fillSkuCellValue()` 在每次 `dblclick()` 后仍固定支付 `120ms`。结果是三个 cell 明明可立即写值，测试还会白白多出 `120ms x3`。
- working_selector_or_action: `fillSkuCellValue()` 在进入编辑态后，先立即探测 `input:visible / textarea:visible / [contenteditable=true]`；只有当 inline editor 既不可见也未附着时，才做最多 `120ms` 的 `Promise.any(waitFor visible/attached)`。现成 editor 直接写值，不再支付固定等待。修完后对应回归从约 `3.1s` 降到约 `2.1s`。
- rollback_condition: 如果未来真实页证明某类 SKU cell 必须在双击后经过异步 mount 才能安全写值，不要恢复无条件 `120ms`；先补真实页 canary，把“editor attached”“editor visible”“focus landed”区分成具体信号，再决定是否保留最小等待。
