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
    ensureAutomationPageVisible,
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
    fillAppDescriptionManualGate,
    fillShipping,
    fillOtherSettings,
} from './modules';
import type { Module5ProgressEvent } from './modules';
import type { ModuleExecutionResult } from './modules/shared';
import {
    createRunId,
    getRuntimePaths,
    readFreshIntervention,
    shouldPauseForSupervisor,
    upsertModuleOutcome,
    writeRuntimeState,
} from './runtime-supervision';
import type { ModuleOutcome, ModuleOutcomeStatus, RuntimeStateSnapshot } from './runtime-supervision';
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
import { appendProjectArtifactPath } from './runtime-evidence';
import {
    buildExecutionPlan,
    parseRequestedModules,
    requiresVideoCategoryBootstrap,
    shouldRunModule,
} from './execution-plan';
import type { ModuleId } from './execution-plan';
import { validatePreflight } from './preflight';
import {
    syncLatestManualHandoff,
} from './manual-handoff-summary';

const MODULE_LABELS: Record<ModuleId, string> = {
    '1a': '类目',
    '1b': '标题',
    '1c': '商品图',
    '1d': '营销图',
    '1e': '商品视频',
    '2': '商品属性',
    '3': '海关信息',
    '4': '价格与基础售卖',
    '5': 'SKU 与销售属性',
    '6a': '买家须知',
    '6b': '详情图',
    '6c': 'APP 描述',
    '7': '包装与物流',
    '8': '其它设置',
};

function printUsage(): void {
    console.error('❌ 用法:');
    console.error('   npx tsx src/main.ts <yaml文件路径> [--smoke] [--module=1e] [--keep-open] [--auto-close]');
    console.error('   npx tsx src/main.ts --login-only [--keep-open]');
    console.error('   例: npx tsx src/main.ts ../products/f150-tail-light.yaml --modules=1e --auto-close');
}

