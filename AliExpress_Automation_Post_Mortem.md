# AliExpress Automation Post-Mortem & Logic Refactoring Guide (For Codex)

## 🚨 发现的问题 (Discovered Issues)

根据近期的运行日志（例如 `V4_V5_fix_category_dropdown_20260303_112410.log`），自动化脚本在执行过程中出现了**级联失败 (Cascading Failures)**：

1. **核心故障点 (Root Cause):** 
   - `⚠️ 最近使用点击后未确认生效 (value="")，回退树路径`
   - `⚠️ 未找到类目: 汽车及零配件`
   - **问题说明：** 模块 1a（类目选择）在点击“最近使用”后未能成功应用类目，或者验证逻辑未能正确读取到类目状态。
2. **级联故障 (Cascading Effects):**
   - 模块 5 (SKU): `⚠️ 光线颜色选择失败`
   - 模块 5 (SKU): `⚠️ 未找到价格/货值/库存输入框`
   - 模块 5 (SKU 图片): `⚠️ 未找到 SKU 1 的图片上传按钮`
   - 模块 8 (其他): `⚠️ 制造商设置异常`
   - **逻辑漏洞：** AliExpress 的发布表单是**强动态驱动**的。如果没有正确选中“尾灯总成”类目，底部的 SKU 属性（如发光颜色）、定价表格等组件**根本就不会渲染**。当前的脚本虽然在模块 1a 失败了，却仍然强行执行后续模块，导致了满屏的“未找到”报错。

---

## ❌ 代码与操作逻辑哪里不好？(Where the code & logic went wrong)

1. **错误处理缺少“快速失败” (Lack of Fail-Fast Mechanism):**
   - **现状：** 在 `modules.ts` (如 `fillCategory` 函数) 中，当 `recentClicked` 失败或验证不通过时，代码只是通过 `console.log('⚠️...')` 记录警告，然后 `try-catch` 掩盖了致命错误，继续执行后续的属性和 SKU 填写。
   - **错误逻辑：** 类目是整张表单的**基石**。类目选错/没选上 = 后面必定全错。
2. **状态验证太脆弱 (Brittle State Verification):**
   - **现状：** `const categoryValue = await categoryInput.inputValue().catch(() => '');`
   - **错误逻辑：** 现代前端框架（React/Vue）中，input 的值变化并不代表表单 Schema 已经通过 Ajax 请求加载完毕。只检查 input value 不足以证明类目已生效。
3. **选择器过于宽泛 (Overly Broad Selectors):**
   - **现状：** 制造商定位使用 `page.locator('text=制造商').or(page.locator('text=Manufacturer'))`。
   - **错误逻辑：** 页面上可能存在其他带有这些字眼的元素，导致点击错误或“设置异常”。

---

## 🛠️ 解决问题与正确的逻辑设计 (Correct Logic & Solutions)

为了彻底解决此问题，Codex 在接下来的代码维护中必须遵循以下逻辑进行重构：

### 1. 建立强依赖校验与 Fail-Fast (立即熔断)
在 `fillCategory` 结束后，必须执行**严格的页面重绘校验**。
- **正确逻辑：**
  ```typescript
  // 在 fillCategory 的最后
  if (!categoryValue.includes('尾灯总成')) {
      throw new Error('CRITICAL: 类目未成功应用，无法进行后续表单填写。请人工介入！');
  }
  // 等待网络请求或特征元素渲染
  await page.waitForSelector('text=发光颜色', { timeout: 5000 }).catch(() => {
      throw new Error('CRITICAL: 类目已改变，但 SKU 动态属性(发光颜色)未加载，可能是网络延迟或类目无效。');
  });
  ```
- **核心原则：** 模块 1 失败，**坚决不要**执行模块 2-8，直接暂停脚本等待人工接管。

### 2. 优化「最近使用」类目的点击与回退
- AliExpress 的下拉框经常被遮挡，或者 DOM 存在但不处于交互状态。
- **正确逻辑：** 
  点击「最近使用」前，先强制点一下输入框唤起 Dropdown，再用精确的 XPath 或更加结构化的方式寻找 `汽车及零配件 >> 车灯 >> 信号灯总成 >> 尾灯总成`。
  如果“最近使用”点击失败，**不要直接静默**，可以引入 `page.pause()` 借助 Playwright Inspector 让用户手动点一下，然后代码继续。

### 3. SKU 网格的动态等待
- 既然日志中出现 `⚠️ 未找到价格输入框`，这表明代码在找表格时没有考虑到异步渲染的时间差。
- **正确逻辑：** 在 `fillSkuGridValues` 前，除了 `ensureSkuSectionVisible`，还需显式等待表头加载：
  ```typescript
  await page.waitForSelector('.sell-sku-head-cell.col-skuPrice', { state: 'visible', timeout: 8000 });
  ```

---

## 📝 没解决的问题 & 后续关注点 (Unsolved & Next Steps)

1. **树状类目逐级点击的稳定性：** 目前当“最近使用”失效时，代码是否能稳定地一层层点击“汽车及零配件 -> 车灯 -> ...”？这部分的回退逻辑在日志中显示全部失败（`未找到类目: 汽车及零配件`），说明逐级树状菜单的选择器已经失效，需要 Codex 重新在 DOM 中核对树节点 class。
2. **多语言/多区域干扰：** 检查买家/卖家后台是否因为 Cookie、语言设置跳到了英文界面，导致中文 `text=` 选择器找不到目标（日志中 Module 8 制造商异常可能是这个原因）。

---
**给 Codex 的指令总结：**
不要再写“掩耳盗铃”式的 `catch(e => console.log(e))` 了！对于**决定表单结构的依赖项（类目、规格选项）**，如果找不到或设不上去，直接 `throw new Error` 终止运行，防止输出毫无意义的垃圾数据和连环报错。
