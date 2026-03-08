# Module 6 Detail Images Implementation Plan

## Task 1: 写红测锁定路径推导与跳过逻辑
- 文件：`tests/module6-detail-images.test.ts`
- 覆盖：
  - `detail_images=[]` 时跳过
  - `detail_images` 为纯文件名时可从公共图库目录推导
  - 单张失败不抛异常而是继续并输出人工项

## Task 2: 实现详情图路径推导与模块函数
- 文件：`src/modules.ts`
- 新增：
  - `resolveDetailImageLibraryPaths(data)`
  - `fillDetailImages(page, data)`
- 复用：`parseImageLibraryPath()` / `selectImageFromLibrary()`

## Task 3: 接入主流程
- 文件：`src/main.ts`
- 在 `fillBuyersNote()` 后调用 `fillDetailImages()`
- 保持 APP 描述继续跳过

## Task 4: 跑测试与真实 full 验证
- `node --import tsx --test tests/module6-detail-images.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run full -- ../products/test-next-modules.yaml --auto-close`

## Task 5: lessons 沉淀
- 文件：`docs/automation/lessons.md`
