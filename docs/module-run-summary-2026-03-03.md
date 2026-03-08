# AliExpress Automation Module Summary (2026-03-03)

## Project Address
- `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation`

## Latest Verified Command
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close`

## Module Status

| Module | Status | Notes |
|---|---|---|
| 模块 1b 标题 | ✅ 完成 | 固定标题: `fit for Toyota sienna taillight assembly` |
| 模块 1a 类目 | ✅ 完成 | 固定两步: 最近使用 -> 尾灯总成 |
| 模块 1c 商品图 | ✅ 基本完成 | SKU 图库选择已跑通；偶发目录节点首轮未命中 |
| 模块 1d 营销图 | ⏭️ 当前数据跳过 | YAML 无营销图数据 |
| 模块 2 商品属性 | 🟡 部分完成 | 已自动命中：材质/电压/适用车型；待补：品牌/产地/高关注化学品 |
| 模块 3 海关 | ⏭️ 默认值 | 当前测试数据无特殊输入 |
| 模块 4 价格设置 | ⏭️ 默认值 | 目前未阻塞 |
| 模块 5 SKU 颜色/名称 | ✅ 完成 | 3 SKU 颜色顺序选择与名称输入已稳定 |
| 模块 5 SKU 批量填充 | 🟡 部分完成 | 价格/货值/库存/重量/尺寸已命中；原箱/物流下拉仍不稳 |
| 模块 5 逐行填写回退 | ✅ 完成 | 价格/货值/库存逐行回退可跑通 |
| 模块 6 买家须知 | ⏭️ 当前数据跳过 | YAML 无模板 |
| 模块 7 物流包装 | ✅ 基本完成 | 尺寸填写生效 |
| 模块 8 其它设置 | 🟡 部分人工 | 不再报异常；欧盟责任人/制造商当前转人工 |

## Solved In This Round

1. 类目逻辑收敛为固定路径，不再走树形搜索大回退。
2. 删除会导致 30 秒卡死的点击兜底，改成限时安全点击。
3. SKU 阶段新增“颜色完成后鼠标滚轮下滚到零售价区域”的稳定过渡。
4. 批量填充已能命中 `零售价(CNY)`、`货值(CNY)`、`商家库存`、`重量`、`包装尺寸`。
5. 逐行回退链路可在批量未完全命中时继续执行，避免整流程中断。

## Open Issues

1. 批量填充中的 `是否原箱` 下拉命中率不稳定。
2. 批量填充中的 `物流属性` 下拉命中率不稳定。
3. SKU 图库目录偶发首轮找不到 `TailLights/TailLight`（二次尝试常恢复）。

## Reusable Hooks (for next runs)

- `safeClick(locator, timeout)`
  - 作用: 点击失败时走短超时元素句柄回退，避免长时间阻塞。
  - 文件: `src/modules.ts`
- `wheelScrollDownToPricing(page, attempts)`
  - 作用: 颜色区域结束后用鼠标滚轮下滚，不依赖焦点/Tab。
  - 文件: `src/modules.ts`
- `ensureRetailPriceHeaderVisible(page)`
  - 作用: 强制锚定到 `零售价(CNY)` 区域后再执行方案1/方案2。
  - 文件: `src/modules.ts`
- `tryBatchFillForMultiSku(page, data)`
  - 作用: 多 SKU 优先批量填充，失败回退逐行填写。
  - 文件: `src/modules.ts`

## Optimization Backlog (Priority)

1. `是否原箱`、`物流属性` 下拉改为“列索引 + 下拉索引”双重定位。
2. SKU 图库目录点击增加一次“节点展开后再点击”重试，减少首轮 miss。
3. 模块 8 的欧盟责任人/制造商增加页面状态探针，避免误报。
4. 将当前 Hook 抽到独立文件 `src/hooks/sku-workflow.ts`，形成可复用插件层。

## Recommended Execution Strategy

1. 继续保持“批量优先 + 逐行回退”。
2. 先稳定模块 5 的两个下拉，再推进模块 8。
3. 每次跑完都追加本文件一段 `Run Delta`，避免上下文丢失。

## Run Delta (2026-03-03, latest)

### Implemented
1. 滚轮策略改为低速步进（320/280 像素），并在检测到 `批量填充` 后立即停滚。
2. 批量流程改为固定顺序执行：
   - `零售价(4000)` -> `货值(3900)` -> `商家库存(20)` -> `是否原箱(是)` -> `重量(6.7)` -> `长(57)` -> `宽(35)` -> `高(24.5)` -> `物流属性(普货)` -> 点击 `填充`。
3. 修复类目点击旧 30s 卡死点（统一改 `safeClick`）。
4. 逐行回退时跳过批量行，避免把批量输入行误识别为 SKU 第 1 行。

### Latest Result
- 类目两步流程：✅ 稳定通过。
- 滚轮停滚条件：✅ 生效（日志出现“已定位到批量填充按钮，停止滚动”）。
- 批量填充字段命中：
  - ✅ `零售价/货值/库存/重量/长宽高`
  - ⚠️ `是否原箱/物流属性` 仍未稳定命中。
- 批量失败回退逐行：✅ 可继续完成价格/货值/库存。

### Current Bottleneck
- `是否原箱` 与 `物流属性` 的下拉组件不是稳定文本选项 DOM（存在延迟渲染/遮挡/非标准 option 节点），导致“文本点击 + 索引点击 + 键盘回退”仍有漏命中。

### Next Priority
1. 给这两个下拉加“前台可见态等待 + 组件专属 class 定位（基于实际快照）”的专用 Hook。
2. 在 `--keep-open` 模式跑一次前台可视调试，锁定这两个下拉的真实 DOM 路径并固化。

## Run Delta (2026-03-05, superpowers route)

### Implemented
1. `fillSkuGridValues()` 增加“网格不可见时多 SKU 先尝试批量填充”分支，不再因 `grid-not-visible` 直接退出模块 5 数值填写。
2. `locateBatchFillButtonByWheel()` 改为 `DOM 直达优先 + 低速滚轮补偿`：
   - 先尝试 DOM 定位并 `scrollIntoView` 到 `批量填充`；
   - 再用短步进滚轮补偿；
   - 接近底部未命中即提前终止并回到起点，避免“滚到底再回拉”。
3. 批量行锚点 `getBatchRowAnchorFromRetailInput()` 改为“必须覆盖零售价/货值/库存”的容器优先，避免拿到过小祖先节点。
4. 新增 `selectBatchRowDropdownByOptionProbe()`：
   - 在批量行内逐个探测下拉；
   - 只在探测到目标选项文本时点击；
   - 用于修复 `是否原箱=是` 与 `物流属性=普货` 的不稳定命中。

### Verification Command
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close`

