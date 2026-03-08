#!/usr/bin/env tsx
/**
 * AliExpress 自动填表工具
 * 
 * 用法:
 *   npx tsx src/main.ts <yaml文件路径>
 *   npx tsx src/main.ts <yaml文件路径> --keep-open
 *   npx tsx src/main.ts --login-only
 *   npx tsx src/main.ts ../products/f150-tail-light.yaml
 * 
 * 首次运行:
 *   1. 脚本会打开浏览器
 *   2. 手动登录 AliExpress 商家后台
 *   3. 登录成功后按 Enter → cookie 会被保存
 *   4. 之后的运行自动复用登录状态
 * 
 * 流程:
 *   读取 YAML → 打开发布页 → 逐模块填写 → 暂停等人确认 → (人工点发布)
 */

import * as path from 'path';
import type { Page } from 'playwright';
import {
    launchBrowser,
    navigateToPublishPage,
    navigateToLoginPage,
    waitForSellerLogin,
    saveAuth,
    screenshot,
    waitForHumanConfirmation,
} from './browser';
import { loadProductData } from './types';
import type { ProductData } from './types';
import {
    bootstrapVideoCategoryFromRecent,
    fillCategory,
    fillTitle,
    fillCarouselImages,
    fillMarketingImages,
    fillVideo,
    fillAttributes,
    fillCustoms,
    fillPricingSettings,
    fillSKUs,
    fillSKUImages,
    fillBuyersNote,
    fillDetailImages,
    fillShipping,
    fillOtherSettings,
} from './modules';
import {
    createRunId,
    getRuntimePaths,
    readFreshIntervention,
    shouldPauseForSupervisor,
    writeRuntimeState,
} from './runtime-supervision';
import type { RuntimeStateSnapshot } from './runtime-supervision';
import { createRunlogMirror } from './runlog';
import {
    canonicalizeRecordedVideo,
    extractVideoFrames,
    getBrowserVideoArtifactsConfig,
    writeBrowserVideoManifest,
} from './browser-video';
import {
    formatHudPayload,
    getRuntimeObservabilityConfig,
    recordRuntimeEvent,
    renderRuntimeHud,
} from './runtime-observability';
import {
    buildExecutionPlan,
    parseRequestedModules,
    requiresVideoCategoryBootstrap,
    shouldRunModule,
} from './execution-plan';

function printUsage(): void {
    console.error('❌ 用法:');
    console.error('   npx tsx src/main.ts <yaml文件路径> [--smoke] [--module=1e] [--keep-open] [--auto-close]');
    console.error('   npx tsx src/main.ts --login-only [--keep-open]');
    console.error('   例: npx tsx src/main.ts ../products/f150-tail-light.yaml --modules=1e --auto-close');
}

