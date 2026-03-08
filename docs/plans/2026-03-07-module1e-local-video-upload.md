# Module 1e Local Video Upload Implementation Plan

## Task 1: 写红测锁定路径解析与上传链路
- 文件：`tests/module1e-video.test.ts`
- 覆盖：
  - `video_file` 为空时跳过
  - `video_file` 可解析为绝对路径与标题名
  - 本地上传 modal 中能通过 file input 完成上传并点击“确定”

## Task 2: 实现模块函数与辅助解析
- 文件：`src/modules.ts`
- 新增：
  - `resolveLocalVideoUploadSpec(videoFile)`
  - `fillVideo(page, data)`
- 行为：本地上传优先，必要时 filechooser 兜底

## Task 3: 接入主流程
- 文件：`src/main.ts`
- 在 `fillMarketingImages()` 后接入 `fillVideo()`
- 保持 smoke 路径也执行 1e

## Task 4: 准备真实验证 fixture
- 文件：`products/test-module1e-video.yaml`
- 基于现有稳定 smoke fixture，只补 `video_file`

## Task 5: 跑验证
- `node --import tsx --test tests/module1e-video.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run smoke -- ../products/test-module1e-video.yaml --auto-close`

## Task 6: lessons 沉淀
- 文件：`docs/automation/lessons.md`