function resolveProjectRoot(): string {
    const override = process.env.AUTOMATION_PROJECT_ROOT?.trim();
    if (override) {
        return path.resolve(override);
    }
    return path.resolve(__dirname, '..');
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

    const projectRoot = resolveProjectRoot();
    const runId = createRunId();
    const runtimePaths = getRuntimePaths(projectRoot);
    const modeLabel = executionPlan.modeLabel;
    const runlogMirror = createRunlogMirror(projectRoot, runId, modeLabel, process.env.RUNLOG_PATH);
    const runlogPath = runlogMirror.relativePath;
    const browserVideoConfig = getBrowserVideoArtifactsConfig(projectRoot, runId, modeLabel);
    const runtimeObservabilityConfig = getRuntimeObservabilityConfig(browserVideoConfig.artifactRoot);
    let lastCheckpoint: RuntimeStateSnapshot | null = null;
    let currentPage: Page | null = null;
    let capturedScreenshotPaths: string[] = [];
    let moduleOutcomes: ModuleOutcome[] = executionPlan.moduleIds.map((id) => ({
        id,
        name: MODULE_LABELS[id],
        status: 'pending',
        evidence: [],
    }));
    let activeModuleId: ModuleId | null = null;

    if (!loginOnly) {
        syncLatestManualHandoff(null, projectRoot);
    }

    const snapshotModuleOutcomes = (): ModuleOutcome[] => moduleOutcomes.map((outcome) => ({
        ...outcome,
        evidence: [...outcome.evidence],
    }));

    const markModuleOutcome = (id: ModuleId, status: ModuleOutcomeStatus, evidence: string | string[]) => {
        moduleOutcomes = upsertModuleOutcome(moduleOutcomes, {
            id,
            name: MODULE_LABELS[id],
            status,
            evidence: Array.isArray(evidence) ? evidence : [evidence],
        });
    };

    const recordModuleExecutionResult = (id: ModuleId, result: ModuleExecutionResult) => {
        const normalizedScreenshotPaths: string[] = [];
        for (const screenshotPath of result.screenshotPaths) {
            const nextPaths = appendProjectArtifactPath(capturedScreenshotPaths, screenshotPath, projectRoot);
            const normalizedPath = nextPaths[nextPaths.length - 1];
            capturedScreenshotPaths = nextPaths;
            if (normalizedPath) {
                normalizedScreenshotPaths.push(normalizedPath);
            }
        }

        markModuleOutcome(id, result.status, [...result.evidence, ...normalizedScreenshotPaths]);
    };

    const checkpoint = async (snapshot: Omit<RuntimeStateSnapshot, 'version' | 'run_id' | 'updated_at' | 'project_root' | 'mode' | 'module_outcomes'>) => {
        const updatedAt = new Date().toISOString();
        const fullSnapshot: RuntimeStateSnapshot = {
            version: '1.0',
            run_id: runId,
            updated_at: updatedAt,
            project_root: projectRoot,
            mode: modeLabel,
            ...snapshot,
            module_outcomes: snapshotModuleOutcomes(),
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
                screenshot_paths: capturedScreenshotPaths.slice(),
                dom_snapshot_path: null,
            },
        });

        const preflight = validatePreflight(data, executionPlan, yamlPath);
        for (const warning of preflight.warnings) {
            console.log(`   ⚠️  Preflight: ${warning}`);
        }

        if (!preflight.ok) {
            for (const error of preflight.errors) {
                console.error(`   ❌ Preflight: ${error}`);
            }
            await checkpoint({
                status: 'blocked',
                state: { code: 'S0', name: 'Preflight', attempt: 1, retry_budget: 2 },
                module: {
                    id: 'preflight',
                    name: '预检',
                    step: 'validate_selected_modules',
                    sequence_index: 0,
                    sequence_total: 6,
                },
                target: {
                    field_label: path.basename(yamlPath),
                    expected_value: executionPlan.moduleIds.join(', '),
                    control_type: 'validation',
                    selector_scope: 'global',
                },
                last_action: {
                    kind: 'validate_preflight',
                    description: preflight.errors.join(' | '),
                    started_at: new Date().toISOString(),
                    ended_at: new Date().toISOString(),
                    result: 'blocked',
                },
                next_expected_action: {
                    kind: 'fix_input_data',
                    field_label: 'preflight',
                    expected_value: 'all gates pass',
                },
                gates: [
                    { name: 'yaml_loaded', passed: true, evidence: yamlPath },
                    ...preflight.gates,
                ],
                anomalies: [],
                evidence: {
                    log_path: runlogPath,
                    screenshot_paths: capturedScreenshotPaths.slice(),
                    dom_snapshot_path: null,
                },
            });
            process.exitCode = 1;
            await runlogMirror.close().catch(() => { });
            return;
        }

        await checkpoint({
            status: 'running',
            state: { code: 'S0', name: 'Preflight', attempt: 1, retry_budget: 2 },
            module: {
                id: 'preflight',
                name: '预检',
                step: 'validate_selected_modules',
                sequence_index: 0,
                sequence_total: 6,
            },
            target: {
                field_label: path.basename(yamlPath),
                expected_value: executionPlan.moduleIds.join(', '),
                control_type: 'validation',
                selector_scope: 'global',
            },
            last_action: {
                kind: 'validate_preflight',
                description: `Validated selected modules: ${executionPlan.moduleIds.join(', ')}`,
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
                ...preflight.gates,
            ],
            anomalies: [],
            evidence: {
                log_path: runlogPath,
                screenshot_paths: capturedScreenshotPaths.slice(),
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

        if (keepOpen) {
            await ensureAutomationPageVisible(page);
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
        const beforeFillScreenshotPath = await screenshot(page, 'before_fill');
        capturedScreenshotPaths = appendProjectArtifactPath(capturedScreenshotPaths, beforeFillScreenshotPath, projectRoot);

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
            activeModuleId = '1b';
            await fillTitle(page, data);          // 1b 标题（测试流程先填标题）
            markModuleOutcome('1b', 'auto_ok', 'title_filled');
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '1a')) {
            activeModuleId = '1a';
            await fillCategory(page, data);       // 1a 类目
            markModuleOutcome('1a', 'auto_ok', 'category_locked');
            activeModuleId = null;
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
                    screenshot_paths: capturedScreenshotPaths.slice(),
                    dom_snapshot_path: null,
                },
            });
        }
        if (shouldRunModule(executionPlan, '1c')) {
            activeModuleId = '1c';
            const carouselResult = await fillCarouselImages(page, data); // 1c 商品图片 ×6
            recordModuleExecutionResult('1c', carouselResult);
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '1d')) {
            activeModuleId = '1d';
            const marketingResult = await fillMarketingImages(page, data); // 1d 营销图 ×2
            recordModuleExecutionResult('1d', marketingResult);
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '1e')) {
            activeModuleId = '1e';
            if (requiresVideoCategoryBootstrap(executionPlan)) {
                await bootstrapVideoCategoryFromRecent(page, data);
            }
            const videoResult = await fillVideo(page, data);          // 1e 视频
            recordModuleExecutionResult('1e', videoResult);
            activeModuleId = null;
        }

        // --- 模块 2: 商品属性 ---
        if (shouldRunModule(executionPlan, '2')) {
            activeModuleId = '2';
            await setVisualStatus({
                state: { code: 'S2', name: 'CategoryLocked' },
                module: { name: '商品属性' },
                target: { field_label: '商品属性' },
                last_action: { description: '等待商品属性提交稳定' },
                status: 'running',
            }, 'module2_running');
            await fillAttributes(page, data);
            markModuleOutcome('2', 'auto_ok', 'module2_completed');
            activeModuleId = null;
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
                    screenshot_paths: capturedScreenshotPaths.slice(),
                    dom_snapshot_path: null,
                },
            });
        }

        // --- 模块 3-4: 海关 + 价格设置 ---
        if (shouldRunModule(executionPlan, '3')) {
            activeModuleId = '3';
            const customsManualGateScreenshot = await fillCustoms(page, data);
            capturedScreenshotPaths = appendProjectArtifactPath(capturedScreenshotPaths, customsManualGateScreenshot, projectRoot);
            markModuleOutcome('3', data.customs?.hs_code ? 'manual_gate' : 'detect_only', data.customs?.hs_code ? 'customs_manual_gate_or_default' : 'customs_default');
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '4')) {
            activeModuleId = '4';
            await fillPricingSettings(page, data);
            markModuleOutcome('4', 'auto_ok', 'pricing_settings_done');
            activeModuleId = null;
        }
        if (executionPlan.modeKind === 'smoke') {
            console.log('\n⏭️  SMOKE: 跳过模块 3-4');
        }

        // --- 模块 5: SKU 变体 ---
        if (shouldRunModule(executionPlan, '5')) {
            activeModuleId = '5';
            await setVisualStatus({
                state: { code: 'S3', name: 'Module2Stable' },
                module: { name: '销售属性与 SKU 图片' },
                target: { field_label: 'SKU 颜色 / 批量填充 / 图片' },
                last_action: { description: '进入 SKU 颜色、批量填充与图片流程' },
                status: 'running',
            }, 'module5_running');
            const reportModule5Progress = async (event: Module5ProgressEvent) => {
                await setVisualStatus({
                    state: { code: 'S3', name: 'Module2Stable' },
                    module: { name: '销售属性与 SKU 图片' },
                    target: { field_label: event.field },
                    last_action: { description: event.details, kind: event.action },
                    status: 'running',
                }, event.action);
            };
            await fillSKUs(page, data, { onProgress: reportModule5Progress }); // 价格/库存/名称
            await fillSKUImages(page, data, { onProgress: reportModule5Progress }); // SKU 图片
            markModuleOutcome('5', 'auto_ok', 'sku_images_done');
            activeModuleId = null;
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
                    screenshot_paths: capturedScreenshotPaths.slice(),
                    dom_snapshot_path: null,
                },
            });
        }

        if (shouldRunModule(executionPlan, '6a')) {
            activeModuleId = '6a';
            // --- 模块 6: 详情描述 ---
            await fillBuyersNote(page, data);
            markModuleOutcome('6a', 'auto_ok', 'buyers_note_done');
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '6b')) {
            activeModuleId = '6b';
            const detailImagesResult = await fillDetailImages(page, data);
            recordModuleExecutionResult('6b', detailImagesResult);
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '6c')) {
            activeModuleId = '6c';
            const appDescriptionManualGateScreenshot = await fillAppDescriptionManualGate(page, data);
            capturedScreenshotPaths = appendProjectArtifactPath(capturedScreenshotPaths, appDescriptionManualGateScreenshot, projectRoot);
            markModuleOutcome('6c', 'manual_gate', 'app_description_manual_gate');
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '7')) {
            activeModuleId = '7';
            await fillShipping(page, data);
            markModuleOutcome('7', 'auto_ok', 'shipping_done');
            activeModuleId = null;
        }
        if (shouldRunModule(executionPlan, '8')) {
            activeModuleId = '8';
            const otherSettingsManualGateScreenshot = await fillOtherSettings(page, data);
            capturedScreenshotPaths = appendProjectArtifactPath(capturedScreenshotPaths, otherSettingsManualGateScreenshot, projectRoot);
            markModuleOutcome('8', 'manual_gate', 'other_settings_manual_gate');
            activeModuleId = null;
        }
        if (executionPlan.modeKind === 'smoke') {
            console.log('\n⏭️  SMOKE: 跳过模块 6-8');
        }

        // ========================================================
        // 7. 填写完成 — 等待人工确认
        // ========================================================
        const afterFillScreenshotPath = await screenshot(page, 'after_fill');
        capturedScreenshotPaths = appendProjectArtifactPath(capturedScreenshotPaths, afterFillScreenshotPath, projectRoot);
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
                screenshot_paths: capturedScreenshotPaths.slice(),
                dom_snapshot_path: null,
            },
        });

        if (lastCheckpoint) {
            const handoffArtifacts = syncLatestManualHandoff(lastCheckpoint, projectRoot, 'runtime/state.json');
            if (handoffArtifacts) {
                console.log('\n🧾 已生成人工交接摘要:');
                console.log(`   JSON: ${handoffArtifacts.json_path}`);
                console.log(`   Markdown: ${handoffArtifacts.markdown_path}`);
            }
        }

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

        if (keepOpen) {
            await ensureAutomationPageVisible(page);
        }

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
                screenshot_paths: capturedScreenshotPaths.slice(),
                dom_snapshot_path: null,
            },
        });

    } catch (error) {
        process.exitCode = 1;
        const updatedAt = new Date().toISOString();
        let errorScreenshotPath: string | null = null;
        try {
            errorScreenshotPath = await screenshot(page, 'error');
            capturedScreenshotPaths = appendProjectArtifactPath(capturedScreenshotPaths, errorScreenshotPath, projectRoot);
        } catch {
            console.error('⚠️  错误截图失败');
        }
        if (lastCheckpoint) {
            const failedCheckpoint = lastCheckpoint as RuntimeStateSnapshot;
            if (activeModuleId) {
                markModuleOutcome(activeModuleId, 'failed', error instanceof Error ? error.message : String(error));
            }
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
                module_outcomes: snapshotModuleOutcomes(),
                evidence: {
                    ...failedCheckpoint.evidence,
                    screenshot_paths: capturedScreenshotPaths.slice(),
                },
            }, runtimePaths);
        }
        console.error('\n❌ 执行出错:', error);
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