### Latest Result
- 模块 1a 类目：✅ 成功（偶发 category input value 为空日志，但流程未阻断）
- 模块 5 多 SKU 批量：
  - ✅ 进入批量模式
  - ✅ 价格/货值/库存/原箱/重量/长宽高/物流 全部命中
  - ✅ 日志出现 `多 SKU 已按批量填充固定模板完成`
  - ✅ 未触发逐行填写回退
- 模块 5 SKU 图片：✅ `SKUa/SKUb/SKUc` 目录选择成功
- 模块 8：⚠️ 制造商设置仍有异常日志（未在本轮修复）

### Reusable Hooks Added
- `locateBatchFillButtonByWheel()` (DOM-first locate strategy)
- `getBatchRowAnchorFromRetailInput()` (strong row anchor strategy)
- `selectBatchRowDropdownByOptionProbe()` (option-probe dropdown selector)

### Remaining Open Items
1. `fillCategory()` 偶发日志：最近使用点击后 input value 读取为空（流程仍可继续）。
2. 模块 8 制造商关联异常（需单独页面探针和专用 selector）。

## Run Delta (2026-03-05, correction for batch reliability)

### User-Corrected Issues
1. 批量定位并非“稳定一次命中”：存在滚到页面底部后回拉再找按钮。
2. 批量填写阶段误触发颜色列 `筛选` 控件，导致流程偏离。

### Additional Fixes
1. 批量下拉定位增加“列头 X 坐标命中”：
   - `是否原箱` 按列头定位后选 `是`
   - `物流属性` 按列头定位后选 `普货`
2. 批量下拉探测统一跳过 `筛选` 类型控件（文本/placeholder 包含 `筛选` 直接忽略）。
3. 删除危险的“按固定索引下拉选择（0/1）”主路径，防止再次点到颜色筛选。
4. 收紧滚动参数（步长和提前终止阈值），减少触底后回拉概率。

### Verification
- `npm run -s typecheck` ✅
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close` ✅
- 最新日志仍显示：`多 SKU 已按批量填充固定模板完成`，且未触发逐行回退。

### Note
- 该验证基于终端日志；建议下一轮用 `--keep-open` 进行前台可视验证，确认“无误触筛选”与“批量按钮一次命中”的体感稳定性。

## Run Delta (2026-03-05, manual fallback for two dropdowns)

### Decision
- 按用户指令将模块 5 批量区的两个下拉改为人工处理：
  - `是否原箱`
  - `物流属性`

### Code Behavior
1. 批量填充仍自动执行：
   - `零售价/货值/库存/重量/长宽高` 自动填写
   - 自动点击 `填充`
2. 脚本不再尝试点击上述两个下拉，避免误点 `筛选` 与浮层漂移问题。
3. 日志明确提示：
   - `「是否原箱 / 物流属性」改为人工处理：本轮脚本不自动选择这两个下拉`

### Verification
- `npm run -s typecheck` ✅
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close` ✅
- 结果：批量流程成功，未出现这两个下拉的自动点击动作。

## Run Delta (2026-03-06, remove wheel thrashing path)

### Goal
- 修复“滚轮下探到底部后回拉”的定位抖动，执行 P0 精简方案。

### Changes
1. 删除 `fillSKUs` 中的前置定位（避免双重定位链路）。
2. `locateBatchFillButtonByWheel()` 改为无滚轮模式：
   - 先取当前可见 `批量填充`；
   - 再执行一次 DOM 直达 `scrollIntoView`；
   - 不再循环滚轮扫描、不再触底回拉。