async function main() {
    // 1. 解析命令行参数
    const args = process.argv.slice(2);
    const loginOnly = args.includes('--login-only');
    const smoke = args.includes('--smoke');
    const requestedModules = parseRequestedModules(args);
    const executionPlan = buildExecutionPlan({ smoke, requestedModules });
    const explicitKeepOpen = args.includes('--keep-open');
    const autoClose = args.includes('--auto-close');
    // 非交互环境默认保持打开，避免人工收尾前被自动关闭
    const keepOpen = explicitKeepOpen || (!loginOnly && !process.stdin.isTTY && !autoClose);
    const yamlPath = args.find(arg => !arg.startsWith('--'));

    if (!loginOnly && !yamlPath) {
        printUsage();
        process.exit(1);
    }
    if (loginOnly && smoke) {
        console.log('⚠️  --login-only 模式忽略 --smoke');
    }
    if (loginOnly && requestedModules) {
        console.log('⚠️  --login-only 模式忽略 --module/--modules');
    }

    const projectRoot = path.resolve(__dirname, '..');
    const runId = createRunId();
    const runtimePaths = getRuntimePaths(projectRoot);
    const modeLabel = executionPlan.modeLabel;
    const runlogMirror = createRunlogMirror(projectRoot, runId, modeLabel, process.env.RUNLOG_PATH);
    const runlogPath = runlogMirror.relativePath;
    const browserVideoConfig = getBrowserVideoArtifactsConfig(projectRoot, runId, modeLabel);
    const runtimeObservabilityConfig = getRuntimeObservabilityConfig(browserVideoConfig.artifactRoot);
    let lastCheckpoint: RuntimeStateSnapshot | null = null;
    let currentPage: Page | null = null;

    const checkpoint = async (snapshot: Omit<RuntimeStateSnapshot, 'version' | 'run_id' | 'updated_at' | 'project_root' | 'mode'>) => {
        const updatedAt = new Date().toISOString();
        const fullSnapshot: RuntimeStateSnapshot = {
            version: '1.0',
            run_id: runId,
            updated_at: updatedAt,
            project_root: projectRoot,
            mode: modeLabel,
            ...snapshot,
        };
        writeRuntimeState(fullSnapshot, runtimePaths);
        lastCheckpoint = fullSnapshot;
        recordRuntimeEvent(runtimeObservabilityConfig, {
            ts: updatedAt,
            state: fullSnapshot.state.code,
            module: fullSnapshot.module.name,
            field: fullSnapshot.target.field_label,
            action: fullSnapshot.last_action.kind,
            status: fullSnapshot.status,
            details: fullSnapshot.last_action.description,
        });
        if (runtimeObservabilityConfig.hudEnabled && currentPage) {
            await renderRuntimeHud(currentPage, formatHudPayload(fullSnapshot, runtimeObservabilityConfig));
        }

        const intervention = readFreshIntervention(runId, updatedAt, runtimePaths);
        if (!intervention) return;

        console.log(`🧭 Gemini Supervisor: ${intervention.decision} / ${intervention.problem_class}`);
        console.log(`   问题: ${intervention.problem}`);
        console.log(`   指令: ${intervention.instruction_for_codex}`);
        if (shouldPauseForSupervisor(intervention)) {
            throw new Error(`Supervisor requested ${intervention.decision}: ${intervention.problem}`);
        }
    };

    // 2. 加载 YAML 数据（login-only 模式不需要）
    let data: ProductData | undefined;
    if (!loginOnly && yamlPath) {
        console.log('📄 加载产品数据...');
        data = loadProductData(yamlPath);
        console.log(`   ✅ 已加载: ${data.title || '(无标题)'}`);
        console.log(`   📦 SKU: ${data.skus?.length || 0} 个`);
        console.log(`   🧪 运行模式: ${executionPlan.displayLabel}`);
        console.log(`   🎯 执行模块: ${executionPlan.moduleIds.join(', ')}`);
        await checkpoint({
            status: 'running',
            state: { code: 'S0', name: 'Preflight', attempt: 1, retry_budget: 2 },
            module: {
                id: 'preflight',
                name: '预检',
                step: 'load_yaml',
                sequence_index: 0,
                sequence_total: 6,
            },
            target: {
                field_label: path.basename(yamlPath),
                expected_value: data.title || '(无标题)',
                control_type: 'file',
                selector_scope: 'global',
            },
            last_action: {
                kind: 'load_yaml',
                description: `Loaded YAML data with ${data.skus?.length || 0} SKU(s).`,
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
                result: 'ok',
            },
            next_expected_action: {
                kind: 'open_publish_page',
                field_label: 'publish',
                expected_value: 'ready',
            },
            gates: [
                { name: 'yaml_loaded', passed: true, evidence: yamlPath },
            ],
            anomalies: [],
            evidence: {
                log_path: runlogPath,
                screenshot_paths: [],
                dom_snapshot_path: null,
            },
        });
    } else {
        console.log('🔐 登录模式: 仅更新登录状态，不执行自动填表');
    }

    // 3. 启动浏览器
    const { browser, context, page } = await launchBrowser({
        recordVideoDir: browserVideoConfig.enabled ? browserVideoConfig.videoDir : undefined,
    });
    currentPage = page;
    const setVisualStatus = async (payload: {
        state: { code: string; name: string };
        module: { name: string };
        target: { field_label: string };
        last_action: { description: string; kind?: string };
        status: string;
    }, action: string) => {
        const nowIso = new Date().toISOString();
        recordRuntimeEvent(runtimeObservabilityConfig, {
            ts: nowIso,
            state: payload.state.code,
            module: payload.module.name,
            field: payload.target.field_label,
            action,
            status: payload.status,
            details: payload.last_action.description,
        });
        if (runtimeObservabilityConfig.hudEnabled) {
            await renderRuntimeHud(page, formatHudPayload({
                ...payload,
                last_action: {
                    kind: payload.last_action.kind || action,
                    description: payload.last_action.description,
                },
            }, runtimeObservabilityConfig));
        }
    };
    if (keepOpen && !explicitKeepOpen && !process.stdin.isTTY) {
        console.log('🔧 检测到非交互环境，默认保持浏览器打开（如需自动关闭请加 --auto-close）');
    }

    try {
        // 4. 检查是否需要手动登录
        let pageState = await navigateToPublishPage(page);
        if (pageState === 'login') {
            // 被重定向到登录页时，强制切到卖家登录入口（避免停在买家登录页）
            await navigateToLoginPage(page);
            const loginSuccess = await waitForSellerLogin(page);
            if (!loginSuccess) {
                throw new Error('登录超时，未检测到卖家后台登录成功');
            }
            await saveAuth(context);
            pageState = await navigateToPublishPage(page);
            if (pageState !== 'publish') {
                throw new Error('登录后未进入商品发布页');
            }
        }

        await checkpoint({
            status: 'running',
            state: { code: 'S1', name: 'LoginReady', attempt: 1, retry_budget: 2 },
            module: {
                id: 'auth',
                name: '登录与发布页',
                step: 'publish_ready',
                sequence_index: 1,
                sequence_total: 6,
            },
            target: {
                field_label: 'publish_page',
                expected_value: 'ready',
                control_type: 'page',
                selector_scope: 'global',
            },
            last_action: {
                kind: 'navigate_publish',
                description: 'Publish page is ready after login gate.',
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
                result: 'ok',
            },
            next_expected_action: {
                kind: 'fill_category',
                field_label: '类目',
                expected_value: '尾灯总成',
            },
            gates: [
                { name: 'publish_ready', passed: true, evidence: page.url() },
            ],
            anomalies: [],
            evidence: {
                log_path: runlogPath,
                screenshot_paths: [],
                dom_snapshot_path: null,
            },
        });

        if (loginOnly) {
            await saveAuth(context);
            console.log('✅ 登录状态已更新');
            return;
        }

        if (!data) {
            throw new Error('缺少 YAML 数据，请检查命令行参数');
        }

        // 5. 截图：开始前
        await screenshot(page, 'before_fill');

        // ========================================================
        // 6. 逐模块填写
        // ========================================================

        // --- 模块 1: 基本信息 ---
        await setVisualStatus({
            state: { code: 'S1', name: 'LoginReady' },
            module: { name: '基本信息' },
            target: { field_label: '标题 / 类目 / 图片' },
            last_action: { description: '填写标题、类目与营销图' },
            status: 'running',
        }, 'module1_running');
        if (shouldRunModule(executionPlan, '1b')) {
            await fillTitle(page, data);          // 1b 标题（测试流程先填标题）
        }
        if (shouldRunModule(executionPlan, '1a')) {
            await fillCategory(page, data);       // 1a 类目
            await checkpoint({
                status: 'running',
                state: { code: 'S2', name: 'CategoryLocked', attempt: 1, retry_budget: 2 },
                module: {
                    id: 'module1',
                    name: '基本信息',
                    step: 'category_locked',
                    sequence_index: 2,
                    sequence_total: 6,
                },
                target: {
                    field_label: '类目',
                    expected_value: '尾灯总成',
                    control_type: 'category',
                    selector_scope: 'category-panel',
                },
                last_action: {
                    kind: 'fill_category',
                    description: 'Category locked through recent path or guarded fallback.',
                    started_at: new Date().toISOString(),
                    ended_at: new Date().toISOString(),
                    result: 'ok',
                },
                next_expected_action: {
                    kind: 'fill_attributes',
                    field_label: '商品属性',
                    expected_value: 'stable',
                },
                gates: [
                    { name: 'category_locked', passed: true, evidence: '尾灯总成' },
                ],
                anomalies: [],
                evidence: {
                    log_path: runlogPath,
                    screenshot_paths: [],
                    dom_snapshot_path: null,
                },
            });
        }
        if (shouldRunModule(executionPlan, '1c')) {
            await fillCarouselImages(page, data); // 1c 商品图片 ×6
        }
        if (shouldRunModule(executionPlan, '1d')) {
            await fillMarketingImages(page, data); // 1d 营销图 ×2
        }
        if (shouldRunModule(executionPlan, '1e')) {
            if (requiresVideoCategoryBootstrap(executionPlan)) {
                await bootstrapVideoCategoryFromRecent(page, data);
            }
            await fillVideo(page, data);          // 1e 视频
        }

        // --- 模块 2: 商品属性 ---
        if (shouldRunModule(executionPlan, '2')) {
            await setVisualStatus({
                state: { code: 'S2', name: 'CategoryLocked' },
                module: { name: '商品属性' },
                target: { field_label: '商品属性' },
                last_action: { description: '等待商品属性提交稳定' },
                status: 'running',
            }, 'module2_running');
            await fillAttributes(page, data);
            await checkpoint({
                status: 'running',
                state: { code: 'S3', name: 'Module2Stable', attempt: 1, retry_budget: 2 },
                module: {
                    id: 'module2',
                    name: '商品属性',
                    step: 'attributes_complete',
                    sequence_index: 3,
                    sequence_total: 6,
                },
                target: {
                    field_label: '商品属性',
                    expected_value: 'stable',
                    control_type: 'form-section',
                    selector_scope: 'attribute-panel',
                },
                last_action: {
                    kind: 'fill_attributes',
                    description: 'Module 2 attribute flow completed.',
                    started_at: new Date().toISOString(),
                    ended_at: new Date().toISOString(),
                    result: 'ok',
                },
                next_expected_action: {
                    kind: 'fill_skus',
                    field_label: 'SKU',
                    expected_value: 'images_done',
                },
                gates: [
                    { name: 'module2_completed', passed: true, evidence: 'fillAttributes returned' },
                ],
                anomalies: [],
                evidence: {
                    log_path: runlogPath,
                    screenshot_paths: [],
                    dom_snapshot_path: null,
                },
            });
        }

        // --- 模块 3-4: 海关 + 价格设置 ---
        if (shouldRunModule(executionPlan, '3')) {
            await fillCustoms(page, data);
        }
        if (shouldRunModule(executionPlan, '4')) {
            await fillPricingSettings(page, data);
        }
        if (executionPlan.modeKind === 'smoke') {
            console.log('\n⏭️  SMOKE: 跳过模块 3-4');
        }

        // --- 模块 5: SKU 变体 ---
        if (shouldRunModule(executionPlan, '5')) {
            await setVisualStatus({
                state: { code: 'S3', name: 'Module2Stable' },
                module: { name: '销售属性与 SKU 图片' },
                target: { field_label: 'SKU 颜色 / 批量填充 / 图片' },
                last_action: { description: '进入 SKU 颜色、批量填充与图片流程' },
                status: 'running',
            }, 'module5_running');
            await fillSKUs(page, data);               // 价格/库存/名称
            await fillSKUImages(page, data);          // SKU 图片
            await checkpoint({
                status: 'running',
                state: { code: 'S4', name: 'SkuImagesDone', attempt: 1, retry_budget: 2 },
                module: {
                    id: 'module5',
                    name: '销售属性与 SKU 图片',
                    step: 'sku_images_done',
                    sequence_index: 4,
                    sequence_total: 6,
                },
                target: {
                    field_label: 'SKU 图片',
                    expected_value: 'done',
                    control_type: 'modal',
                    selector_scope: 'sku-panel',
                },
                last_action: {
                    kind: 'fill_sku_images',
                    description: `SKU image flow completed for ${data.skus?.length || 0} SKU(s).`,
                    started_at: new Date().toISOString(),
                    ended_at: new Date().toISOString(),
                    result: 'ok',
                },
                next_expected_action: {
                    kind: executionPlan.modeKind === 'smoke' ? 'verify' : 'fill_shipping',
                    field_label: executionPlan.modeKind === 'smoke' ? '人工检查' : '物流与其他设置',
                    expected_value: executionPlan.modeKind === 'smoke' ? 'ready' : 'continue',
                },
                gates: [
                    { name: 'sku_images_done', passed: true, evidence: String(data.skus?.length || 0) },
                ],
                anomalies: [],
                evidence: {
                    log_path: runlogPath,
                    screenshot_paths: [],
                    dom_snapshot_path: null,
                },
            });
        }

        if (shouldRunModule(executionPlan, '6a')) {
            // --- 模块 6: 详情描述 ---
            await fillBuyersNote(page, data);
        }
        if (shouldRunModule(executionPlan, '6b')) {
            await fillDetailImages(page, data);
        }
        if (shouldRunModule(executionPlan, '7')) {
            await fillShipping(page, data);
        }
        if (shouldRunModule(executionPlan, '8')) {
            await fillOtherSettings(page, data);
        }
        if (executionPlan.modeKind === 'smoke') {
            console.log('\n⏭️  SMOKE: 跳过模块 6-8');
        }

        // ========================================================
        // 7. 填写完成 — 等待人工确认
        // ========================================================
        await screenshot(page, 'after_fill');
        await checkpoint({
            status: 'waiting_human',
            state: { code: 'S5', name: 'Verify', attempt: 1, retry_budget: 2 },
            module: {
                id: 'verify',
                name: '人工检查',
                step: 'after_fill',
                sequence_index: 5,
                sequence_total: 6,
            },
            target: {
                field_label: '人工检查',
                expected_value: 'confirm',
                control_type: 'human_gate',
                selector_scope: 'global',
            },
            last_action: {
                kind: 'screenshot_after_fill',
                description: 'Automation completed and is waiting for human verification.',
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
                result: 'ok',
            },
            next_expected_action: {
                kind: 'human_confirm',
                field_label: 'Enter',
                expected_value: 'continue',
            },
            gates: [
                { name: 'after_fill_ready', passed: true, evidence: 'after_fill screenshot captured' },
            ],
            anomalies: [],
            evidence: {
                log_path: runlogPath,
                screenshot_paths: [],
                dom_snapshot_path: null,
            },
        });

        console.log('\n' + '='.repeat(50));
        console.log('✅ 自动填写完成！');
        console.log('='.repeat(50));
        console.log('\n请在浏览器中检查所有内容:');
        console.log('  □ 标题是否正确');
        console.log('  □ 图片顺序是否正确');
        console.log('  □ 属性是否匹配');
        console.log('  □ SKU 名称/价格是否正确');
        console.log('  □ 买家须知是否正常显示');
        console.log('  □ 重量/尺寸是否合理');

        await waitForHumanConfirmation('确认无误后按 Enter 保存登录状态并退出 (请手动点击发布按钮)');

        // 8. 保存最新的 cookie
        await saveAuth(context);
        await checkpoint({
            status: 'completed',
            state: { code: 'S6', name: 'Done', attempt: 1, retry_budget: 2 },
            module: {
                id: 'done',
                name: '完成',
                step: 'save_auth',
                sequence_index: 6,
                sequence_total: 6,
            },
            target: {
                field_label: 'auth',
                expected_value: 'saved',
                control_type: 'storage',
                selector_scope: 'global',
            },
            last_action: {
                kind: 'save_auth',
                description: 'Saved latest auth state after successful run.',
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
                result: 'ok',
            },
            next_expected_action: {
                kind: 'none',
                field_label: 'none',
                expected_value: 'done',
            },
            gates: [
                { name: 'auth_saved', passed: true, evidence: 'storage-state.json updated' },
            ],
            anomalies: [],
            evidence: {
                log_path: runlogPath,
                screenshot_paths: [],
                dom_snapshot_path: null,
            },
        });

    } catch (error) {
        process.exitCode = 1;
        const updatedAt = new Date().toISOString();
        if (lastCheckpoint) {
            const failedCheckpoint = lastCheckpoint as RuntimeStateSnapshot;
            writeRuntimeState({
                ...failedCheckpoint,
                updated_at: updatedAt,
                status: 'failed',
                last_action: {
                    kind: failedCheckpoint.last_action.kind,
                    description: error instanceof Error ? error.message : String(error),
                    started_at: failedCheckpoint.last_action.started_at,
                    ended_at: updatedAt,
                    result: 'error',
                },
            }, runtimePaths);
        }
        console.error('\n❌ 执行出错:', error);
        await screenshot(page, 'error').catch(() => {
            console.error('⚠️  错误截图失败');
        });
    } finally {
        if (keepOpen) {
            if (browserVideoConfig.enabled) {
                console.log(`🎥 浏览器侧录已启用，但 --keep-open 模式会延后视频落盘直到浏览器真正关闭: ${path.relative(projectRoot, browserVideoConfig.artifactRoot).replace(/\\/g, '/')}`);
            }
            console.log('\n🔧 浏览器保持打开，请手动发布后关闭');
            console.log('   或按 Ctrl+C 退出脚本');
            await new Promise<void>(() => { }); // 显式要求 keep-open 时才保持阻塞
            return;
        }

        console.log('\n🧹 自动关闭浏览器（如需保持打开，请加 --keep-open）');
        await browser.close().catch(() => {
            console.error('⚠️  浏览器关闭失败，请手动关闭');
        });

        if (browserVideoConfig.enabled) {
            try {
                const savedVideoPath = canonicalizeRecordedVideo(browserVideoConfig.videoDir, browserVideoConfig.videoPath);
                const framePaths = savedVideoPath && browserVideoConfig.extractFrames
                    ? extractVideoFrames(savedVideoPath, browserVideoConfig.framesDir, browserVideoConfig.ffmpegPath, browserVideoConfig.frameFps)
                    : [];
                writeBrowserVideoManifest(browserVideoConfig, {
                    runId,
                    mode: modeLabel,
                    videoPath: savedVideoPath,
                    eventsPath: runtimeObservabilityConfig.enabled ? runtimeObservabilityConfig.eventsPath : null,
                    framePaths,
                });
                console.log(`🎥 浏览器录屏已保存: ${path.relative(projectRoot, browserVideoConfig.videoPath).replace(/\\/g, '/')}`);
                if (framePaths.length > 0) {
                    console.log(`🖼️  已抽帧: ${path.relative(projectRoot, browserVideoConfig.framesDir).replace(/\\/g, '/')} (${framePaths.length} 张)`);
                }
                console.log(`🧾 录屏清单: ${path.relative(projectRoot, browserVideoConfig.manifestPath).replace(/\\/g, '/')}`);
            } catch (error) {
                console.error(`⚠️  浏览器录屏产物落盘失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        await runlogMirror.close().catch(() => {
            // Ignore log stream teardown errors; browser cleanup already completed.
        });
    }
}

main().catch(console.error);
