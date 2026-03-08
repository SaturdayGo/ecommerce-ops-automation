# Module 1e Video Bootstrap Design

## Goal
在 `--modules=1e` 的单模块可视测试里，自动执行最小类目前置链：`最近使用 -> 选择 YAML 对应类目条目`，只为让「商品视频」区域出现，再进入视频上传。

## Scope
- 包含：视频模块的最小类目 bootstrap、YAML 驱动的 recent path 选择、模块 1e 可视单测链路
- 不包含：完整类目模块门控、商品属性、SKU、图片、SKU Tab 校验

## Approaches
1. 在 `fillVideo()` 内部隐式补 recent path。  
   - 优点：改动少  
   - 缺点：视频函数承担了类目职责，后续别的模块会继续复制这种隐式前置

2. 在 `main.ts` 为 `1e-only` 注入最小 bootstrap。推荐。  
   - 优点：职责清晰；模块 1e 仍只做视频；可视单模块调试仍然只测视频链路  
   - 缺点：需要额外 helper 和执行流分支

3. 每次都让人工先点最近使用和类目。  
   - 优点：零代码  
   - 缺点：不可复现，回归成本高，违背当前单模块自动验证目标

## Decision
采用方案 2：
- 新增 `bootstrapVideoCategoryFromRecent(page, data)`  
- 只在 `--modules=1e` 且未显式选择 `1a` 时运行  
- helper 行为：
  1. 找到类目输入区域
  2. 点击 `最近使用`
  3. 选择 `data.category` 对应的最近使用条目
  4. 只验证视频区域是否出现，不验证 SKU Tab
- 若 `data.category` 为空或 recent 条目未命中：截图并转人工，不继续乱试旧逻辑

## Success Criteria
- `--modules=1e` 不再误跑商品属性/SKU/图片
- 单模块视频测试时，能先走最近使用类目前置
- `data.category = 汽车及零配件 > 车灯 > 头灯总成` 时，视频区域可见
- 视频区域未出现时，立刻停住并产出明确证据