3. `ensureRetailPriceHeaderVisible()` 收紧为条件滚动：
   - 小步滚动；
   - `批量填充` 可见即停止；
   - 到底即停止。
4. 删除已废弃 `wheelScrollDownToPricing()` 函数，防止回归旧逻辑。

### Verification
- `npm run -s typecheck` ✅
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close` ✅
- 关键日志变化：
  - ✅ 不再出现“条件定位未命中，触发短距滚轮补偿”
  - ✅ 不再出现“滚动已接近底部仍未命中批量填充，提前终止并回到起点”
  - ✅ 命中日志为：`已定位「批量填充」按钮，进入批量填写`

## Run Delta (2026-03-06, module8 row-scoped selectors)

### Goal
- 稳定模块 8 的“欧盟责任人/制造商”入口定位，移除 `text=制造商` 误命中导致的异常。

### Changes
1. 新增 `openOtherSettingsTab()`：进入模块 8 前先点击顶部 `其它设置` tab。
2. 新增 `locateAssociationRow()`：按“关联欧盟责任人/关联制造商”行级定位，不再用全页宽泛文本点击。
3. 新增 `isAssociationLinked()`：优先判断是否已关联，未关联再尝试触发入口。
4. 新增 `clickManageLinkInRow()`：优先行内点击 `欧盟责任人管理/制造商管理`，再做全页一次回退。
5. 模块 8 日志由“设置异常”改为可诊断输出（未关联 + 未命中入口 -> 转人工）。

### Verification
- `npm run -s typecheck` ✅
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --keep-open` ✅（前台可视执行至人工确认点）
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close` ✅（退出码 0）
- 关键日志：
  - `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_module8_row_scope_20260306_005024.log`
- 关键截图：
  - `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/screenshots/before_fill_1772729028714.png`
  - `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/screenshots/after_fill_1772729125927.png`
  - `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/screenshots/after_fill_1772729529146.png`

### Result
- 模块 5 批量路径未受影响（仍可完成多 SKU 批量填写）。
- 模块 8 不再出现 `制造商设置异常` 异常日志。
- 当前页面未稳定出现“管理入口”可点击节点，改为明确转人工提示：
  - `欧盟责任人未关联，且未命中「欧盟责任人管理」入口（转人工）`
  - `制造商未关联，且未命中「制造商管理」入口（转人工）`

## Run Delta (2026-03-06, module2 enabled)

### Goal
- 启用模块 2（商品属性）自动化，先打通高置信字段，不阻塞主链路。

### Changes
1. `main.ts` 接入 `fillAttributes()`，模块 2 不再是 TODO。
2. 新增模块 2 属性流程：
   - 进入 `基本信息` tab；
   - 下滚查找属性区锚点（商品属性/关键属性）；
   - 按标签填充高置信字段。
3. 新增“最小容器优先”标签定位，避免命中整块容器文本导致误定位。
4. 属性日志改为逐字段输出，明确哪些命中/未命中。

### Verification
- `npm run -s typecheck` ✅
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close` ✅（退出码 0）
- 关键日志：
  - `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_module2_enable_20260306_081825.log`

### Result
- 自动命中字段：
  - `材质`
  - `电压`
  - `适用车型`
- 未命中字段（当前转人工）：
  - `品牌`
  - `产地`
  - `高关注化学品`
- 模块 5 与模块 8 行为未回归。

## Run Delta (2026-03-06, profile split + fail-fast gates)

### Goal
- 落地建议清单：`smoke/full` 双运行模式 + 类目 Fail-Fast 门控 + 模块2验收线。

### Changes
1. 主流程支持 `--smoke`：
   - `SMOKE`: 仅执行模块 `1/2/5`；
   - `FULL`: 执行全模块。
2. `package.json` 新增脚本：
   - `npm run smoke -- <yaml> [--auto-close|--keep-open]`
   - `npm run full -- <yaml> [--auto-close|--keep-open]`
3. 类目门控升级：
   - 信号源：`类目值` / `参考类目已勾选` / `Schema 已加载`。
   - 类目切换弹窗（更换类目）自动确认。
   - 仍保留熔断：三信号都失败时直接终止。
4. 模块2新增验收线：
   - 目标 `>=5/6`；
   - 当前输出逐字段命中/未命中，并列出人工项。

### Verification
- `npm run -s typecheck` ✅
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --smoke --auto-close` ✅（退出码 0）
  - `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_smoke_profile_20260306_083408.log`
- `DEBUG_SKU_FIELDS=1 npx tsx src/main.ts ../products/test-module5-sku-3.yaml --auto-close` ✅（退出码 0）
  - `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runlogs/V4_V5_full_profile_20260306_083637.log`

### Result
- `smoke/full` 模式切分可用，调试成本下降。
- 类目门控不再因单一 input 空值误杀（日志显示 Schema 门控放行）。
- 模块2当前稳定在 `3/6`：
  - 自动：`材质/电压/适用车型`
  - 人工：`品牌/产地/高关注化学品`
- 模块5/8未回归，模块8继续人工收尾策略。
