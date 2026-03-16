import type { Locator, Page } from 'playwright';
import type { ProductData, SKU } from './types';
import { randomDelay, screenshot } from './browser';
import {
    autoModuleExecutionResult,
    dedupeNonEmpty,
    getMainScrollContainer,
    manualGateModuleExecutionResult,
    type ModuleExecutionResult,
    pickNthVisible,
    recentSelectCategoryPath,
    safeClick,
    scrollMainContent,
} from './modules/shared';
import * as fs from 'fs';
import * as path from 'path';


// ============================================================
// 默认类目路径 (尾灯总成)
// ============================================================
const DEFAULT_CATEGORY_PATH = ['汽车及零配件', '车灯', '信号灯总成', '尾灯总成'];
const STRICT_TAIL_CATEGORY_RECENT_PATH = '汽车及零配件 / 车灯 / 信号灯总成 / 尾灯总成';
const STRICT_TAIL_CATEGORY_REFERENCE_TEXT = '信号灯总成 >> 尾灯总成';

interface SkuRuntimeState {
    colorSelected: boolean;
    customNameFilled: boolean;
    pickedColor?: string;
}

export interface MultiSkuBatchPlan {
    stock?: string;
    weightKg?: string;
    lengthCm?: string;
    widthCm?: string;
    heightCm?: string;
}

interface BatchFillResult {
    performed: boolean;
    sharedStockFilled: boolean;
    readyForRowFill: boolean;
}

export interface Module5ProgressEvent {
    action:
        | 'fill_sku_variants'
        | 'fill_sku_batch_fields'
        | 'fill_sku_row_values'
        | 'fill_sku_shared_fields'
        | 'fill_sku_images_running'
        | 'fill_sku_image_modal_running'
        | 'fill_sku_image_tree_running'
        | 'fill_sku_image_tree_level_1_running'
        | 'fill_sku_image_tree_level_2_running'
        | 'fill_sku_image_tree_level_3_running'
        | 'fill_sku_image_tree_level_4_running'
        | 'fill_sku_image_select_running'
        | 'fill_sku_image_confirm_running';
    field: string;
    details: string;
}

export interface Module5ProgressHooks {
    onProgress?: (event: Module5ProgressEvent) => void | Promise<void>;
}

const skuRuntimeState = new Map<number, SkuRuntimeState>();
const skuImageModalCancelInjections = new Set<string>();

function resetSkuRuntimeState(): void {
    skuRuntimeState.clear();
}

function patchSkuRuntimeState(index: number, patch: Partial<SkuRuntimeState>): void {
    const prev = skuRuntimeState.get(index) ?? { colorSelected: false, customNameFilled: false };
    skuRuntimeState.set(index, { ...prev, ...patch });
}

function formatNumericForInput(value: number | undefined): string | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return undefined;
    }
    if (Number.isInteger(value)) return String(value);
    return String(value).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function getUniformSkuNumberValue(
    skus: SKU[],
    pick: (sku: SKU) => number,
): number | undefined {
    if (!skus.length) return undefined;
    const first = pick(skus[0]);
    if (!Number.isFinite(first)) return undefined;
    return skus.every((sku) => pick(sku) === first) ? first : undefined;
}

export function resolveListingTitle(data: Pick<ProductData, 'title'>): string {
    return (data.title || '').trim();
}

export function resolveSkuCustomName(sku: Pick<SKU, 'name' | 'image'>): string {
    const explicitName = (sku.name || '').trim();
    if (explicitName) return explicitName;

    const imagePath = (sku.image || '').trim();
    if (!imagePath) return '';

    return path.basename(imagePath, path.extname(imagePath)).trim();
}

export function deriveMultiSkuBatchPlan(
    data: Pick<ProductData, 'skus' | 'weight_kg' | 'package_dimensions'>,
): MultiSkuBatchPlan {
    const plan: MultiSkuBatchPlan = {};
    const skus = data.skus || [];

    const uniformStock = getUniformSkuNumberValue(skus, (sku) => sku.stock);
    const stock = formatNumericForInput(uniformStock);
    if (stock) {
        plan.stock = stock;
    }

    const weightKg = formatNumericForInput(data.weight_kg);
    if (weightKg) {
        plan.weightKg = weightKg;
    }

    const dims = data.package_dimensions;
    const lengthCm = formatNumericForInput(dims?.length_cm);
    const widthCm = formatNumericForInput(dims?.width_cm);
    const heightCm = formatNumericForInput(dims?.height_cm);
    if (lengthCm && widthCm && heightCm) {
        plan.lengthCm = lengthCm;
        plan.widthCm = widthCm;
        plan.heightCm = heightCm;
    }

    return plan;
}

function normalizeUiSignal(value: string | undefined): string {
    return (value || '').replace(/\s+/g, '').toLowerCase();
}

function optionHintsMatchText(optionHints: string[], text: string): boolean {
    const normalizedText = normalizeUiSignal(text);
    if (!normalizedText) return false;
    return optionHints
        .filter(Boolean)
        .map((hint) => normalizeUiSignal(hint))
        .some((hint) => hint && normalizedText.includes(hint));
}

async function collectVisibleOptionTexts(options: Locator, maxCount: number = 10): Promise<string[]> {
    const count = await options.count().catch(() => 0);
    const texts: string[] = [];
    for (let i = 0; i < Math.min(count, maxCount); i++) {
        const option = options.nth(i);
        if (!await option.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const text = ((await option.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        texts.push(text);
    }
    return texts;
}

async function abortOnInteractionDrift(
    page: Page,
    fieldLabel: string,
    optionHints: string[],
    options: Locator,
): Promise<boolean> {
    const visibleOptions = await collectVisibleOptionTexts(options);
    if (visibleOptions.length === 0) return false;
    const hasExpectedOption = visibleOptions.some((text) => optionHintsMatchText(optionHints, text));
    if (hasExpectedOption) return false;

    console.log(`   ⚠️  ${fieldLabel} 当前真实交互与预期不一致，停止沿用旧逻辑: ${visibleOptions.slice(0, 5).join(' | ')}`);
    await page.keyboard.press('Escape').catch(() => { });
    await page.waitForTimeout(120);
    return true;
}

function resolveProductTypeHints(data: Pick<ProductData, 'category' | 'attributes'>): string[] {
    const explicit = (data.attributes?.product_type || '').trim();
    const categorySource = (data.category || DEFAULT_CATEGORY_PATH.join(' > ')).trim();
    const seed = explicit || categorySource;

    if (/尾灯总成|Tail\s*Light/i.test(seed)) {
        return dedupeNonEmpty([
            explicit,
            '尾灯总成(Tail Light Assembly)',
            'Tail Light Assembly',
            '尾灯总成',
        ]);
    }
    if (/大灯总成|头灯总成|Headlight/i.test(seed)) {
        return dedupeNonEmpty([
            explicit,
            '大灯总成(Headlight Assembly)',
            'Headlight Assembly',
            '大灯总成',
        ]);
    }
    if (/雾灯总成|Fog/i.test(seed)) {
        return dedupeNonEmpty([
            explicit,
            '雾灯总成(Fog Lamp Assembly)',
            'Fog Lamp Assembly',
            '雾灯总成',
        ]);
    }

    return dedupeNonEmpty([explicit]);
}

function resolveVoltageHints(value: string | undefined): string[] {
    const raw = (value || '').trim();
    if (!raw) return [];

    const hints = [raw];
    if (/12/i.test(raw)) {
        hints.push('12伏(12 V)', '12伏', '12V', '12 V');
    }
    if (/24/i.test(raw)) {
        hints.push('24伏(24 V)', '24伏', '24V', '24 V');
    }
    return dedupeNonEmpty(hints);
}

function resolveAccessoryPositionHints(value: string | undefined): string[] {
    const raw = (value || '').trim();
    if (!raw) return [];

    const hints = [raw];
    if (/右\s*\+\s*左|right\s*&\s*left|right\s*\+\s*left/i.test(raw)) {
        hints.push('右+左(Right & left)', '右+左', 'Right & left', 'Right & Left');
    }
    if (/左|left/i.test(raw) && !/右\s*\+\s*左|right\s*&\s*left/i.test(raw)) {
        hints.push('左(Left)', '左', 'Left');
    }
    if (/右|right/i.test(raw) && !/右\s*\+\s*左|right\s*&\s*left/i.test(raw)) {
        hints.push('右(Right)', '右', 'Right');
    }
    return dedupeNonEmpty(hints);
}


// ============================================================
// 模块 1a: 类目选择 🟡
// ============================================================

export async function fillCategory(page: Page, data: ProductData): Promise<void> {
    console.log('\n📂 模块 1a: 类目选择...');
    const categoryPath = data.category
        ? data.category.split('>').map(s => s.trim())
        : DEFAULT_CATEGORY_PATH;
    console.log(`   目标: ${categoryPath.join(' → ')}`);

    const categoryInputCandidates = page.locator(
        'input[placeholder*="商品名称关键词"], input[placeholder*="商品ID"], input[placeholder*="商品链接"], input[placeholder*="搜索类目"], input[placeholder*="类目"], input[placeholder*="category"]'
    );
    const categoryInput: Locator = (await pickNthVisible(categoryInputCandidates, 0)) ?? categoryInputCandidates.first();
    const recentBtnCandidates = page.locator('text=最近使用');

    const isSkuTabVisible = async (): Promise<boolean> =>
        page.locator('text=SKU价格与库存, text=SKU Price & Inventory').first()
            .isVisible({ timeout: 900 })
            .catch(() => false);

    const ensureCategoryGate = async (phase: string, categoryValue: string): Promise<void> => {
        const refChecked = await ensureReferenceTailChecked();
        const schemaReady = await page.evaluate(() => {
            const text = (document.body?.innerText || '').replace(/\s+/g, '');
            return text.includes('高关注化学品') || text.includes('适用车型') || text.includes('光线颜色');
        }).catch(() => false);
        let skuTabReady = false;
        for (let i = 0; i < 5; i++) {
            if (await isSkuTabVisible()) {
                skuTabReady = true;
                break;
            }
            await scrollMainContent(page, 420);
            await page.waitForTimeout(180);
        }

        if (!categoryValue.includes('尾灯总成') && !refChecked && !schemaReady) {
            throw new Error(`CRITICAL: 类目未锁定（phase=${phase}, value="${categoryValue}"）`);
        }
        if (!categoryValue.includes('尾灯总成') && !refChecked && schemaReady) {
            console.log(`   ↪️  类目值为空但检测到表单 Schema 已加载（phase=${phase}），允许继续`);
        }
        if (!skuTabReady && !schemaReady) {
            throw new Error(`CRITICAL: SKU Tab 未就绪（phase=${phase}）`);
        }
    };

    const confirmCategorySwitchIfPrompted = async (): Promise<void> => {
        const switchModal = page.locator(
            '.ait-dialog:has-text("更换类目"), .next-dialog:has-text("更换类目"), [role="dialog"]:has-text("更换类目"), [role="dialog"]:has-text("Change category")'
        ).last();
        if (!await switchModal.isVisible({ timeout: 700 }).catch(() => false)) return;

        const confirmBtn = await pickNthVisible(
            switchModal.locator('button:has-text("确定"), button:has-text("确认"), button:has-text("OK"), button:has-text("Confirm"), [role="button"]:has-text("确定")'),
            0,
        );
        if (confirmBtn) {
            await safeClick(confirmBtn, 1600);
            await page.waitForTimeout(280);
            console.log('   ↪️  已确认「更换类目」弹窗');
            return;
        }

        // 回退：弹窗内最后一个主按钮通常为确认
        const fallbackBtn = await pickNthVisible(switchModal.locator('button, [role="button"]'), 1);
        if (fallbackBtn) {
            await safeClick(fallbackBtn, 1400);
            await page.waitForTimeout(280);
            console.log('   ↪️  已通过回退路径确认类目弹窗');
        }
    };

    const ensureReferenceTailChecked = async (): Promise<boolean> => {
        const refRowCandidates = page.locator('.radio-item, .next-radio-wrapper, [role="radio"], label, li, div')
            .filter({ hasText: STRICT_TAIL_CATEGORY_REFERENCE_TEXT });
        const refRow = await pickNthVisible(refRowCandidates, 0);
        if (!refRow) return false;

        const refInput = refRow.locator('input.next-radio-input, input[type="radio"]').first();
        if (await refInput.isVisible({ timeout: 500 }).catch(() => false)) {
            await refInput.click({ force: true }).catch(async () => {
                const box = await refInput.boundingBox();
                if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            });
        } else {
            await refRow.click().catch(async () => {
                const box = await refRow.boundingBox();
                if (box) await page.mouse.click(box.x + Math.min(16, box.width * 0.08), box.y + box.height / 2);
            });
        }
        await randomDelay(250, 550);

        const checkedByInput = await refRow
            .locator('input.next-radio-input:checked, input[type="radio"]:checked')
            .first()
            .isVisible({ timeout: 400 })
            .catch(() => false);
        const checkedByAria = await page
            .locator(`[role="radio"][aria-checked="true"]:has-text("${STRICT_TAIL_CATEGORY_REFERENCE_TEXT}")`)
            .first()
            .isVisible({ timeout: 400 })
            .catch(() => false);
        const checkedByClass = await refRow
            .locator('.is-checked, .checked')
            .first()
            .isVisible({ timeout: 400 })
            .catch(() => false);
        return checkedByInput || checkedByAria || checkedByClass;
    };

    try {
        const currentCategory = await categoryInput.inputValue().catch(() => '');
        if (currentCategory.includes('尾灯总成')) {
            await ensureCategoryGate('precheck', currentCategory);
            console.log('   ✅ 类目已锁定（尾灯总成）');
            return;
        }

        const waitForRecentButton = async (timeoutMs: number = 12000): Promise<Locator | null> => {
            const deadline = Date.now() + timeoutMs;
            let sawLoadingShell = false;

            while (Date.now() < deadline) {
                const visibleRecentBtn = await pickNthVisible(recentBtnCandidates, 0);
                if (visibleRecentBtn) {
                    if (sawLoadingShell) {
                        console.log('   ↪️  类目区域经历加载态后恢复，继续点击「最近使用」');
                    }
                    return visibleRecentBtn;
                }

                const loadingState = await page.evaluate(() => {
                    const bodyText = (document.body?.innerText || '').replace(/\s+/g, '');
                    const interactiveCount = document.querySelectorAll('input, button, textarea, [role="button"], [role="combobox"]').length;
                    const loadingNode = document.querySelector(
                        '[class*="loading"], [class*="spinner"], [class*="spin"], .next-loading, .next-spin'
                    );
                    const shellLike = bodyText.length < 80 || interactiveCount < 4;
                    return {
                        loading: !!loadingNode,
                        shellLike,
                    };
                }).catch(() => ({ loading: false, shellLike: false }));

                if (loadingState.loading || loadingState.shellLike) {
                    sawLoadingShell = true;
                }

                await page.waitForTimeout(700);
            }

            return null;
        };

        const selectTailFromRecent = async (): Promise<void> => {
            const recentBtn = await waitForRecentButton();
            if (!recentBtn) {
                throw new Error('未找到可见的「最近使用」按钮');
            }
            await recentBtn.scrollIntoViewIfNeeded().catch(() => { });
            await safeClick(recentBtn, 1600);
            await randomDelay(350, 750);

            const strictPathPattern = /汽车及零配件\s*(?:\/|>>)\s*车灯\s*(?:\/|>>)\s*信号灯总成\s*(?:\/|>>)\s*尾灯总成/;
            const recentOptionCandidates = [
                page.locator('.category-history-lists > div').filter({ hasText: strictPathPattern }).first(),
                page.locator('[class*="history"] div').filter({ hasText: strictPathPattern }).first(),
                page.locator('li, div').filter({ hasText: STRICT_TAIL_CATEGORY_RECENT_PATH }).first(),
            ];

            let strictRecentOption: Locator | null = null;
            for (const candidate of recentOptionCandidates) {
                if (await candidate.isVisible({ timeout: 700 }).catch(() => false)) {
                    strictRecentOption = candidate;
                    break;
                }
            }
            if (!strictRecentOption) {
                throw new Error('最近使用下拉中未命中「汽车及零配件 / 车灯 / 信号灯总成 / 尾灯总成」');
            }

            let recentClicked = await strictRecentOption.click({ force: true, timeout: 1200 })
                .then(() => true)
                .catch(() => false);
            if (!recentClicked) {
                recentClicked = await safeClick(strictRecentOption, 1600);
            }
            if (!recentClicked) {
                recentClicked = await page.evaluate(() => {
                    const pattern = /汽车及零配件\s*(?:\/|>>)\s*车灯\s*(?:\/|>>)\s*信号灯总成\s*(?:\/|>>)\s*尾灯总成/;
                    const candidates = Array.from(document.querySelectorAll('.category-history-lists > div, [class*="history"] div')) as HTMLElement[];
                    for (const el of candidates) {
                        const text = (el.textContent || '').replace(/\s+/g, ' ');
                        if (!pattern.test(text)) continue;
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 10 || rect.height < 10) continue;
                        el.click();
                        return true;
                    }
                    return false;
                }).catch(() => false);
            }
            if (!recentClicked) {
                throw new Error('最近使用目标路径可见但不可点击');
            }
            await randomDelay(450, 850);
            await confirmCategorySwitchIfPrompted();
        };

        await selectTailFromRecent();
        let categoryValue = await categoryInput.inputValue().catch(() => '');
        let gateError: unknown = null;
        try {
            await ensureCategoryGate('recent-click#1', categoryValue);
        } catch (e) {
            gateError = e;
        }
        if (gateError) {
            console.log('   ↪️  类目门控首次失败，重试一次最近使用路径...');
            await selectTailFromRecent();
            categoryValue = await categoryInput.inputValue().catch(() => '');
            await ensureCategoryGate('recent-click#2', categoryValue);
        }

        console.log('   ✅ 类目锁定完成（最近使用 -> 尾灯总成）');
    } catch (e) {
        await screenshot(page, 'error_category_recent_tail').catch(() => { });
        throw new Error(`类目选择异常: ${e}`);
    }
}

// ============================================================
// 图库导航通用函数 🟡
// ============================================================
// 流程: 添加图片 → 选择图片 → 商品发布 → TailLights
//       → [分类文件夹] → [产品文件夹] → 选择图片 → 确认

export interface ImageLibraryPath {
    category: string;    // PICKUP / OFFROAD / FAMILY SUV / SPORTS COUPE
    product: string;     // F150 / TOYOTA TACOMA
    filename: string;    // front_lit.jpg
}

export interface DetailImageFillOptions {
    selectImageFromLibraryFn?: (
        page: Page,
        uploadBtn: Locator,
        imagePath: ImageLibraryPath,
    ) => Promise<boolean>;
}

export interface SkuImageFillOptions {
    selectImageFromLibraryFn?: (
        page: Page,
        uploadBtn: Locator,
        imagePath: ImageLibraryPath,
    ) => Promise<boolean>;
    onProgress?: (event: Module5ProgressEvent) => void | Promise<void>;
}

interface ImageLibrarySelectOptions {
    delayFn?: (minMs: number, maxMs: number) => Promise<void>;
    onProgress?: (event: Module5ProgressEvent) => void | Promise<void>;
}

/**
 * 解析 YAML 中的图库路径字符串
 * 格式: "PICKUP/F150/front_lit.jpg" 或 "分类/产品/文件名"
 */
export function parseImageLibraryPath(pathStr: string): ImageLibraryPath | null {
    if (!pathStr || pathStr.trim() === '') return null;
    const parts = pathStr.split('/');
    if (parts.length < 3) {
        console.log(`   ⚠️  图库路径格式错误 (需要: 分类/产品/文件名): ${pathStr}`);
        return null;
    }
    return {
        category: parts[0],
        product: parts[1],
        filename: parts.slice(2).join('/'),
    };
}

export type { LocalVideoUploadSpec, VideoSelectionSpec } from './modules/video';
export { resolveLocalVideoUploadSpec, resolveVideoSelectionSpec } from './modules/video';

function parseImageLibraryFolder(pathStr: string): { category: string; product: string } | null {
    const normalized = (pathStr || '').trim();
    if (!normalized) return null;
    const parts = normalized.split('/').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    return {
        category: parts[0],
        product: parts[1],
    };
}

function resolveCommonImageLibraryFolder(
    data: Pick<ProductData, 'image_dir' | 'carousel' | 'white_bg_image' | 'marketing_image' | 'skus'>,
): { category: string; product: string } | null {
    const explicitDir = parseImageLibraryFolder(data.image_dir || '');
    if (explicitDir) return explicitDir;

    const pathCandidates = dedupeNonEmpty([
        ...(data.carousel || []),
        data.white_bg_image,
        data.marketing_image,
        ...(data.skus || []).map((sku) => sku.image),
    ]);

    for (const candidate of pathCandidates) {
        const parsed = parseImageLibraryPath(candidate);
        if (!parsed) continue;
        return {
            category: parsed.category,
            product: parsed.product,
        };
    }

    return null;
}

export function resolveDetailImageLibraryPaths(
    data: Pick<ProductData, 'detail_images' | 'image_dir' | 'carousel' | 'white_bg_image' | 'marketing_image' | 'skus'>,
): ImageLibraryPath[] {
    const detailImages = data.detail_images || [];
    if (detailImages.length === 0) return [];

    const fallbackFolder = resolveCommonImageLibraryFolder(data);
    const resolved: ImageLibraryPath[] = [];
    for (const entry of detailImages) {
        const normalized = (entry || '').trim();
        if (!normalized) continue;

        if (normalized.includes('/')) {
            const directPath = parseImageLibraryPath(normalized);
            if (directPath) {
                resolved.push(directPath);
                continue;
            }
        }

        if (!fallbackFolder) continue;
        resolved.push({
            category: fallbackFolder.category,
            product: fallbackFolder.product,
            filename: path.basename(normalized),
        });
    }

    return resolved;
}

async function locateDetailImageUploadButton(page: Page): Promise<Locator | null> {
    const detailSectionPattern = /详情描述|详情图|商品详情|描述/i;
    const buttonSelector = [
        'button:has-text("上传图片")',
        '[role="button"]:has-text("上传图片")',
        '[class*="upload"]:has-text("上传图片")',
        'label:has-text("上传图片")',
    ].join(', ');

    const editorAnchors = page.locator('[contenteditable="true"], textarea, .ql-editor, .tox-edit-area iframe');
    const editorCount = await editorAnchors.count().catch(() => 0);
    for (let i = 0; i < Math.min(editorCount, 4); i++) {
        const editor = editorAnchors.nth(i);
        if (!await editor.isVisible({ timeout: 150 }).catch(() => false)) continue;
        const uploadNearEditor = editor.locator(`xpath=following::button[contains(normalize-space(.),"上传图片")][1]`).first();
        if (await uploadNearEditor.isVisible({ timeout: 500 }).catch(() => false)) {
            return uploadNearEditor;
        }
    }

    const sectionCandidates = page
        .locator('section, article, form, div')
        .filter({ hasText: detailSectionPattern });
    const sectionCount = await sectionCandidates.count().catch(() => 0);
    for (let i = 0; i < Math.min(sectionCount, 20); i++) {
        const section = sectionCandidates.nth(i);
        if (!await section.isVisible({ timeout: 150 }).catch(() => false)) continue;
        const nestedDetailSections = section
            .locator('section, article, form, div')
            .filter({ hasText: detailSectionPattern });
        const nestedDetailSectionCount = await nestedDetailSections.count().catch(() => 0);
        if (nestedDetailSectionCount > 0) continue;
        const uploadBtn = section.locator(buttonSelector).first();
        if (await uploadBtn.isVisible({ timeout: 500 }).catch(() => false)) {
            return uploadBtn;
        }
    }

    const globalUploadBtn = page.locator(buttonSelector).filter({ hasText: '上传图片' }).first();
    if (await globalUploadBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        return globalUploadBtn;
    }

    return null;
}

/**
 * 通过图库导航选择一张图片
 * 
 * @param page         Playwright Page
 * @param uploadBtn    触发上传的按钮 locator (如: 商品正面图的 "添加图片" 按钮)
 * @param imagePath    图库路径 { category, product, filename }
 */
export async function selectImageFromLibrary(
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: ImageLibraryPath,
    options: ImageLibrarySelectOptions = {},
): Promise<boolean> {
    const delay = options.delayFn ?? randomDelay;
    try {
        // 保护: 上一步遗留弹窗会拦截后续点击，先尝试关闭
        const staleModalClose = page.locator(
            '.ait-modal-wrap button[aria-label="Close"], .ait-modal-wrap .ait-modal-close, .ait-modal-wrap [class*="modal-close"]'
        ).first();
        if (await staleModalClose.isVisible({ timeout: 500 }).catch(() => false)) {
            await staleModalClose.click().catch(() => { });
            await page.locator('.ait-modal-wrap, [role="dialog"]').first()
                .waitFor({ state: 'hidden', timeout: 1000 })
                .catch(async () => {
                    await delay(120, 240);
                });
        }

        // Step 1: 点击 "添加图片" 按钮
        await options.onProgress?.({
            action: 'fill_sku_image_modal_running',
            field: `SKU 图片 / ${imagePath.filename}`,
            details: `打开 SKU 图片图库: ${imagePath.filename}`,
        });
        await uploadBtn.click();
        console.log(`      → 点击添加图片`);

        // 只在图库弹窗内操作，避免误点发布页上的同名元素
        let modal = page.locator('.ait-modal-wrap:has-text("选择图片"), [role="dialog"]:has-text("选择图片")').last();
        if (!await modal.isVisible({ timeout: 4000 }).catch(() => false)) {
            // 首次打开可能默认停在「上传图片」tab
            modal = page.locator('.ait-modal-wrap:has-text("上传图片"), [role="dialog"]:has-text("上传图片")').last();
        }
        await modal.waitFor({ timeout: 20000 });

        const closeImageModal = async (): Promise<void> => {
            const closeBtn = modal.locator(
                'button[aria-label="Close"], .ait-modal-close, [class*="modal-close"], button:has-text("关闭")'
            ).first();
            if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await closeBtn.click().catch(() => { });
            } else {
                await page.keyboard.press('Escape').catch(() => { });
            }
            await modal.waitFor({ state: 'hidden', timeout: 1200 }).catch(async () => {
                await delay(120, 240);
            });
        };

        const waitForLibraryReady = async (timeoutMs: number): Promise<boolean> => {
            const readyLocators = [
                modal.locator('.folder-name').first(),
                modal.locator('.material-center-image__item').first(),
                modal.locator('.material-center-select-container input[placeholder*="搜索"]').first(),
            ];

            try {
                await Promise.any(
                    readyLocators.map((locator) => locator.waitFor({ state: 'visible', timeout: timeoutMs })),
                );
                return true;
            } catch {
                return false;
            }
        };

        // Step 2: 弹出对话框 → 点击 "选择图片" Tab
        const selectBtn = modal.locator('text=选择图片')
            .or(modal.locator('[role="tab"]:has-text("选择图片")'))
            .or(modal.locator('.next-tabs-tab:has-text("选择图片")'))
            .first();
        if (await selectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await selectBtn.click();
            console.log(`      → 点击选择图片`);
            // 等待切换完成，避免仍停在「上传图片」页签
            const libraryReady = await waitForLibraryReady(800);
            if (!libraryReady) {
                await modal.locator('text=上传图片').first().isVisible({ timeout: 1000 }).catch(() => false);
                await delay(180, 320);
            }
        }

        const injectedCancelTarget = (process.env.INJECT_IMAGE_MODAL_CANCEL_ONCE || '').trim();
        if (
            injectedCancelTarget
            && injectedCancelTarget === imagePath.filename
            && !skuImageModalCancelInjections.has(injectedCancelTarget)
        ) {
            skuImageModalCancelInjections.add(injectedCancelTarget);
            console.log(`      🧪 注入测试: 主动关闭图库弹窗 (${imagePath.filename})`);
            await closeImageModal();
            return false;
        }

        const waitFolderVisible = async (folderName: string, timeoutMs: number = 10000): Promise<boolean> => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                // 先等加载 spinner 消失，再查树节点
                await modal.locator('.ait-spin-spinning').first().waitFor({ state: 'hidden', timeout: 1500 }).catch(() => { });
                const candidate = modal.locator(`.folder-name:has-text("${folderName}")`).first();
                if (await candidate.isVisible().catch(() => false)) return true;
                await delay(80, 160);
            }
            return false;
        };

        const getTreeNodeByFolderName = (folderName: string) => {
            const folderLabel = modal.locator(`.folder-name:has-text("${folderName}")`).first();
            return folderLabel.locator('xpath=ancestor::div[contains(@class,"ait-tree-treenode")][1]');
        };

        const clickFolderInModal = async (folderName: string): Promise<boolean> => {
            for (let attempt = 1; attempt <= 3; attempt++) {
                const treeNode = getTreeNodeByFolderName(folderName);
                if (await treeNode.isVisible({ timeout: 2000 }).catch(() => false)) {
                    const wrapper = treeNode.locator('.ait-tree-node-content-wrapper').first();
                    if (await wrapper.isVisible({ timeout: 1000 }).catch(() => false)) {
                        await wrapper.click();
                    } else {
                        await treeNode.click();
                    }
                    await modal.locator('.ait-spin-spinning').first()
                        .waitFor({ state: 'hidden', timeout: 350 })
                        .catch(() => { });
                    return true;
                }

                // 首轮匹配失败后，给异步加载的树节点一点时间
                if (attempt === 1) {
                    await waitFolderVisible(folderName, 8000);
                } else {
                    await delay(180, 320);
                }
            }
            return false;
        };

        const expandFolderInModal = async (folderName: string): Promise<boolean> => {
            const treeNode = getTreeNodeByFolderName(folderName);
            if (!await treeNode.isVisible({ timeout: 2500 }).catch(() => false)) return false;

            const nodeClass = await treeNode.getAttribute('class').catch(() => '');
            const needExpand = (nodeClass || '').includes('switcher-close');

            if (needExpand) {
                const switcher = treeNode.locator('.ait-tree-switcher.ait-tree-switcher_close').first()
                    .or(treeNode.locator('.ait-tree-switcher').first());
                if (await switcher.isVisible({ timeout: 1200 }).catch(() => false)) {
                    await switcher.click().catch(() => { });
                    await modal.locator('.ait-spin-spinning').first()
                        .waitFor({ state: 'hidden', timeout: 350 })
                        .catch(() => { });
                }
            }

            return true;
        };

        const clickFolderLevel = async (candidates: string[]): Promise<string | null> => {
            for (const name of candidates) {
                if (await clickFolderInModal(name)) return name;
            }
            return null;
        };
        const isAnyFolderVisibleNow = async (candidates: string[]): Promise<boolean> => {
            for (const name of candidates) {
                const treeNode = getTreeNodeByFolderName(name);
                if (await treeNode.isVisible({ timeout: 150 }).catch(() => false)) {
                    return true;
                }
            }
            return false;
        };
        const areAllRemainingLevelsVisibleNow = async (levels: string[][]): Promise<boolean> => {
            for (const level of levels) {
                if (!await isAnyFolderVisibleNow(level)) {
                    return false;
                }
            }
            return levels.length > 0;
        };

        const fileBaseName = imagePath.filename.replace(/\.[^.]+$/, '');
        const searchInput = modal.locator(
            '.material-center-select-container input[placeholder*="搜索图片名称"], .material-center-select-container input[placeholder*="搜索"]'
        ).first();
        const searchBtn = modal.locator('.material-center-select-container .ait-input-search-button').first();
        const cardByTitle = modal.locator(
            `.material-center-image__item:has(.material-center-image__item__title:has-text("${imagePath.filename}"))`
        ).first();
        const cardByBase = modal.locator(
            `.material-center-image__item:has(.material-center-image__item__title:has-text("${fileBaseName}"))`
        ).first();

        const imageSelectors = [
            `[title="${imagePath.filename}"]`,
            `[title*="${fileBaseName}"]`,
            `[alt="${imagePath.filename}"]`,
            `[alt*="${fileBaseName}"]`,
            `img[src*="${imagePath.filename}"]`,
            `text=${imagePath.filename}`,
        ];

        const isTargetImageVisible = async (): Promise<boolean> => {
            for (const card of [cardByTitle, cardByBase]) {
                if (await card.isVisible({ timeout: 250 }).catch(() => false)) {
                    return true;
                }
            }
            for (const selector of imageSelectors) {
                const imageItem = modal.locator(selector).first();
                if (await imageItem.isVisible({ timeout: 250 }).catch(() => false)) {
                    return true;
                }
            }
            return false;
        };

        const imageAlreadyVisibleInCurrentView = await isTargetImageVisible();

        // Step 3-6: 按路径进入目标目录
        const folderLevels: string[][] = [
            ['商品发布'],
            ['TailLights', 'TailLight'],
            [imagePath.category],
            [imagePath.product],
        ];
        const treeLevelActions = [
            'fill_sku_image_tree_level_1_running',
            'fill_sku_image_tree_level_2_running',
            'fill_sku_image_tree_level_3_running',
            'fill_sku_image_tree_level_4_running',
        ] as const;

        if (!imageAlreadyVisibleInCurrentView) {
            await options.onProgress?.({
                action: 'fill_sku_image_tree_running',
                field: `SKU 图片 / ${imagePath.filename}`,
                details: `SKU 图片目录导航: ${imagePath.filename}`,
            });
            for (let i = 0; i < folderLevels.length; i++) {
                const levelCandidates = folderLevels[i];
                await options.onProgress?.({
                    action: treeLevelActions[i],
                    field: `SKU 图片目录 / ${imagePath.filename}`,
                    details: `SKU 图片目录层 ${i + 1}: ${levelCandidates.join(' / ')}`,
                });
                const nextLevel = folderLevels[i + 1];
                const remainingLevels = folderLevels.slice(i + 1);
                const nextLevelVisible = nextLevel
                    ? await isAnyFolderVisibleNow(nextLevel)
                    : false;
                const allRemainingLevelsVisible = remainingLevels.length > 0
                    ? await areAllRemainingLevelsVisibleNow(remainingLevels)
                    : false;
                if (nextLevelVisible && !allRemainingLevelsVisible) {
                    console.log(`      ↪️  目录层已复用: ${levelCandidates.join(' / ')} (下级已可见)`);
                    continue;
                }
                const hitName = await clickFolderLevel(levelCandidates);
                if (!hitName) {
                    if (nextLevel && await waitFolderVisible(nextLevel[0], 1500)) {
                        console.log(`      ↪️  跳过目录层: ${levelCandidates.join(' / ')} (下级已可见)`);
                        continue;
                    }

                    console.log(`      ⚠️  未找到文件夹: ${levelCandidates.join(' / ')}`);
                    await screenshot(page, `image_library_missing_folder_${levelCandidates[0].replace(/\s+/g, '_')}`);
                    await closeImageModal();
                    return false;
                }
                console.log(`      → 进入: ${hitName}`);

                // 父级节点可能只被选中未展开，若下一级没出现则再点一次尝试展开
                if (nextLevel && !await waitFolderVisible(nextLevel[0], 1200)) {
                    await expandFolderInModal(hitName);
                    await clickFolderInModal(hitName);
                    await waitFolderVisible(nextLevel[0], 2500);
                }
            }
        }

        // Step 7: 选择目标图片 (按文件名匹配)
        await modal.locator('.material-center-select-container .ait-spin-spinning').first()
            .waitFor({ state: 'hidden', timeout: 12000 })
            .catch(() => { });
        if (!imageAlreadyVisibleInCurrentView && await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            await searchInput.fill(fileBaseName).catch(() => { });
            if (await searchBtn.isVisible({ timeout: 800 }).catch(() => false)) {
                await searchBtn.click().catch(() => { });
            } else {
                await searchInput.press('Enter').catch(() => { });
            }
            await modal.locator('.material-center-select-container .ait-spin-spinning').first()
                .waitFor({ state: 'hidden', timeout: 12000 })
                .catch(() => { });
        }

        await options.onProgress?.({
            action: 'fill_sku_image_select_running',
            field: `SKU 图片 / ${imagePath.filename}`,
            details: `选择 SKU 图片素材: ${imagePath.filename}`,
        });
        let imageSelected = false;
        for (const card of [cardByTitle, cardByBase]) {
            if (!await card.isVisible({ timeout: 1200 }).catch(() => false)) {
                continue;
            }
            const checkbox = card.locator(
                '.material-center-image__checkbox, label[class*="checkbox"], [class*="checkbox"]'
            ).first();
            if (await checkbox.isVisible({ timeout: 1200 }).catch(() => false)) {
                await checkbox.click().catch(() => { });
            } else {
                await card.click().catch(() => { });
            }
            console.log(`      → 选择图片: ${imagePath.filename}`);
            imageSelected = true;
            break;
        }

        for (const selector of imageSelectors) {
            if (imageSelected) break;
            const imageItem = modal.locator(selector).first();
            if (await imageItem.isVisible({ timeout: 3500 }).catch(() => false)) {
                try {
                    await imageItem.click();
                } catch {
                    // 某些页面会用 checkbox 覆盖在图片上，直接点图会被拦截
                    const card = imageItem.locator('xpath=ancestor::*[contains(@class,"material-center-image")][1]');
                    const checkbox = card.locator('label[class*="checkbox"], .material-center-image__checkbox, [class*="checkbox"]').first();
                    if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
                        await checkbox.click();
                    } else if (await card.isVisible({ timeout: 1000 }).catch(() => false)) {
                        await card.click();
                    } else {
                        throw new Error(`图片可见但无法点击: ${imagePath.filename}`);
                    }
                }
                console.log(`      → 选择图片: ${imagePath.filename}`);
                imageSelected = true;
                break;
            }
        }

        if (!imageSelected) {
            console.log(`      ⚠️  未找到图片: ${imagePath.filename}`);
            await screenshot(page, `image_library_missing_image_${fileBaseName.replace(/\s+/g, '_')}`);
            await closeImageModal();
            return false;
        }

        // Step 8: 点击确认按钮
        const confirmBtn = page.locator(
            '.ait-modal:visible .material-center-select-container__footer .ait-btn-primary:not([disabled]), .ait-modal:visible button.ait-btn-primary:not([disabled])'
        ).last();
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await options.onProgress?.({
                action: 'fill_sku_image_confirm_running',
                field: `SKU 图片 / ${imagePath.filename}`,
                details: `确认 SKU 图片选择: ${imagePath.filename}`,
            });
            await confirmBtn.click().catch(async () => {
                const box = await confirmBtn.boundingBox();
                if (box) {
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                } else {
                    throw new Error('确认按钮可见但无法点击');
                }
            });
            await modal.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => { });
        } else {
            console.log('      ⚠️  未找到确认按钮');
            await screenshot(page, 'image_library_missing_confirm_button');
            await closeImageModal();
            return false;
        }

        console.log(`      ✅ 图片选择完成`);
        return true;

    } catch (e) {
        console.log(`      ⚠️  图库导航失败: ${e}`);
        // 尝试关闭可能打开的对话框
        const closeBtn = page.locator(
            'button[aria-label="Close"], .ait-modal-close, [class*="modal-close"], button:has-text("关闭")'
        ).first();
        if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await closeBtn.click().catch(() => { });
        } else {
            await page.keyboard.press('Escape').catch(() => { });
        }
        await delay(120, 240);
        return false;
    }
}

/**
 * 轮播图批量选择：一次进入图库并多选 6 张图，再一次确认
 */
export async function selectCarouselImagesBatch(
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    folder: { category: string; product: string },
    orderedFilenames: string[],
): Promise<boolean> {
    try {
        await uploadBtn.click();
        await randomDelay(500, 1000);
        console.log('      → 点击添加图片');

        const modal = page.locator('.ait-modal:visible, [role="dialog"]:visible').last();
        await modal.waitFor({ timeout: 20000 });

        const selectTab = modal.locator('text=选择图片')
            .or(modal.locator('[role="tab"]:has-text("选择图片")'))
            .or(modal.locator('.ait-tabs-tab:has-text("选择图片")'))
            .first();
        if (await selectTab.isVisible({ timeout: 6000 }).catch(() => false)) {
            await selectTab.click();
            await randomDelay(700, 1200);
            console.log('      → 点击选择图片');
        }

        const waitTreeReady = async (): Promise<void> => {
            await modal.locator('.material-center-tree .folder-name').first().waitFor({ timeout: 12000 });
            await modal.locator('.material-center-select-container .ait-spin-spinning').first()
                .waitFor({ state: 'hidden', timeout: 12000 }).catch(() => { });
        };

        const clickTreeNode = async (name: string): Promise<boolean> => {
            await waitTreeReady();
            const label = modal.locator(`.material-center-tree .folder-name:has-text("${name}")`).first();
            if (!await label.isVisible({ timeout: 2500 }).catch(() => false)) return false;
            const treeNode = label.locator('xpath=ancestor::div[contains(@class,"ait-tree-treenode")][1]');
            const nodeClass = await treeNode.getAttribute('class').catch(() => '');
            if ((nodeClass || '').includes('switcher-close')) {
                const switcher = treeNode.locator('.ait-tree-switcher').first();
                if (await switcher.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await switcher.click();
                    await randomDelay(300, 700);
                }
            }
            const wrapper = treeNode.locator('.ait-tree-node-content-wrapper').first();
            if (await wrapper.isVisible({ timeout: 1000 }).catch(() => false)) {
                await wrapper.click();
            } else {
                await treeNode.click();
            }
            await randomDelay(300, 700);
            return true;
        };

        const step1 = await clickTreeNode('商品发布');
        if (!step1) return false;

        let step2 = await clickTreeNode('TailLights');
        if (!step2) {
            step2 = await clickTreeNode('TailLight');
        }
        if (!step2) return false;

        const step3 = await clickTreeNode(folder.category);
        if (!step3) return false;
        const step4 = await clickTreeNode(folder.product);
        if (!step4) return false;

        await modal.locator('.material-center-select-container .ait-spin-spinning').first()
            .waitFor({ state: 'hidden', timeout: 12000 }).catch(() => { });

        const searchInput = modal.locator(
            '.material-center-select-container input[placeholder*="搜索图片名称"], .material-center-select-container input[placeholder*="搜索"]'
        ).first();
        const searchBtn = modal.locator('.material-center-select-container .ait-input-search-button').first();

        const searchImageByName = async (keyword: string): Promise<void> => {
            if (!await searchInput.isVisible({ timeout: 800 }).catch(() => false)) return;
            await searchInput.fill(keyword);
            if (await searchBtn.isVisible({ timeout: 800 }).catch(() => false)) {
                await searchBtn.click();
            } else {
                await searchInput.press('Enter').catch(() => { });
            }
            await randomDelay(400, 900);
            await modal.locator('.material-center-select-container .ait-spin-spinning').first()
                .waitFor({ state: 'hidden', timeout: 12000 }).catch(() => { });
        };

        const waitImageVisible = async (filename: string, base: string, timeoutMs: number = 15000) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                // 优先用标题卡片命中（最稳定）
                const cardByTitle = modal.locator(
                    `.material-center-image__item:has(.material-center-image__item__title:has-text("${filename}"))`
                ).first();
                if (await cardByTitle.isVisible({ timeout: 600 }).catch(() => false)) {
                    return cardByTitle;
                }

                // 兜底: 从 img/title 反查父级卡片
                const mediaNode = modal.locator(`[alt="${filename}"]`)
                    .or(modal.locator(`[title="${filename}"]`))
                    .or(modal.locator(`[alt*="${base}"]`))
                    .or(modal.locator(`[title*="${base}"]`))
                    .first();
                if (await mediaNode.isVisible({ timeout: 600 }).catch(() => false)) {
                    const card = mediaNode.locator('xpath=ancestor::*[contains(@class,"material-center-image__item")][1]');
                    if (await card.isVisible({ timeout: 600 }).catch(() => false)) {
                        return card;
                    }
                }
                await randomDelay(350, 750);
            }
            return null;
        };

        for (const filename of orderedFilenames) {
            const base = filename.replace(/\.[^.]+$/, '');
            // 稳定策略：每张图先用搜索框定位，避免首屏延迟/分页影响
            await searchImageByName(base);
            const imageItem = await waitImageVisible(filename, base, 15000);
            if (!imageItem) {
                console.log(`      ⚠️  批量模式未找到图片: ${filename}`);
                return false;
            }

            try {
                // 按你的操作习惯，优先点图片卡片上的复选框
                const checkbox = imageItem.locator('.material-center-image__checkbox, label[class*="checkbox"], [class*="checkbox"]').first();
                if (await checkbox.isVisible({ timeout: 1200 }).catch(() => false)) {
                    await checkbox.click();
                } else {
                    await imageItem.click();
                }
            } catch {
                return false;
            }
            await randomDelay(250, 500);
            console.log(`      → 选择图片: ${filename}`);
        }

        const confirmBtn = modal.locator('.material-center-select-container__footer .ait-btn-primary:not([disabled]), .ait-btn-primary:not([disabled])').last();
        if (!await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('      ⚠️  批量模式未找到确认按钮');
            return false;
        }

        await confirmBtn.click();
        await randomDelay(500, 1000);
        await modal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });

        console.log('      ✅ 批量选择 6 张图片完成');
        return true;
    } catch (e) {
        console.log(`      ⚠️  批量选图失败: ${e}`);
        return false;
    }
}


// ============================================================
// 模块 1c: 商品图片 ×6 🟡
// ============================================================

const CAROUSEL_SLOT_LABELS = [
    '商品正面图',
    '商品背面图',
    '商品实拍图',
    '商品侧面图',
    '商品细节图',
    '商品细节图',  // 第二个细节图
];

export async function fillCarouselImages(page: Page, data: ProductData): Promise<ModuleExecutionResult> {
    console.log('\n🖼️  模块 1c: 商品图片...');
    if (!data.carousel || data.carousel.length === 0) {
        console.log('   ⏭️  无轮播图数据');
        return autoModuleExecutionResult('carousel_images_skipped_empty');
    }
    const manualGateScreenshotPaths: string[] = [];
    let needsManualGate = false;

    // 固定业务规则：进入目录后按 SKUa -> SKUf 顺序点击 6 张图
    const firstValidPath = data.carousel.find(p => !!parseImageLibraryPath(p));
    let carouselPaths = data.carousel.slice(0, 6);
    if (firstValidPath) {
        const base = parseImageLibraryPath(firstValidPath);
        if (base) {
            const orderedNames = ['SKUa.jpg', 'SKUb.jpg', 'SKUc.jpg', 'SKUd.jpg', 'SKUe.jpg', 'SKUf.jpg'];
            carouselPaths = orderedNames.map(name => `${base.category}/${base.product}/${name}`);
            console.log('   ↪️  使用固定顺序: SKUa -> SKUb -> SKUc -> SKUd -> SKUe -> SKUf');

            // 先走批量模式：一次进入目录，多选 6 张图，一次确认
            let firstUploadBtn = page.locator(`text=${CAROUSEL_SLOT_LABELS[0]}`)
                .locator('..')
                .locator('[class*="upload-btn"], [class*="add-image"], .image-upload-trigger, [class*="upload"] [class*="btn"], button')
                .first();
            if (!await firstUploadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                const allUploadBtns = page.locator('[class*="upload-btn"], [class*="add-image"], .image-upload-trigger');
                firstUploadBtn = allUploadBtns.nth(0);
            }

            if (await firstUploadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                const batchOk = await selectCarouselImagesBatch(page, firstUploadBtn, {
                    category: base.category,
                    product: base.product,
                }, orderedNames);
                if (batchOk) {
                    return autoModuleExecutionResult('carousel_images_done');
                }
                console.log('   ⚠️  批量模式失败，请人工在当前弹窗一次多选 6 张后继续');
                const screenshotPath = await screenshot(page, 'carousel_batch_manual_gate').catch(() => null);
                return manualGateModuleExecutionResult('carousel_images_manual_gate', screenshotPath ? [screenshotPath] : []);
            } else {
                console.log('   ⚠️  未找到轮播图上传入口，跳过批量模式');
                needsManualGate = true;
                const screenshotPath = await screenshot(page, 'carousel_upload_entry_missing').catch(() => null);
                if (screenshotPath) manualGateScreenshotPaths.push(screenshotPath);
            }
        }
    }

    for (let i = 0; i < Math.min(carouselPaths.length, 6); i++) {
        const imgPathStr = carouselPaths[i];
        if (!imgPathStr) continue;

        const imgPath = parseImageLibraryPath(imgPathStr);
        if (!imgPath) {
            needsManualGate = true;
            const screenshotPath = await screenshot(page, `carousel_image_invalid_path_${i + 1}`).catch(() => null);
            if (screenshotPath) manualGateScreenshotPaths.push(screenshotPath);
            continue;
        }

        const slotLabel = CAROUSEL_SLOT_LABELS[i] || `图片位${i + 1}`;
        console.log(`   📷 ${slotLabel} (${i + 1}/6):`);

        // 查找对应图片位的上传按钮
        // 尝试多种定位方式
        let uploadBtn = page.locator(`text=${slotLabel}`)
            .locator('..')
            .locator('[class*="upload-btn"], [class*="add-image"], .image-upload-trigger, [class*="upload"] [class*="btn"], button')
            .first();

        // fallback: 用序号定位
        if (!await uploadBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            const allUploadBtns = page.locator('[class*="upload-btn"], [class*="add-image"], .image-upload-trigger');
            uploadBtn = allUploadBtns.nth(i);
        }

        if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await selectImageFromLibrary(page, uploadBtn, imgPath);
        } else {
            console.log(`      ⚠️  未找到第 ${i + 1} 个图片位的上传按钮`);
            needsManualGate = true;
            const screenshotPath = await screenshot(page, `carousel_image_upload_missing_${i + 1}`).catch(() => null);
            if (screenshotPath) manualGateScreenshotPaths.push(screenshotPath);
        }

        await randomDelay();
    }

    if (needsManualGate) {
        return manualGateModuleExecutionResult('carousel_images_manual_gate', manualGateScreenshotPaths);
    }

    return autoModuleExecutionResult('carousel_images_done');
}


// ============================================================
// 模块 1d: 营销图 ×2 🟡
// ============================================================

export async function fillMarketingImages(page: Page, data: ProductData): Promise<ModuleExecutionResult> {
    console.log('\n🎨 模块 1d: 营销图...');

    const images = [
        { path: data.white_bg_image, label: '白底图 1:1' },
        { path: data.marketing_image, label: '场景图 3:4' },
    ];
    const manualGateScreenshotPaths: string[] = [];
    let needsManualGate = false;

    for (const [index, img] of images.entries()) {
        if (!img.path) continue;

        const imgPath = parseImageLibraryPath(img.path);
        if (!imgPath) {
            needsManualGate = true;
            console.log(`      ⚠️  ${img.label} 的图库路径无效，转人工`);
            const screenshotPath = await screenshot(page, `marketing_image_invalid_path_${index + 1}`).catch(() => null);
            if (screenshotPath) manualGateScreenshotPaths.push(screenshotPath);
            continue;
        }

        console.log(`   🎯 ${img.label}:`);

        const uploadBtn = page.locator(`text=${img.label}`)
            .locator('..')
            .locator('[class*="upload-btn"], [class*="add-image"], .image-upload-trigger, [class*="upload"] [class*="btn"], button')
            .first();
        if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await selectImageFromLibrary(page, uploadBtn, imgPath);
        } else {
            console.log(`      ⚠️  未找到 ${img.label} 的上传按钮`);
            needsManualGate = true;
            const screenshotPath = await screenshot(page, `marketing_image_upload_missing_${index + 1}`).catch(() => null);
            if (screenshotPath) manualGateScreenshotPaths.push(screenshotPath);
        }
    }

    if (needsManualGate) {
        return manualGateModuleExecutionResult('marketing_images_manual_gate', manualGateScreenshotPaths);
    }

    return autoModuleExecutionResult('marketing_images_done');
}


// ============================================================
// 模块 1e: 本地视频上传 🟡
// ============================================================

export { bootstrapVideoCategoryFromRecent, fillVideo } from './modules/video';

// ============================================================
// SKU 图片选择 🟡
// ============================================================

async function resolveMainScrollContainer(page: Page): Promise<Locator | null> {
    const scroller = getMainScrollContainer(page);
    const handle = await scroller.elementHandle({ timeout: 300 }).catch(() => null);
    if (!handle) return null;
    await handle.dispose().catch(() => { });
    return scroller;
}

let skuFieldDebugDumped = false;

async function maybeDebugSkuFieldCandidates(page: Page, reason: string): Promise<void> {
    if (process.env.DEBUG_SKU_FIELDS !== '1' || skuFieldDebugDumped) return;
    skuFieldDebugDumped = true;
    try {
        const report = await page.evaluate(`(() => {
            const vis = (el) => {
                const s = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            };
            const rect = (el) => {
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            };
            const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]'))
                .map((el) => ({
                    name: el.getAttribute('name') || '',
                    type: el.getAttribute('type') || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    ariaLabel: el.getAttribute('aria-label') || '',
                    className: el.className || '',
                    value: ('value' in el ? el.value : (el.textContent || '')).slice(0, 60),
                    visible: vis(el),
                    rect: rect(el),
                    parentText: (el.closest('tr, td, .sale-item-container, .sku-list-container, [class*="table"], .ait-form-item')?.textContent || '')
                        .replace(/\\s+/g, ' ')
                        .trim()
                        .slice(0, 160),
                }));
            const candidates = inputs.filter((x) =>
                /sku|price|stock|declared|cargo|value|库存|价格|货值|申报|零售价|cny/i
                    .test((x.name + ' ' + x.placeholder + ' ' + x.ariaLabel + ' ' + x.className + ' ' + x.parentText))
            );
            const headers = Array.from(document.querySelectorAll('th, [class*="header"], .sale-item-label, .sale-item-title'))
                .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
                .filter(Boolean)
                .slice(0, 120);
            return {
                url: location.href,
                totalInputs: inputs.length,
                visibleInputs: inputs.filter((x) => x.visible).length,
                names: Array.from(new Set(inputs.map((x) => x.name).filter(Boolean))),
                placeholders: Array.from(new Set(inputs.map((x) => x.placeholder).filter(Boolean))),
                candidates: candidates.slice(0, 80),
                headers,
            };
        })()`) as any;

        console.log(`      🧭 SKU 字段探针 (${reason})`);
        console.log(`      url=${report.url}`);
        console.log(`      totalInputs=${report.totalInputs}, visibleInputs=${report.visibleInputs}`);
        const names = Array.isArray(report.names) ? report.names : [];
        if (names.length > 0) {
            console.log(`      input names: ${names.join(', ')}`);
        }
        const placeholders = Array.isArray(report.placeholders) ? report.placeholders : [];
        if (placeholders.length > 0) {
            console.log(`      placeholders: ${placeholders.slice(0, 20).join(' | ')}`);
        }
        const candidates = Array.isArray(report.candidates) ? report.candidates : [];
        for (const c of candidates.slice(0, 12)) {
            console.log(
                `      cand name=${c.name || '-'} placeholder=${c.placeholder || '-'} class=${String(c.className || '').slice(0, 50)} rect=${JSON.stringify(c.rect)}`
            );
        }
    } catch (e) {
        console.log(`      ⚠️  SKU 字段探针失败: ${e}`);
    }
}

async function maybeDebugBatchDropdownCandidates(page: Page, reason: string): Promise<void> {
    if (process.env.DEBUG_SKU_FIELDS !== '1') return;
    try {
        const report = await page.evaluate(() => {
            const headers = Array.from(document.querySelectorAll('th, .sell-sku-head-cell'))
                .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .slice(0, 30);

            const candidates = Array.from(
                document.querySelectorAll(
                    '.col-isOriginalBox, .col-logistics, [class*="isOriginal"], [class*="original"], [class*="logistics"], [role="combobox"], .ait-select, .next-select'
                )
            ) as HTMLElement[];

            const rows = candidates
                .map((el) => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    if (rect.width < 8 || rect.height < 8) return null;
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;
                    return {
                        tag: el.tagName.toLowerCase(),
                        className: el.className || '',
                        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
                    };
                })
                .filter(Boolean)
                .slice(0, 40);

            return {
                url: location.href,
                headers,
                rows,
            };
        }) as any;

        console.log(`      🧭 批量下拉探针 (${reason})`);
        console.log(`      url=${report.url}`);
        const headers = Array.isArray(report.headers) ? report.headers : [];
        if (headers.length > 0) {
            console.log(`      headers: ${headers.join(' | ')}`);
        }
        const rows = Array.isArray(report.rows) ? report.rows : [];
        for (const r of rows.slice(0, 15)) {
            console.log(
                `      cand tag=${r.tag} class=${String(r.className).slice(0, 60)} text=${String(r.text).slice(0, 40)} rect=${JSON.stringify(r.rect)}`
            );
        }
    } catch (e) {
        console.log(`      ⚠️  批量下拉探针失败: ${e}`);
    }
}

async function pickTopmostVisible(locator: Locator): Promise<Locator | null> {
    const total = await locator.count().catch(() => 0);
    let best: { locator: Locator; y: number } | null = null;
    for (let i = 0; i < total; i++) {
        const item = locator.nth(i);
        if (!await item.isVisible({ timeout: 100 }).catch(() => false)) continue;
        const box = await item.boundingBox().catch(() => null);
        const y = box?.y ?? Number.POSITIVE_INFINITY;
        if (!best || y < best.y) {
            best = { locator: item, y };
        }
    }
    return best?.locator ?? null;
}

async function ensureSkuGridSectionVisible(page: Page): Promise<boolean> {
    const header = page.locator('.sell-sku-head-cell.col-skuPrice, .sell-sku-head-cell.col-cargoPrice, .sell-sku-head-cell.col-skuStock').first();
    const rowCell = page.locator('td.sell-sku-cell.col-skuPrice, td.sell-sku-cell.col-cargoPrice, td.sell-sku-cell.col-skuStock').first();
    for (let i = 0; i < 20; i++) {
        const headerVisible = await header.isVisible({ timeout: 350 }).catch(() => false);
        const rowVisible = await rowCell.isVisible({ timeout: 350 }).catch(() => false);
        if (headerVisible || rowVisible) {
            return true;
        }
        await scrollMainContent(page, 850, { allowWheelFallback: false });
        await page.waitForTimeout(300);
    }
    const headerVisible = await header.isVisible({ timeout: 600 }).catch(() => false);
    const rowVisible = await rowCell.isVisible({ timeout: 600 }).catch(() => false);
    return headerVisible || rowVisible;
}

async function ensureRetailPriceHeaderVisible(page: Page): Promise<boolean> {
    const retailHeader = page
        .locator('text=零售价(CNY)')
        .or(page.locator('text=零售价'))
        .first();
    const scroller = await resolveMainScrollContainer(page);
    const batchBtn = page.locator(
        'button:has-text("批量填充"), .sell-sku-common-confirm-btn:has-text("批量填充"), [role="button"]:has-text("批量填充")'
    ).first();
    for (let i = 0; i < 10; i++) {
        if (await retailHeader.isVisible({ timeout: 300 }).catch(() => false)) {
            await retailHeader.scrollIntoViewIfNeeded().catch(() => { });
            await page.waitForTimeout(120);
            return true;
        }
        if (await batchBtn.isVisible({ timeout: 200 }).catch(() => false)) {
            // 批量按钮可见时，说明已到目标区域附近，不再继续下滚
            return true;
        }
        const pos = scroller
            ? await scroller.evaluate((el) => {
                const n = el as HTMLElement;
                return { top: n.scrollTop, max: Math.max(0, n.scrollHeight - n.clientHeight) };
            }).catch(() => null)
            : null;
        if (pos && pos.top >= pos.max - 2) {
            break;
        }
        await scrollMainContent(page, 420, { allowWheelFallback: false });
        await page.waitForTimeout(220);
    }
    return await retailHeader.isVisible({ timeout: 500 }).catch(() => false);
}

async function resetSkuTabAnchor(page: Page): Promise<void> {
    const skuTab = page
        .locator('text=SKU价格与库存')
        .or(page.locator('text=SKU Price & Inventory'))
        .first();
    if (await skuTab.isVisible({ timeout: 1200 }).catch(() => false)) {
        await safeClick(skuTab, 1400);
        await Promise.any([
            page.locator('.posting-feild-color-item .ait-select').first().waitFor({ state: 'visible', timeout: 220 }),
            page.locator('.sell-sku-head-cell.col-skuPrice, .sell-sku-head-cell.col-cargoPrice, .sell-sku-head-cell.col-skuStock').first().waitFor({ state: 'visible', timeout: 220 }),
            page.locator('button:has-text("批量填充"), [role="button"]:has-text("批量填充")').first().waitFor({ state: 'visible', timeout: 220 }),
        ]).catch(() => { });
    }

    const scroller = await resolveMainScrollContainer(page);
    const resetDone = scroller
        ? await scroller.evaluate((el) => {
            const node = el as HTMLElement;
            const before = node.scrollTop;
            node.scrollTop = 0;
            return before !== node.scrollTop;
        }).catch(() => false)
        : false;

    if (!resetDone) {
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => { });
    }
    await page.waitForTimeout(140);
}

async function fillNthVisibleInput(locator: Locator, index: number, value: string): Promise<boolean> {
    const target = await pickNthVisible(locator, index);
    if (!target) return false;
    await target.scrollIntoViewIfNeeded().catch(() => { });
    await target.click({ clickCount: 3 }).catch(() => { });
    await target.fill(value);
    await randomDelay(100, 250);
    return true;
}

async function fillBulkInputBySelectors(
    page: Page,
    scope: Locator,
    selectors: string[],
    value: string,
): Promise<boolean> {
    for (const selector of selectors) {
        const targetInScope = await pickNthVisible(scope.locator(selector), 0);
        const target = targetInScope ?? await pickNthVisible(page.locator(selector), 0);
        if (!target) continue;
        if (!await target.isVisible({ timeout: 250 }).catch(() => false)) continue;

        await target.scrollIntoViewIfNeeded().catch(() => { });
        await target.click({ clickCount: 3 }).catch(() => { });
        await target.fill(value).catch(async () => {
            await target.click().catch(() => { });
            await page.keyboard.press('Meta+A').catch(() => { });
            await page.keyboard.press('Control+A').catch(() => { });
            await page.keyboard.type(value);
        });

        return true;
    }
    return false;
}

function escapeRegExp(source: string): string {
    return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getBatchRowAnchorFromRetailInput(page: Page): Promise<Locator | null> {
    const retailInput = await pickNthVisible(
        page.locator('input[placeholder="零售价(CNY)"], input[placeholder*="零售价(CNY)"], input[placeholder*="零售价"]'),
        0,
    );
    if (!retailInput || !await retailInput.isVisible({ timeout: 250 }).catch(() => false)) {
        return null;
    }

    const containerCandidates: Locator[] = [
        retailInput.locator(
            'xpath=ancestor::*[(self::div or self::tr or self::tbody or self::table) and .//input[contains(@placeholder,"零售价")] and .//input[contains(@placeholder,"货值")] and .//input[contains(@placeholder,"库存")]][1]'
        ),
        retailInput.locator('xpath=ancestor::tr[1]'),
        retailInput.locator('xpath=ancestor::*[contains(@class,"sell-sku-common") or contains(@class,"sku-row")][1]'),
        retailInput.locator('xpath=ancestor::div[.//input[contains(@placeholder,"货值")] and .//input[contains(@placeholder,"库存")]][1]'),
        retailInput.locator('xpath=ancestor::div[.//input][1]'),
    ];

    for (const container of containerCandidates) {
        if (!await container.isVisible({ timeout: 200 }).catch(() => false)) continue;
        const inputCount = await container.locator('input:not([type="hidden"])').count().catch(() => 0);
        if (inputCount >= 3) return container;
    }
    return null;
}

async function fillBatchRowInputByCol(
    page: Page,
    row: Locator | null,
    colClass: string,
    fallbackSelectors: string[],
    value: string,
): Promise<boolean> {
    const scopedSelectors = row
        ? [
            `td.${colClass} input:visible`,
            `.${colClass} input:visible`,
            ...fallbackSelectors,
        ]
        : fallbackSelectors;

    for (const selector of scopedSelectors) {
        const target = row
            ? await pickNthVisible(row.locator(selector), 0)
            : await pickNthVisible(page.locator(selector), 0);
        if (!target) continue;
        if (!await target.isVisible({ timeout: 220 }).catch(() => false)) continue;

        await target.scrollIntoViewIfNeeded().catch(() => { });
        await target.click({ clickCount: 3 }).catch(() => { });
        await target.fill(value).catch(async () => {
            await target.click().catch(() => { });
            await page.keyboard.press('Meta+A').catch(() => { });
            await page.keyboard.press('Control+A').catch(() => { });
            await page.keyboard.type(value);
        });
        return true;
    }

    return false;
}

async function selectBatchRowDropdownByCol(
    page: Page,
    row: Locator | null,
    colClass: string,
    optionText: string,
): Promise<boolean> {
    const triggerSelectors = [
        `td.${colClass} .next-select-trigger`,
        `td.${colClass} .ait-select`,
        `td.${colClass} [role="combobox"]`,
        `.${colClass} .next-select-trigger`,
        `.${colClass} .ait-select`,
        `.${colClass} [role="combobox"]`,
    ];

    let trigger: Locator | null = null;
    for (const selector of triggerSelectors) {
        trigger = row
            ? await pickNthVisible(row.locator(selector), 0)
            : await pickNthVisible(page.locator(selector), 0);
        if (!trigger) continue;
        if (!await trigger.isVisible({ timeout: 220 }).catch(() => false)) {
            trigger = null;
            continue;
        }
        break;
    }

    if (!trigger) return false;

    const triggerText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
    if (triggerText.includes(optionText)) return true;

    await safeClick(trigger, 1200);
    await page.waitForTimeout(220);

    const exactOption = await pickNthVisible(
        page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
            .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) }),
        0,
    );
    const fuzzyOption = exactOption ?? await pickNthVisible(
        page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
            .filter({ hasText: optionText }),
        0,
    );
    if (fuzzyOption) {
        await safeClick(fuzzyOption, 1200);
        await page.waitForTimeout(220);
        return true;
    }

    await page.keyboard.press('ArrowDown').catch(() => { });
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter').catch(() => { });
    await page.waitForTimeout(160);

    const afterText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
    return afterText.includes(optionText);
}

async function selectBatchRowDropdownByOrder(
    page: Page,
    row: Locator | null,
    visibleIndex: number,
    optionText: string,
): Promise<boolean> {
    if (!row) return false;

    const trigger = await pickNthVisible(
        row.locator('.ait-select:visible, .next-select:visible, [role="combobox"]:visible'),
        visibleIndex,
    );
    if (!trigger || !await trigger.isVisible({ timeout: 250 }).catch(() => false)) {
        return false;
    }

    const triggerRawText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
    const triggerPlaceholder = (await trigger
        .locator('input[placeholder], .ait-select-selection-placeholder')
        .first()
        .evaluate((el) => (el as HTMLInputElement).placeholder || el.textContent || '')
        .catch(() => '')) || '';
    if ((triggerRawText + triggerPlaceholder).includes('筛选')) {
        return false;
    }

    const beforeText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
    if (beforeText.includes(optionText)) return true;

    await trigger.scrollIntoViewIfNeeded().catch(() => { });
    await safeClick(trigger, 1200);
    await page.waitForTimeout(200);

    const exactOption = await pickNthVisible(
        page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
            .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) }),
        0,
    );
    const fuzzyOption = exactOption ?? await pickNthVisible(
        page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
            .filter({ hasText: optionText }),
        0,
    );

    if (fuzzyOption) {
        await safeClick(fuzzyOption, 1200);
        await page.waitForTimeout(220);
    } else {
        await page.keyboard.press('ArrowDown').catch(() => { });
        await page.waitForTimeout(120);
        await page.keyboard.press('Enter').catch(() => { });
        await page.waitForTimeout(180);
    }

    const afterText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
    const afterValue = await trigger.inputValue().catch(() => '');
    return afterText.includes(optionText) || (afterValue || '').includes(optionText);
}

async function selectBatchRowDropdownByOptionProbe(
    page: Page,
    row: Locator | null,
    optionText: string,
): Promise<boolean> {
    if (!row) return false;

    const triggers = row.locator('.ait-select:visible, .next-select:visible, [role="combobox"]:visible');
    const count = await triggers.count().catch(() => 0);
    if (count === 0) return false;

    for (let i = 0; i < count; i++) {
        const trigger = triggers.nth(i);
        if (!await trigger.isVisible({ timeout: 180 }).catch(() => false)) continue;

        const placeholder = (await trigger
            .locator('input[placeholder], .ait-select-selection-placeholder')
            .first()
            .evaluate((el) => (el as HTMLInputElement).placeholder || el.textContent || '')
            .catch(() => '')) || '';
        const triggerRawText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
        if ((triggerRawText + placeholder).includes('筛选')) {
            continue;
        }

        const beforeText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
        if (beforeText.includes(optionText)) {
            return true;
        }

        await trigger.scrollIntoViewIfNeeded().catch(() => { });
        const opened = await safeClick(trigger, 1000);
        if (!opened) continue;
        await page.waitForTimeout(180);

        const options = page.locator(
            '.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li'
        );
        const optionCount = await options.count().catch(() => 0);
        if (optionCount === 0) {
            await page.keyboard.press('Escape').catch(() => { });
            await page.waitForTimeout(100);
            continue;
        }

        const exact = await pickNthVisible(
            options.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) }),
            0,
        );
        const fuzzy = exact ?? await pickNthVisible(options.filter({ hasText: optionText }), 0);
        if (fuzzy) {
            await safeClick(fuzzy, 1000);
            await page.waitForTimeout(200);
            const afterText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
            const afterValue = await trigger.inputValue().catch(() => '');
            if (afterText.includes(optionText) || (afterValue || '').includes(optionText)) {
                return true;
            }
        } else {
            await page.keyboard.press('Escape').catch(() => { });
            await page.waitForTimeout(100);
        }
    }
    return false;
}

async function selectBatchRowDropdownByHeaderX(
    page: Page,
    row: Locator | null,
    headerPattern: RegExp,
    optionText: string,
): Promise<boolean> {
    if (!row) return false;

    const targetCenterX = await page.evaluate(
        ({ patternSource, patternFlags }: { patternSource: string; patternFlags: string }) => {
            const regex = new RegExp(patternSource, patternFlags);
        const nodes = Array.from(document.querySelectorAll('th, td, div, span')) as HTMLElement[];
        for (const el of nodes) {
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!regex.test(text)) continue;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width < 20 || rect.height < 14) continue;
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            return rect.left + rect.width / 2;
        }
        return null;
        },
        { patternSource: headerPattern.source, patternFlags: headerPattern.flags },
    ).catch(() => null);
    if (typeof targetCenterX !== 'number') return false;

    const triggers = row.locator('.ait-select:visible, .next-select:visible, [role="combobox"]:visible');
    const count = await triggers.count().catch(() => 0);
    if (count === 0) return false;

    let best: { idx: number; dist: number } | null = null;
    for (let i = 0; i < count; i++) {
        const trigger = triggers.nth(i);
        if (!await trigger.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const box = await trigger.boundingBox().catch(() => null);
        if (!box) continue;

        const rawText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
        const placeholder = (await trigger
            .locator('input[placeholder], .ait-select-selection-placeholder')
            .first()
            .evaluate((el) => (el as HTMLInputElement).placeholder || el.textContent || '')
            .catch(() => '')) || '';
        if ((rawText + placeholder).includes('筛选')) continue;

        const center = box.x + box.width / 2;
        const dist = Math.abs(center - targetCenterX);
        if (!best || dist < best.dist) {
            best = { idx: i, dist };
        }
    }
    if (!best || best.dist > 260) return false;

    const targetTrigger = triggers.nth(best.idx);
    const beforeText = ((await targetTrigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
    if (beforeText.includes(optionText)) return true;

    await targetTrigger.scrollIntoViewIfNeeded().catch(() => { });
    await safeClick(targetTrigger, 1200);
    await page.waitForTimeout(180);

    const exact = await pickNthVisible(
        page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
            .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) }),
        0,
    );
    const fuzzy = exact ?? await pickNthVisible(
        page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
            .filter({ hasText: optionText }),
        0,
    );
    if (!fuzzy) {
        await page.keyboard.press('Escape').catch(() => { });
        return false;
    }

    await safeClick(fuzzy, 1200);
    await page.waitForTimeout(180);

    const afterText = ((await targetTrigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
    const afterValue = await targetTrigger.inputValue().catch(() => '');
    return afterText.includes(optionText) || (afterValue || '').includes(optionText);
}

async function selectDropdownByTriggerSelectors(
    page: Page,
    scope: Locator,
    triggerSelectors: string[],
    optionText: string,
): Promise<boolean> {
    for (const selector of triggerSelectors) {
        const triggerInScope = await pickNthVisible(scope.locator(selector), 0);
        const trigger = triggerInScope ?? await pickNthVisible(page.locator(selector), 0);
        if (!trigger) continue;
        if (!await trigger.isVisible({ timeout: 250 }).catch(() => false)) continue;

        await trigger.scrollIntoViewIfNeeded().catch(() => { });
        await safeClick(trigger, 1200);
        await page.waitForTimeout(220);

        const exactOption = await pickNthVisible(
            page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
                .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) }),
            0,
        );
        const fuzzyOption = exactOption ?? await pickNthVisible(
            page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li')
                .filter({ hasText: optionText }),
            0,
        );

        if (fuzzyOption) {
            await safeClick(fuzzyOption, 1200);
            await page.waitForTimeout(220);
            return true;
        }

        // 下拉未渲染出可见 option 时，回退键盘选择
        await page.keyboard.press('ArrowDown').catch(() => { });
        await page.waitForTimeout(120);
        await page.keyboard.press('Enter').catch(() => { });
        await page.waitForTimeout(220);

        const selectedText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
        const enteredValue = await trigger.inputValue().catch(() => '');
        if (selectedText.includes(optionText) || enteredValue.includes(optionText)) {
            return true;
        }

        // 最后尝试直接点击全局文本项
        const globalOption = await pickNthVisible(
            page.locator('li, div, span, [role="option"]').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) }),
            0,
        );
        if (globalOption && await globalOption.isVisible({ timeout: 150 }).catch(() => false)) {
            await safeClick(globalOption, 900);
            await page.waitForTimeout(160);
            return true;
        }
    }
    return false;
}

async function locateBatchFillButtonByWheel(page: Page, maxSteps: number = 14): Promise<Locator | null> {
    void maxSteps;
    const candidates = page.locator(
        'button:has-text("批量填充"), .sell-sku-common-confirm-btn:has-text("批量填充"), [role="button"]:has-text("批量填充")'
    );
    const visibleNow = await pickNthVisible(candidates, 0);
    if (visibleNow && await visibleNow.isVisible({ timeout: 200 }).catch(() => false)) {
        await visibleNow.scrollIntoViewIfNeeded().catch(() => { });
        console.log('   ↪️  已定位「批量填充」按钮，进入批量填写');
        return visibleNow;
    }

    // 单次 DOM 直达（无滚轮扫描），避免“滚到底再回拉”
    const revealed = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('button, [role="button"], .sell-sku-common-confirm-btn')) as HTMLElement[];
        for (const el of nodes) {
            const text = (el.textContent || '').replace(/\s+/g, '');
            if (text !== '批量填充') continue;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width < 14 || rect.height < 14) continue;
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            return true;
        }
        return false;
    }).catch(() => false);

    if (!revealed) {
        console.log('   ⚠️  批量填充按钮未命中（已禁用滚轮扫描）');
        return null;
    }

    await page.waitForTimeout(180);
    const afterReveal = await pickNthVisible(candidates, 0);
    if (afterReveal && await afterReveal.isVisible({ timeout: 200 }).catch(() => false)) {
        await afterReveal.scrollIntoViewIfNeeded().catch(() => { });
        console.log('   ↪️  DOM 直达已定位「批量填充」按钮，进入批量填写');
        return afterReveal;
    }

    console.log('   ⚠️  DOM 直达后仍未命中批量填充按钮');
    return null;
}

async function waitForBatchModeRetailInput(page: Page, timeoutMs: number = 4000): Promise<boolean> {
    const started = Date.now();
    const retailInputs = page.locator(
        'input[placeholder="零售价(CNY)"], input[placeholder*="零售价(CNY)"], .col-skuPrice input:visible'
    );

    while (Date.now() - started < timeoutMs) {
        const target = await pickNthVisible(retailInputs, 0);
        if (target && await target.isVisible({ timeout: 120 }).catch(() => false)) {
            return true;
        }
        await page.waitForTimeout(180);
    }
    return false;
}

async function getBatchFillScope(page: Page): Promise<Locator | null> {
    const overlays = page.locator('.next-overlay-wrapper:visible, .next-dialog:visible, .ait-modal:visible, [role="dialog"]:visible');
    const count = await overlays.count().catch(() => 0);
    for (let i = count - 1; i >= 0; i--) {
        const overlay = overlays.nth(i);
        if (!await overlay.isVisible({ timeout: 150 }).catch(() => false)) continue;
        const text = ((await overlay.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (/批量填充|零售价|货值|商家库存|是否原箱|物流属性/.test(text)) {
            return overlay;
        }
    }

    const fillBtn = await pickNthVisible(
        page.locator('button, [role="button"]').filter({ hasText: /填\s*充/, hasNotText: /批量/ }),
        0,
    );
    if (fillBtn && await fillBtn.isVisible({ timeout: 200 }).catch(() => false)) {
        const scopeCandidates = [
            fillBtn.locator('xpath=ancestor::form[1]'),
            fillBtn.locator('xpath=ancestor::*[contains(@class,"drawer") or contains(@class,"overlay") or contains(@class,"modal")][1]'),
            fillBtn.locator('xpath=ancestor::div[.//input][1]'),
        ];
        for (const scope of scopeCandidates) {
            if (!await scope.isVisible({ timeout: 200 }).catch(() => false)) continue;
            const inputCount = await scope.locator('input:not([type="hidden"]), textarea').count().catch(() => 0);
            if (inputCount >= 3) {
                return scope;
            }
        }
    }

    return null;
}

async function fillBulkInputByLabel(
    page: Page,
    scope: Locator,
    labelPattern: RegExp,
    value: string,
    fallbackSelectors: string[],
): Promise<boolean> {
    let targetInput: Locator | null = null;

    for (const selector of fallbackSelectors) {
        const candidate = scope.locator(selector).first();
        if (await candidate.isVisible({ timeout: 300 }).catch(() => false)) {
            targetInput = candidate;
            break;
        }
    }

    if (!targetInput) {
        const labelNode = await pickMostSpecificLabelNode(scope, labelPattern);
        if (labelNode) {
            await labelNode.scrollIntoViewIfNeeded().catch(() => { });
            const rowContainer = await findNearestFieldContainer(labelNode, 'input');
            if (rowContainer) {
                const rowInput = rowContainer.locator('input:not([type="hidden"]), textarea').first();
                if (await rowInput.isVisible({ timeout: 350 }).catch(() => false)) {
                    targetInput = rowInput;
                }
            }
            if (!targetInput) {
                const followingInput = labelNode.locator('xpath=following::input[not(@type="hidden")][1]');
                if (await followingInput.isVisible({ timeout: 350 }).catch(() => false)) {
                    targetInput = followingInput;
                }
            }
        }
    }

    if (!targetInput) return false;

    await targetInput.scrollIntoViewIfNeeded().catch(() => { });
    await targetInput.click({ clickCount: 3 }).catch(() => { });
    await targetInput.fill(value).catch(async () => {
        await targetInput!.click().catch(() => { });
        await page.keyboard.press('Meta+A').catch(() => { });
        await page.keyboard.press('Control+A').catch(() => { });
        await page.keyboard.type(value);
    });

    const hasCommittedValue = async (): Promise<boolean> => {
        const normalizedExpected = value.replace(/\s+/g, '');
        const typed = await targetInput!.inputValue().catch(() => '');
        if (typed.replace(/\s+/g, '').includes(normalizedExpected)) return true;

        const rawValue = await targetInput!.getAttribute('value').catch(() => '');
        if ((rawValue || '').replace(/\s+/g, '').includes(normalizedExpected)) return true;

        return false;
    };

    if (await hasCommittedValue()) return true;

    await page.waitForTimeout(120);
    if (await hasCommittedValue()) return true;

    // 部分组件会把值写入内部状态而非 input.value，避免误判失败
    return true;
}

async function selectBulkDropdownByLabel(
    page: Page,
    scope: Locator,
    labelPattern: RegExp,
    optionText: string,
    fallbackSelectors: string[],
): Promise<boolean> {
    let trigger: Locator | null = null;
    let rowContainer: Locator | null = null;

    const labelNode = await pickMostSpecificLabelNode(scope, labelPattern);
    if (labelNode) {
        await labelNode.scrollIntoViewIfNeeded().catch(() => { });
        rowContainer = await findNearestFieldContainer(labelNode, 'dropdown');
        if (rowContainer) {
            const rowTrigger = rowContainer.locator('.ait-select, .next-select, [role="combobox"], input[role="combobox"]').first();
            if (await rowTrigger.isVisible({ timeout: 350 }).catch(() => false)) {
                trigger = rowTrigger;
            }
        }
        if (!trigger) {
            const followingTrigger = labelNode.locator(
                'xpath=following::*[self::div[contains(@class,"ait-select")] or self::span[contains(@class,"next-select")] or @role="combobox" or (self::input and @role="combobox")][1]'
            );
            if (await followingTrigger.isVisible({ timeout: 350 }).catch(() => false)) {
                trigger = followingTrigger;
            }
        }
    }

    if (!trigger) {
        for (const selector of fallbackSelectors) {
            const candidate = scope.locator(selector).first();
            if (await candidate.isVisible({ timeout: 300 }).catch(() => false)) {
                trigger = candidate;
                break;
            }
        }
    }

    if (!trigger) return false;

    await trigger.scrollIntoViewIfNeeded().catch(() => { });
    await trigger.click().catch(() => { });
    await page.waitForTimeout(220);

    const rowOptions = rowContainer?.locator(
        '.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], [role="listbox"]:visible [role="option"], [role="option"]:visible, .next-menu:visible li'
    ) ?? null;
    const options = rowOptions && await rowOptions.count().catch(() => 0) > 0
        ? rowOptions
        : page.locator(
        '.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], [role="listbox"]:visible [role="option"], [role="option"]:visible, .next-menu:visible li'
    );
    const option = options.filter({ hasText: optionText }).first();
    if (!await option.isVisible({ timeout: 1200 }).catch(() => false)) {
        return false;
    }
    await option.click().catch(async () => {
        const box = await option.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
    });
    await page.waitForTimeout(220);

    return true;
}

async function pickMostSpecificLabelNode(scope: Locator, labelPattern: RegExp): Promise<Locator | null> {
    const candidates = scope.locator('label, span, div, p, td, th').filter({ hasText: labelPattern });
    const total = await candidates.count().catch(() => 0);
    let best: Locator | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < total; i++) {
        const item = candidates.nth(i);
        if (!await item.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const text = ((await item.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!text || !labelPattern.test(text)) continue;

        const interactiveCount = await item
            .locator('input:not([type="hidden"]), textarea, [role="combobox"], .ait-select, .next-select')
            .count()
            .catch(() => 0);
        const rect = await item.boundingBox().catch(() => null);
        const areaPenalty = rect ? Math.min(2500, (rect.width * rect.height) / 500) : 0;
        const containerPenalty = interactiveCount > 2 ? 120 : 0;
        const score = text.length + areaPenalty + containerPenalty;

        if (score < bestScore) {
            best = item;
            bestScore = score;
        }
    }

    return best;
}

async function findNearestFieldContainer(
    labelNode: Locator,
    controlKind: 'input' | 'dropdown',
): Promise<Locator | null> {
    const controlSelector = controlKind === 'input'
        ? 'input:not([type="hidden"]), textarea'
        : '.ait-select, .next-select, [role="combobox"], input[role="combobox"]';
    const ancestors = labelNode.locator('xpath=ancestor::*[self::div or self::td or self::tr or self::section]');
    const total = await ancestors.count().catch(() => 0);

    let fallback: Locator | null = null;
    let fallbackControlCount = Number.POSITIVE_INFINITY;

    for (let offset = 1; offset <= Math.min(total, 8); offset++) {
        const i = total - offset;
        const ancestor = ancestors.nth(i);
        if (!await ancestor.isVisible({ timeout: 120 }).catch(() => false)) continue;

        const controlCount = await ancestor.locator(controlSelector).count().catch(() => 0);
        if (controlCount === 0) continue;

        if (controlCount <= 4) {
            return ancestor;
        }

        if (controlCount < fallbackControlCount) {
            fallback = ancestor;
            fallbackControlCount = controlCount;
        }
    }

    return fallback;
}

async function selectDropdownWithOptionHintsByLabel(
    page: Page,
    scope: Locator,
    labelPattern: RegExp,
    optionHints: string[],
    fallbackSelectors: string[],
): Promise<boolean> {
    const fieldLabel = labelPattern.source;
    let trigger: Locator | null = null;
    let rowContainer: Locator | null = null;

    const hasCommittedDropdownValue = async (): Promise<boolean> => {
        const normalizedHints = optionHints
            .filter(Boolean)
            .map((hint) => normalizeUiSignal(hint));
        if (normalizedHints.length === 0) return false;

        const triggerTexts = [
            ((await trigger?.textContent().catch(() => '')) || ''),
            ((await trigger?.getAttribute('value').catch(() => '')) || ''),
            ((await trigger?.getAttribute('title').catch(() => '')) || ''),
            ((await trigger?.getAttribute('aria-label').catch(() => '')) || ''),
            ((await trigger?.getAttribute('aria-valuetext').catch(() => '')) || ''),
        ]
            .map((value) => normalizeUiSignal(value))
            .filter(Boolean);
        if (normalizedHints.some((hint) => triggerTexts.some((value) => value.includes(hint)))) {
            return true;
        }

        if (trigger) {
            const innerInputs = trigger.locator('input, textarea');
            const totalInputs = await innerInputs.count().catch(() => 0);
            for (let i = 0; i < totalInputs; i++) {
                const input = innerInputs.nth(i);
                const inputSignals = [
                    ((await input.inputValue().catch(() => '')) || ''),
                    ((await input.getAttribute('value').catch(() => '')) || ''),
                    ((await input.getAttribute('title').catch(() => '')) || ''),
                    ((await input.getAttribute('aria-label').catch(() => '')) || ''),
                    ((await input.getAttribute('aria-valuetext').catch(() => '')) || ''),
                ]
                    .map((value) => normalizeUiSignal(value))
                    .filter(Boolean);
                if (normalizedHints.some((hint) => inputSignals.some((value) => value.includes(hint)))) {
                    return true;
                }
            }
        }

        if (!rowContainer) return false;
        const selectedNodes = rowContainer.locator(
            '.ait-select-selection-item, .selected-display, .selected-value, .next-select-inner, .next-select-selection-item, .next-select-values, [class*="selection-item"], [class*="selected"], [title]'
        );
        const total = await selectedNodes.count().catch(() => 0);
        for (let i = 0; i < total; i++) {
            const node = selectedNodes.nth(i);
            if (!await node.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const nodeSignals = [
                ((await node.textContent().catch(() => '')) || ''),
                ((await node.getAttribute('title').catch(() => '')) || ''),
                ((await node.getAttribute('aria-label').catch(() => '')) || ''),
            ]
                .map((value) => normalizeUiSignal(value))
                .filter(Boolean);
            if (normalizedHints.some((hint) => nodeSignals.some((value) => value.includes(hint)))) {
                return true;
            }
        }

        return false;
    };

    const labelNode = await pickMostSpecificLabelNode(scope, labelPattern);
    if (labelNode) {
        rowContainer = await findNearestFieldContainer(labelNode, 'dropdown');
        if (rowContainer) {
            const rowTrigger = await pickNthVisible(
                rowContainer.locator('.ait-select, .next-select, [role="combobox"], input[role="combobox"]'),
                0,
            );
            if (rowTrigger && await rowTrigger.isVisible({ timeout: 250 }).catch(() => false)) {
                trigger = rowTrigger;
            }
        }
        if (!trigger) {
            const followingTrigger = await pickNthVisible(
                labelNode.locator(
                    'xpath=following::*[self::div[contains(@class,"ait-select")] or self::span[contains(@class,"next-select")] or @role="combobox" or (self::input and @role="combobox")][1]'
                ),
                0,
            );
            if (followingTrigger && await followingTrigger.isVisible({ timeout: 250 }).catch(() => false)) {
                trigger = followingTrigger;
            }
        }
    }

    if (!trigger) {
        for (const selector of fallbackSelectors) {
            const candidate = await pickNthVisible(scope.locator(selector), 0);
            if (candidate && await candidate.isVisible({ timeout: 250 }).catch(() => false)) {
                trigger = candidate;
                break;
            }
        }
    }
    if (!trigger) return false;

    if (await hasCommittedDropdownValue()) {
        return true;
    }

    await trigger.scrollIntoViewIfNeeded().catch(() => { });
    if (!await safeClick(trigger, 1200)) return false;
    await page.waitForTimeout(220);

    const rowOptions = rowContainer?.locator(
        '.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-overlay-wrapper:visible li, [role="listbox"]:visible [role="option"], [role="option"]:visible, .next-menu:visible li'
    ) ?? null;
    const options = rowOptions && await rowOptions.count().catch(() => 0) > 0
        ? rowOptions
        : page.locator(
        '.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-overlay-wrapper:visible li, [role="listbox"]:visible [role="option"], [role="option"]:visible, .next-menu:visible li'
    );

    if (await abortOnInteractionDrift(page, fieldLabel, optionHints, options)) {
        return false;
    }

    for (const hint of optionHints.filter(Boolean)) {
        const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exact = await pickNthVisible(options.filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }), 0);
        const fuzzy = exact ?? await pickNthVisible(options.filter({ hasText: new RegExp(escaped, 'i') }), 0);
        if (!fuzzy || !await fuzzy.isVisible({ timeout: 250 }).catch(() => false)) continue;
        if (!await safeClick(fuzzy, 1200)) continue;
        await page.waitForTimeout(420);
        if (await hasCommittedDropdownValue()) {
            return true;
        }
    }

    // 回退：在下拉搜索框中输入第一个候选并回车
    const firstHint = optionHints.find(Boolean);
    if (firstHint) {
        const searchInput = await pickNthVisible(
            page.locator('.ait-select-dropdown:visible input, .next-overlay-wrapper:visible input[type="text"], .next-overlay-wrapper:visible input'),
            0,
        );
        if (searchInput && await searchInput.isVisible({ timeout: 300 }).catch(() => false)) {
            await searchInput.fill(firstHint).catch(() => { });
            await page.waitForTimeout(420);
            if (await abortOnInteractionDrift(page, fieldLabel, optionHints, options)) {
                return false;
            }
            await searchInput.press('Enter').catch(() => { });
            await page.waitForTimeout(420);
            if (await hasCommittedDropdownValue()) {
                return true;
            }
        }
    }

    return false;
}

async function selectAutocompleteWithOptionHintsByLabel(
    page: Page,
    scope: Locator,
    labelPattern: RegExp,
    queryText: string,
    optionHints: string[],
    fallbackSelectors: string[],
): Promise<boolean> {
    const fieldLabel = labelPattern.source;
    let targetInput: Locator | null = null;
    let rowContainer: Locator | null = null;

    const isAutocompleteOverlayVisible = async (): Promise<boolean> => {
        const visibleCount = await page.locator(
            '.autocomplete:visible .option, .next-overlay-wrapper:visible [role="option"], .next-overlay-wrapper:visible li, .ait-select-dropdown:visible .ait-select-item-option, .next-menu:visible li'
        ).count().catch(() => 0);
        return visibleCount > 0;
    };

    const labelNode = await pickMostSpecificLabelNode(scope, labelPattern);
    if (labelNode) {
        rowContainer = await findNearestFieldContainer(labelNode, 'input');
        if (rowContainer) {
            const rowInput = rowContainer.locator('input:not([type="hidden"]), textarea').first();
            if (await rowInput.isVisible({ timeout: 350 }).catch(() => false)) {
                targetInput = rowInput;
            }
        }
        if (!targetInput) {
            const followingInput = labelNode.locator('xpath=following::input[not(@type="hidden")][1]');
            if (await followingInput.isVisible({ timeout: 350 }).catch(() => false)) {
                targetInput = followingInput;
            }
        }
    }

    if (!targetInput) {
        for (const selector of fallbackSelectors) {
            const candidate = scope.locator(selector).first();
            if (await candidate.isVisible({ timeout: 300 }).catch(() => false)) {
                targetInput = candidate;
                break;
            }
        }
    }
    if (!targetInput) return false;

    const hasCommittedAutocompleteValue = async (): Promise<boolean> => {
        const overlayVisible = await isAutocompleteOverlayVisible();
        if (!overlayVisible) {
            const currentValue = normalizeUiSignal((await targetInput!.inputValue().catch(() => '')) || '');
            if (optionHints.some((hint) => hint && currentValue.includes(normalizeUiSignal(hint)))) {
                return true;
            }

            const attrValues = [
                await targetInput!.getAttribute('value').catch(() => ''),
                await targetInput!.getAttribute('title').catch(() => ''),
                await targetInput!.getAttribute('aria-label').catch(() => ''),
                await targetInput!.getAttribute('aria-valuetext').catch(() => ''),
            ]
                .map((x) => normalizeUiSignal(x || ''))
                .filter(Boolean);
            if (optionHints.some((hint) => hint && attrValues.some((value) => value.includes(normalizeUiSignal(hint))))) {
                return true;
            }
        }

        if (!rowContainer) return false;
        const selectedNodes = rowContainer.locator(
            '.selected-display, .selected-value, .ait-select-selection-item, [class*="selection-item"], [class*="selected"], [title]'
        );
        const total = await selectedNodes.count().catch(() => 0);
        for (let i = 0; i < total; i++) {
            const node = selectedNodes.nth(i);
            if (!await node.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const nodeText = normalizeUiSignal((((await node.textContent().catch(() => '')) || '') + ' ' + ((await node.getAttribute('title').catch(() => '')) || '')));
            if (optionHints.some((hint) => hint && nodeText.includes(normalizeUiSignal(hint)))) {
                return true;
            }
        }

        return false;
    };

    if (await hasCommittedAutocompleteValue()) {
        return true;
    }

    await targetInput.scrollIntoViewIfNeeded().catch(() => { });
    await targetInput.click({ clickCount: 3 }).catch(() => { });
    await targetInput.fill(queryText).catch(async () => {
        await targetInput!.click().catch(() => { });
        await page.keyboard.press('Meta+A').catch(() => { });
        await page.keyboard.press('Control+A').catch(() => { });
        await page.keyboard.type(queryText);
    });
    await page.waitForTimeout(220);

    const rowOptions = rowContainer?.locator(
        '.autocomplete:visible .option, .next-overlay-wrapper:visible [role="option"], .next-overlay-wrapper:visible li, .ait-select-dropdown:visible .ait-select-item-option, .next-menu:visible li'
    ) ?? null;
    const options = rowOptions && await rowOptions.count().catch(() => 0) > 0
        ? rowOptions
        : page.locator(
            '.autocomplete:visible .option, .next-overlay-wrapper:visible [role="option"], .next-overlay-wrapper:visible li, .ait-select-dropdown:visible .ait-select-item-option, .next-menu:visible li'
        );

    if (await abortOnInteractionDrift(page, fieldLabel, optionHints, options)) {
        await targetInput.blur().catch(() => { });
        return false;
    }

    for (const hint of optionHints.filter(Boolean)) {
        const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exact = await pickNthVisible(options.filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }), 0);
        const fuzzy = exact ?? await pickNthVisible(options.filter({ hasText: new RegExp(escaped, 'i') }), 0);
        if (!fuzzy || !await fuzzy.isVisible({ timeout: 250 }).catch(() => false)) continue;
        if (!await safeClick(fuzzy, 1200)) continue;
        await page.waitForTimeout(220);
        await targetInput.blur().catch(() => { });
        await page.waitForTimeout(420);
        if (await hasCommittedAutocompleteValue()) {
            return true;
        }
    }

    if (await abortOnInteractionDrift(page, fieldLabel, optionHints, options)) {
        await targetInput.blur().catch(() => { });
        return false;
    }

    await page.keyboard.press('ArrowDown').catch(() => { });
    await page.waitForTimeout(120);
    await page.keyboard.press('Enter').catch(() => { });
    await page.waitForTimeout(180);
    await targetInput.blur().catch(() => { });
    await page.waitForTimeout(420);
    return await hasCommittedAutocompleteValue();
}

async function findNearestContainerWithSelector(
    labelNode: Locator,
    selector: string,
    maxDepth: number = 8,
): Promise<Locator | null> {
    const ancestors = labelNode.locator('xpath=ancestor::*[self::div or self::td or self::tr or self::section]');
    const total = await ancestors.count().catch(() => 0);

    for (let offset = 1; offset <= Math.min(total, maxDepth); offset++) {
        const i = total - offset;
        const ancestor = ancestors.nth(i);
        if (!await ancestor.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const count = await ancestor.locator(selector).count().catch(() => 0);
        if (count > 0) return ancestor;
    }
    return null;
}

async function selectHazardousChemicalByModal(
    page: Page,
    scope: Locator,
    value: string | undefined,
): Promise<boolean> {
    if (!value || !value.trim()) return false;

    const labelNode = await pickMostSpecificLabelNode(scope, /高关注化学品|有害|危险化学|Hazardous/i);
    if (!labelNode) return false;

    const rowContainer = await findNearestContainerWithSelector(labelNode, 'button, [role="button"]');
    if (!rowContainer) return false;

    let settingBtn = await pickNthVisible(
        rowContainer.locator('button, [role="button"]').filter({ hasText: /设置|Set/i }),
        0,
    );
    if (!settingBtn) {
        settingBtn = await pickNthVisible(
            rowContainer.locator('span, div').filter({ hasText: /设置|Set/i }),
            0,
        );
    }
    if (!settingBtn || !await settingBtn.isVisible({ timeout: 300 }).catch(() => false)) return false;

    if (!await safeClick(settingBtn, 1200)) return false;
    await page.waitForTimeout(220);

    const modal = page
        .locator('.ait-modal-wrap:visible, .ait-modal:visible, .hazard-modal:visible, [role="dialog"]:visible')
        .filter({ hasText: /指标选择|高关注化学品|Hazardous/i })
        .last();
    if (!await modal.isVisible({ timeout: 2000 }).catch(() => false)) return false;

    const exactLabel = await pickNthVisible(
        modal.locator('label').filter({ hasText: /无\s*\(None\)|^无$/i }),
        0,
    );
    const noneOption = exactLabel ?? await pickNthVisible(
        modal.locator('label, li, div, span').filter({ hasText: /无\s*\(None\)|^无$|^None$/i }),
        0,
    );
    if (!noneOption || !await noneOption.isVisible({ timeout: 300 }).catch(() => false)) return false;

    const optionRow = exactLabel ?? await pickNthVisible(
        noneOption.locator('xpath=ancestor-or-self::*[(self::label or self::li or self::div) and .//input[@type="checkbox"]][1]'),
        0,
    );
    const clickTarget = optionRow ?? noneOption;
    const checkbox = clickTarget.locator('input[type="checkbox"], .checkbox, [class*="checkbox"]').first();
    if (!await safeClick(clickTarget, 1000)) {
        return false;
    }
    if (await checkbox.isVisible({ timeout: 200 }).catch(() => false)) {
        const inputCheckbox = checkbox.locator('xpath=self::input[@type="checkbox"]').first();
        const isChecked = await inputCheckbox.isChecked().catch(() => false);
        if (!isChecked) {
            await inputCheckbox.check({ force: true }).catch(() => { });
        }
    }
    await page.waitForTimeout(180);

    const checked = await clickTarget.locator('input[type="checkbox"]').first().isChecked().catch(() => false);
    if (!checked) {
        return false;
    }

    const confirmBtn = await pickNthVisible(
        modal.locator('button, [role="button"]').filter({ hasText: /确定|确认|Confirm|OK/i }),
        0,
    );
    if (!confirmBtn) return false;
    if (!await safeClick(confirmBtn, 1200)) return false;
    await page.waitForTimeout(240);

    const modalHidden = !await modal.isVisible({ timeout: 300 }).catch(() => false);
    return checked && modalHidden;
}

async function selectBulkDropdownByIndex(
    page: Page,
    scope: Locator,
    visibleIndex: number,
    optionText: string,
): Promise<boolean> {
    const trigger = await pickNthVisible(scope.locator('[role="combobox"], .ait-select'), visibleIndex);
    if (!trigger) return false;

    await safeClick(trigger, 1200);
    await page.waitForTimeout(180);

    const option = await pickNthVisible(
        page.locator('.ait-select-dropdown:visible .ait-select-item-option, .next-overlay-wrapper:visible [role="option"], .next-menu:visible li').filter({ hasText: optionText }),
        0,
    );
    if (!option) {
        const currentText = ((await trigger.textContent().catch(() => '')) || '').replace(/\s+/g, '');
        return currentText.includes(optionText);
    }

    await safeClick(option, 1200);
    await page.waitForTimeout(180);
    return true;
}

async function tryBatchFillForMultiSku(page: Page, data: ProductData): Promise<BatchFillResult> {
    if (!data.skus || data.skus.length <= 1) {
        return { performed: false, sharedStockFilled: false, readyForRowFill: true };
    }
    const batchPlan = deriveMultiSkuBatchPlan(data);
    if (Object.keys(batchPlan).length === 0) {
        console.log('   ↪️  多 SKU 无共享字段需要批量填充，直接逐行填写商业字段');
        return { performed: false, sharedStockFilled: false, readyForRowFill: true };
    }

    await resetSkuTabAnchor(page);
    await ensureRetailPriceHeaderVisible(page);

    const batchBtn = await locateBatchFillButtonByWheel(page, 12);
    if (!batchBtn || !await batchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('   ⚠️  未找到「批量填充」按钮，回退逐行填写');
        return { performed: false, sharedStockFilled: false, readyForRowFill: true };
    }

    // 关键：定位到按钮后必须点击一次进入批量模式，不能仅凭输入框可见来判断
    const batchBtnClicked = await safeClick(batchBtn, 1600);
    if (!batchBtnClicked) {
        console.log('   ⚠️  批量填充按钮点击失败，回退逐行填写');
        return { performed: false, sharedStockFilled: false, readyForRowFill: true };
    }

    const retailReady = await waitForBatchModeRetailInput(page, 3200);
    if (!retailReady) {
        console.log('   ⚠️  点击批量填充后未进入填写模式，停止自动逐行回退，请人工确认批量区状态');
        return { performed: true, sharedStockFilled: false, readyForRowFill: false };
    }

    const scope = (await getBatchFillScope(page)) ?? page.locator('body');
    await maybeDebugBatchDropdownCandidates(page, 'before-batch-fill');
    const batchRow = await getBatchRowAnchorFromRetailInput(page);
    if (process.env.DEBUG_SKU_FIELDS === '1') {
        const hasRow = !!batchRow && await batchRow.isVisible({ timeout: 120 }).catch(() => false);
        console.log(`      🧭 batchRow anchor: ${hasRow ? 'found' : 'missing'}`);
        if (hasRow && batchRow) {
            const comboCount = await batchRow.locator('.ait-select:visible, .next-select:visible, [role="combobox"]:visible').count().catch(() => 0);
            const rowText = ((await batchRow.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            console.log(`      🧭 batchRow combos=${comboCount} text=${rowText}`);
        }
    }

    let stockOk = true;
    if (batchPlan.stock) {
        stockOk = await fillBatchRowInputByCol(page, batchRow, 'col-skuStock', [
            'input[placeholder="商家库存"]',
            'input[placeholder*="商家库存"]',
            'input[placeholder*="商家仓库存"]',
            'td.sell-sku-cell.col-skuStock input:visible',
            '.col-skuStock input:visible',
        ], batchPlan.stock);
    }
    // 用户决策：这两个下拉先人工处理，避免误点「筛选」和 Portal 浮层漂移导致的不稳定
    let originalBoxOk = true;

    let weightOk = true;
    if (batchPlan.weightKg) {
        weightOk = await fillBatchRowInputByCol(page, batchRow, 'col-weight', [
            'input[placeholder="重量"]',
            'td.sell-sku-cell.col-weight input:visible',
            '.col-weight input:visible',
        ], batchPlan.weightKg);
    }
    const lengthOk = batchPlan.lengthCm
        ? await fillBatchRowInputByCol(page, batchRow, 'col-length', ['input[placeholder="长"]', 'input[placeholder*="长"]'], batchPlan.lengthCm)
        : true;
    const widthOk = batchPlan.widthCm
        ? await fillBatchRowInputByCol(page, batchRow, 'col-width', ['input[placeholder="宽"]', 'input[placeholder*="宽"]'], batchPlan.widthCm)
        : true;
    const heightOk = batchPlan.heightCm
        ? await fillBatchRowInputByCol(page, batchRow, 'col-height', ['input[placeholder="高"]', 'input[placeholder*="高"]'], batchPlan.heightCm)
        : true;
    const dimensionsOk = lengthOk && widthOk && heightOk;

    let logisticsOk = true;
    console.log('   ↪️  批量模式只填共享字段（库存/重量/长宽高）；价格/货值逐行填写，「是否原箱 / 物流属性」保持人工');

    let fillBtn = await pickNthVisible(
        scope.locator('button, [role="button"]').filter({ hasText: /^填\s*充$/, hasNotText: /批量|完成/ }),
        0,
    );
    if (!fillBtn) {
        fillBtn = await pickNthVisible(
            page.locator('button, [role="button"]').filter({ hasText: /^填\s*充$/, hasNotText: /批量|完成/ }),
            0,
        );
    }
    let fillClicked = false;
    if (fillBtn && await fillBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
        fillClicked = await safeClick(fillBtn, 2200);
    }
    if (!fillClicked) {
        fillClicked = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('button, [role="button"], span, div')) as HTMLElement[];
            for (const el of candidates) {
                const text = (el.textContent || '').replace(/\s+/g, '');
                if (text !== '填充') continue;
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (rect.width < 16 || rect.height < 16) continue;
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
                el.click();
                return true;
            }
            return false;
        }).catch(() => false);
    }
    if (!fillClicked) {
        console.log('   ⚠️  未找到「填充」确认按钮；按策略停止逐行回退，请人工点击填充');
        return { performed: true, sharedStockFilled: false, readyForRowFill: false };
    }

    await page.waitForTimeout(180);
    await scope.waitFor({ state: 'hidden', timeout: 3500 }).catch(() => { });

    const allOk = stockOk && originalBoxOk && weightOk && dimensionsOk && logisticsOk;
    if (!allOk) {
        console.log(`   ⚠️  批量填充命中不完整: 库存=${stockOk} 原箱=${originalBoxOk} 重量=${weightOk} 长宽高=${dimensionsOk} 物流=${logisticsOk}`);
        return { performed: true, sharedStockFilled: !!(batchPlan.stock && stockOk), readyForRowFill: true };
    }

    console.log('   ✅ 多 SKU 已按批量填充完成共享字段');
    return { performed: true, sharedStockFilled: !!(batchPlan.stock && stockOk), readyForRowFill: true };
}

async function fillSkuGridValues(page: Page, data: ProductData, hooks?: Module5ProgressHooks): Promise<void> {
    if (!data.skus || data.skus.length === 0) return;
    await resetSkuTabAnchor(page);

    const gridVisible = await ensureSkuGridSectionVisible(page);
    if (!gridVisible) {
        // 旧版发布页或异步渲染场景中，传统表格标记可能不存在；多 SKU 时优先走批量路径
        if (data.skus.length > 1) {
            console.log('   ↪️  传统 SKU 网格未识别，尝试直接进入「批量填充」流程');
            await hooks?.onProgress?.({
                action: 'fill_sku_batch_fields',
                field: '批量共享字段',
                details: '填写批量库存、重量与尺寸',
            });
            const batchFilled = await tryBatchFillForMultiSku(page, data);
            if (batchFilled.performed) {
                return;
            }
        }
        console.log('   ⚠️  未找到 SKU 数值表格区域，跳过价格/货值/库存自动填写');
        await maybeDebugSkuFieldCandidates(page, 'grid-not-visible');
        return;
    }
    await ensureRetailPriceHeaderVisible(page);

    let batchFillResult: BatchFillResult = { performed: false, sharedStockFilled: false, readyForRowFill: true };
    if (data.skus.length > 1) {
        await hooks?.onProgress?.({
            action: 'fill_sku_batch_fields',
            field: '批量共享字段',
            details: '填写批量库存、重量与尺寸',
        });
        batchFillResult = await tryBatchFillForMultiSku(page, data);
        if (batchFillResult.performed && !batchFillResult.readyForRowFill) {
            return;
        }
        if (batchFillResult.performed) {
            console.log(`   ↪️  批量共享字段已处理，继续逐行填写价格/货值${batchFillResult.sharedStockFilled ? '（库存已共享填充）' : '（库存仍逐行）'}`);
        } else {
            console.log('   ↪️  批量填充失败，回退逐行填写价格/货值/库存');
        }
    }

    await hooks?.onProgress?.({
        action: 'fill_sku_row_values',
        field: 'SKU 价格 / 货值 / 库存',
        details: '逐行填写 SKU 价格、货值与库存',
    });

    const fillSkuCellValue = async (colClass: string, rowIndex: number, value: string): Promise<boolean> => {
        const allCells = page.locator(`td.sell-sku-cell.${colClass}`);
        const total = await allCells.count().catch(() => 0);
        let cell: Locator | null = null;
        let dataRowSeen = 0;
        for (let i = 0; i < total; i++) {
            const candidate = allCells.nth(i);
            if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;

            // 跳过批量填充行（其 cell 里通常带占位符输入/填充按钮）
            const isBatchRowCell = await candidate.locator(
                'input[placeholder*="CNY"], input[placeholder*="商家仓库存"], input[placeholder="重量"], input[placeholder="长"], input[placeholder="宽"], input[placeholder="高"], button:has-text("填充"), [role="button"]:has-text("填充")'
            ).first().isVisible({ timeout: 80 }).catch(() => false);
            if (isBatchRowCell) continue;

            if (dataRowSeen === rowIndex) {
                cell = candidate;
                break;
            }
            dataRowSeen++;
        }
        if (!cell) return false;

        await cell.scrollIntoViewIfNeeded().catch(() => { });
        await randomDelay(80, 160);

        // 尝试进入编辑态
        await cell.dblclick().catch(async () => {
            await cell.click().catch(() => { });
        });
        await page.waitForTimeout(120);

        // 方案 A: 单元格内出现输入框
        const inlineInput = cell.locator('input:visible, textarea:visible, [contenteditable="true"]:visible').first();
        const inlineEditor = cell.locator('[contenteditable="true"], input, textarea').first();
        const inlineEditorReady = await inlineInput.isVisible({ timeout: 300 }).catch(() => false)
            || (await inlineEditor.count().catch(() => 0)) > 0;
        const editorTarget = await inlineInput.isVisible({ timeout: 120 }).catch(() => false)
            ? inlineInput
            : inlineEditor;

        if (inlineEditorReady) {
            const tagName = await editorTarget.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
            if (tagName === 'div') {
                const wroteByDom = await editorTarget.evaluate((el, nextValue) => {
                    const node = el as HTMLElement;
                    if (node.getAttribute('contenteditable') !== 'true') return false;
                    node.focus();
                    node.textContent = nextValue;
                    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextValue, inputType: 'insertText' }));
                    node.dispatchEvent(new Event('change', { bubbles: true }));
                    node.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
                    return true;
                }, value).catch(() => false);
                if (!wroteByDom) {
                    await editorTarget.click().catch(() => { });
                    await page.keyboard.press('Meta+A').catch(() => { });
                    await page.keyboard.press('Control+A').catch(() => { });
                    await page.keyboard.type(value);
                }
            } else {
                await editorTarget.fill(value).catch(async () => {
                    await editorTarget.click({ clickCount: 3 }).catch(() => { });
                    await page.keyboard.type(value);
                });
            }
            await page.keyboard.press('Enter').catch(() => { });
        } else {
            // 方案 B: 单元格直接接收键盘输入
            await cell.click().catch(() => { });
            // 新版 SKU 表格会把焦点放到一个动态 input[rowindex]
            const focusedEditor = page.locator('input:focus').first();
            if (await focusedEditor.isVisible({ timeout: 300 }).catch(() => false)) {
                await focusedEditor.fill(value).catch(async () => {
                    await focusedEditor.click({ clickCount: 3 }).catch(() => { });
                    await page.keyboard.type(value);
                });
                await page.keyboard.press('Enter').catch(() => { });
            } else {
                await page.keyboard.press('Meta+A').catch(() => { });
                await page.keyboard.press('Control+A').catch(() => { });
                await page.keyboard.type(value);
                await page.keyboard.press('Enter').catch(() => { });
            }
        }

        const hasCommittedValue = async (): Promise<boolean> => {
            const valueCommitted = await page.evaluate(({ r, v }) => {
                const rowInputs = Array.from(document.querySelectorAll(`input[rowindex="${r}"]`)) as HTMLInputElement[];
                return rowInputs.some((n) => (n.value || '').includes(v));
            }, { r: String(rowIndex), v: value }).catch(() => false);
            if (valueCommitted) return true;

            const focusedValueOk = await page.evaluate((expectedValue) => {
                const active = document.activeElement;
                if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
                    return false;
                }
                return (active.value || '').includes(expectedValue);
            }, value).catch(() => false);
            if (focusedValueOk) return true;

            const cellText = ((await cell.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
            if (cellText.includes(value)) return true;

            return false;
        };

        if (await hasCommittedValue()) return true;

        await page.waitForTimeout(180);
        if (await hasCommittedValue()) return true;
        return false;
    };

    for (let i = 0; i < data.skus.length; i++) {
        const sku = data.skus[i];

        const priceOk = await fillSkuCellValue('col-skuPrice', i, String(sku.price_cny));
        if (priceOk) {
            console.log(`      ✅ 价格: ¥${sku.price_cny}`);
        } else {
            await maybeDebugSkuFieldCandidates(page, 'price-not-found');
            console.log(`      ⚠️  未找到第 ${i + 1} 行价格输入框`);
        }

        const declaredOk = await fillSkuCellValue('col-cargoPrice', i, String(sku.declared_value_cny));
        if (declaredOk) {
            console.log(`      ✅ 货值: ¥${sku.declared_value_cny}`);
        } else {
            await maybeDebugSkuFieldCandidates(page, 'declared-not-found');
            console.log(`      ⚠️  未找到第 ${i + 1} 行货值输入框`);
        }

        if (!batchFillResult.sharedStockFilled) {
            const stockOk = await fillSkuCellValue('col-skuStock', i, String(sku.stock));
            if (stockOk) {
                console.log(`      ✅ 库存: ${sku.stock}`);
            } else {
                await maybeDebugSkuFieldCandidates(page, 'stock-not-found');
                console.log(`      ⚠️  未找到第 ${i + 1} 行库存输入框`);
            }
        }
    }
}

async function ensureSkuSectionVisible(page: Page): Promise<void> {
    const waitForSkuSectionSignal = async (timeout: number): Promise<boolean> => {
        const signalLocators = [
            page.locator('.posting-feild-color-item .ait-select').first(),
            page.locator('text=光线颜色').first(),
            page.locator('text=零售价(CNY), text=商家仓库存, input[name="skuStock"]').first(),
        ];

        try {
            await Promise.any(
                signalLocators.map((locator) => locator.waitFor({ state: 'visible', timeout })),
            );
            return true;
        } catch {
            return false;
        }
    };

    const colorSelectReady = await page.locator('.posting-feild-color-item .ait-select').first()
        .isVisible({ timeout: 600 })
        .catch(() => false);
    if (colorSelectReady) {
        return;
    }

    const skuTab = page
        .locator('button, [role="tab"], [role="button"], span, div')
        .filter({ hasText: /SKU价格与库存|SKU Price & Inventory/i })
        .first();
    if (await skuTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await skuTab.click().catch(() => { });
        const skuReadyAfterTab = await waitForSkuSectionSignal(1800);
        // 切 tab 后先回到该 tab 顶部，再向下找销售属性
        const scroller = getMainScrollContainer(page);
        if (await scroller.count().catch(() => 0) > 0) {
            await scroller.evaluate((el) => {
                (el as HTMLElement).scrollTop = 0;
            }).catch(() => { });
        }
        if (!skuReadyAfterTab) {
            await page.waitForTimeout(240);
        }
    }

    const salesNav = page.locator('text=销售属性').first();
    if (await salesNav.isVisible({ timeout: 800 }).catch(() => false)) {
        await salesNav.click().catch(() => { });
        await page.waitForTimeout(1000);
    }

    for (let i = 0; i < 24; i++) {
        const lightVisible = await page.locator('text=光线颜色').first().isVisible({ timeout: 400 }).catch(() => false);
        const colorSelectVisible = await page.locator('.posting-feild-color-item .ait-select').first()
            .isVisible({ timeout: 400 })
            .catch(() => false);
        const gridVisible = await page.locator('text=零售价(CNY), text=商家仓库存, input[name="skuStock"]').first()
            .isVisible({ timeout: 300 })
            .catch(() => false);
        if (lightVisible || colorSelectVisible || gridVisible) {
            return;
        }
        await scrollMainContent(page, 900, { allowWheelFallback: false });
        await page.waitForTimeout(400);
    }
}

async function getSkuSharedFieldScope(page: Page): Promise<Locator> {
    const explicitPanel = page.locator('#sku-panel').first();
    if (await explicitPanel.isVisible({ timeout: 120 }).catch(() => false)) {
        return explicitPanel;
    }

    const anchorCandidates = [
        page.locator('td.sell-sku-cell.col-skuPrice').first(),
        page.locator('.sell-sku-head-cell.col-skuPrice').first(),
        page.locator('.posting-feild-color-item').first(),
    ];

    for (const anchor of anchorCandidates) {
        if (!await anchor.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const ancestors = anchor.locator('xpath=ancestor::*[self::section or self::div or self::article or self::form]');
        const total = await ancestors.count().catch(() => 0);
        for (let offset = 1; offset <= Math.min(total, 10); offset++) {
            const candidate = ancestors.nth(total - offset);
            if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;

            const hasSkuMarkers = await candidate.locator(
                '.posting-feild-color-item, td.sell-sku-cell.col-skuPrice, .sell-sku-head-cell.col-skuPrice, button:has-text("批量填充"), [role="button"]:has-text("批量填充")'
            ).count().catch(() => 0);
            if (hasSkuMarkers === 0) continue;

            const sharedInputCount = await candidate.locator(
                'input[placeholder="重量"], input[placeholder*="Weight"], input[placeholder="长"], input[placeholder*="长"], input[placeholder="宽"], input[placeholder*="宽"], input[placeholder="高"], input[placeholder*="高"]'
            ).count().catch(() => 0);
            if (sharedInputCount > 0) {
                return candidate;
            }
        }
    }

    return page.locator('body');
}

function getSkuNameInputs(page: Page): Locator {
    return page.locator(
        '.sale-item-container input[placeholder*="自定义名称"], .posting-feild-color-item input[placeholder*="自定义名称"], .sale-item-container input[placeholder*="Custom"]'
    );
}

function getSkuRowFromNameInput(nameInput: Locator): Locator {
    // 真实 DOM: 自定义名称输入框和主色系下拉同处 posting-feild-color-item
    const primary = nameInput.locator('xpath=ancestor::div[contains(@class,"posting-feild-color-item")][1]');
    const fallback = nameInput.locator('xpath=ancestor::div[contains(@class,"item")][1]');
    return primary.or(fallback).first();
}

async function selectUniqueLightColorForRow(
    page: Page,
    row: Locator,
    rowIndex: number,
    usedColors: Set<string>,
): Promise<string | null> {
    const colorSelect = row.locator('.ait-select').first();
    const comboInput = row.locator('input[role="combobox"]').first();
    if (!await colorSelect.isVisible({ timeout: 1200 }).catch(() => false)) {
        console.log('      ↪️  主色系下拉控件不可见');
        return null;
    }

    // 稳定策略：打开下拉后用键盘按“从上到下”的顺序选项
    await colorSelect.click().catch(() => { });
    await page.waitForTimeout(140);

    if (!await comboInput.isVisible({ timeout: 1200 }).catch(() => false)) {
        console.log('      ↪️  主色系 combobox 不可见');
        return null;
    }

    await comboInput.click().catch(() => { });
    await page.waitForTimeout(200);

    const targetIndex = rowIndex;
    for (let i = 0; i < targetIndex; i++) {
        await comboInput.press('ArrowDown').catch(() => { });
        await page.waitForTimeout(100);
    }
    await comboInput.press('Enter').catch(() => { });
    await page.waitForTimeout(180);

    const selectedText = ((await row.locator('.ait-select-selection-item').first().textContent().catch(() => ''))
        || (await row.locator('.color-value').first().textContent().catch(() => ''))
        || '')
        .replace(/\s+/g, ' ')
        .trim();

    if (selectedText && selectedText !== '选择主色系') {
        usedColors.add(selectedText);
        return selectedText;
    }

    // 回退：DOM 选项点击（仅在键盘选择失败时）
    const dropdown = page.locator('.ait-select-dropdown:visible').last();
    const options = dropdown.locator('.ait-select-item-option:visible');
    const count = await options.count().catch(() => 0);
    if (count === 0) {
        console.log('      ↪️  下拉无可见选项');
        return null;
    }
    const fallback = options.nth(Math.min(rowIndex, count - 1));
    const text = ((await fallback.locator('.color-value').first().textContent().catch(() => ''))
        || (await fallback.getAttribute('label').catch(() => ''))
        || (await fallback.textContent().catch(() => ''))
        || '')
        .replace(/\s+/g, ' ')
        .trim();
    await fallback.click().catch(() => { });
    await page.waitForTimeout(400);
    if (text) {
        usedColors.add(text);
        return text;
    }
    return null;
}

export async function fillSKUImages(
    page: Page,
    data: ProductData,
    options: SkuImageFillOptions = {},
): Promise<void> {
    console.log('\n🏷️  SKU 图片...');
    if (!data.skus || data.skus.length === 0) return;
    await options.onProgress?.({
        action: 'fill_sku_images_running',
        field: 'SKU 图片',
        details: '开始 SKU 图片流程',
    });

    // 若刚跑完 fillSKUs，避免再次触发 tab 切换造成焦点漂移
    if (skuRuntimeState.size === 0) {
        await ensureSkuSectionVisible(page);
    }

    const selectImage = async (uploadBtn: Locator, imgPath: ImageLibraryPath): Promise<boolean> => {
        if (options.selectImageFromLibraryFn) {
            return options.selectImageFromLibraryFn(page, uploadBtn, imgPath);
        }
        return selectImageFromLibrary(page, uploadBtn, imgPath, {
            onProgress: options.onProgress,
        });
    };

    const locateSkuUploadButton = async (index: number): Promise<{ uploadBtn: Locator | null; hasSelectedColor: boolean; }> => {
        const nameInputs = getSkuNameInputs(page);
        const rowCount = await nameInputs.count().catch(() => 0);
        if (index >= rowCount) {
            return { uploadBtn: null, hasSelectedColor: false };
        }

        const rowInput = nameInputs.nth(index);
        await rowInput.scrollIntoViewIfNeeded().catch(() => { });
        await randomDelay(200, 500);
        const row = getSkuRowFromNameInput(rowInput);
        const rowUploadCandidates = row.locator('span:has-text("图片上传"), span:has-text("上传图片")');
        let uploadBtn = await pickNthVisible(rowUploadCandidates, 0);

        const selectedColor = ((await row.locator('.ait-select-selection-item').first().textContent().catch(() => ''))
            || (await row.locator('.color-value').first().textContent().catch(() => ''))
            || '')
            .replace(/\s+/g, ' ')
            .trim();
        const state = skuRuntimeState.get(index);
        const hasSelectedColor = (state?.colorSelected ?? false) || (!!selectedColor && selectedColor !== '选择主色系');

        if (!uploadBtn) {
            const globalUploadCandidates = page.locator('span:has-text("图片上传"), span:has-text("上传图片")')
                .or(page.getByText('图片上传', { exact: true }))
                .or(page.getByText('上传图片', { exact: true }));
            uploadBtn = await pickNthVisible(globalUploadCandidates, index);
            if (!uploadBtn) {
                uploadBtn = await pickNthVisible(globalUploadCandidates, 0);
            }
        }

        return { uploadBtn, hasSelectedColor };
    };

    const uploadSkuImageWithRecovery = async (index: number, sku: SKU, imgPath: ImageLibraryPath, attempts: number): Promise<boolean> => {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const { uploadBtn, hasSelectedColor } = await locateSkuUploadButton(index);
            if (!uploadBtn || !await uploadBtn.isVisible({ timeout: 1800 }).catch(() => false)) {
                if (!hasSelectedColor) {
                    console.log(`      ⚠️  SKU ${index + 1} 未检测到已选主色系，图片上传入口不会出现`);
                    return false;
                }
                console.log(`      ⚠️  未找到 SKU ${index + 1} 的图片上传按钮`);
                return false;
            }

            const ok = await selectImage(uploadBtn, imgPath);
            if (ok) return true;

            if (attempt < attempts) {
                console.log(`      ↪️  图库流程中断，重新打开图库重试 (${attempt + 1}/${attempts})`);
                await page.waitForTimeout(350);
            }
        }
        return false;
    };

    const deferredRetries: Array<{ index: number; sku: SKU; imgPath: ImageLibraryPath }> = [];

    for (let i = 0; i < data.skus.length; i++) {
        const sku = data.skus[i];
        if (!sku.image) continue;

        const imgPath = parseImageLibraryPath(sku.image);
        if (!imgPath) continue;

        console.log(`   📷 SKU ${i + 1}: ${sku.name}`);
        const immediateOk = await uploadSkuImageWithRecovery(i, sku, imgPath, 2);
        if (!immediateOk) {
            console.log(`      ↪️  先继续后续 SKU，模块末尾再单独回补 SKU ${i + 1}`);
            deferredRetries.push({ index: i, sku, imgPath });
        }
    }

    if (deferredRetries.length > 0) {
        console.log(`   ↪️  SKU 图片待回补 ${deferredRetries.length} 项，模块结束前重试一次...`);
        for (const item of deferredRetries) {
            console.log(`   🔁 回补 SKU ${item.index + 1}: ${item.sku.name}`);
            const ok = await uploadSkuImageWithRecovery(item.index, item.sku, item.imgPath, 1);
            if (!ok) {
                console.log(`      ⚠️  SKU ${item.index + 1} 图片仍未完成，请人工单独处理`);
            }
        }
    }
}

// ============================================================
// 模块 1b: 标题 🟢
// ============================================================

export async function fillTitle(page: Page, data: ProductData): Promise<void> {
    console.log('\n📝 模块 1b: 填写标题...');
    const targetTitle = resolveListingTitle(data);
    if (!targetTitle) {
        console.log('   ⏭️  标题为空，跳过');
        return;
    }

    const titleCandidates = [
        page.locator('input[placeholder="请输入标题"]').first(),
        page.locator('input[placeholder*="标题"]').first(),
        page.locator('input[placeholder*="Title"], input[placeholder*="title"]').first(),
        page.locator('input[name="title"]').first(),
        page.locator('text=商品标题').locator('xpath=ancestor::div[1]//input').first(),
    ];

    let titleInput: Locator | null = null;
    for (let i = 0; i < 3 && !titleInput; i++) {
        for (const candidate of titleCandidates) {
            if (await candidate.isVisible({ timeout: 1200 }).catch(() => false)) {
                titleInput = candidate;
                break;
            }
        }
        if (!titleInput) {
            // 有些页面先展示空白骨架，向下微滚触发表单渲染
            await scrollMainContent(page, 500);
            await page.waitForTimeout(500);
        }
    }

    if (!titleInput) {
        throw new Error('未找到标题输入框（页面可能仍在加载或未进入发布表单）');
    }

    await titleInput.scrollIntoViewIfNeeded().catch(() => { });
    await titleInput.clear();
    await titleInput.fill(targetTitle);
    await randomDelay();

    console.log(`   ✅ 标题已填: "${targetTitle.substring(0, 50)}..."`);
}


// ============================================================
// 模块 2: 商品属性 🟡
// ============================================================

export async function fillAttributes(page: Page, data: ProductData): Promise<void> {
    console.log('\n🧩 模块 2: 商品属性...');
    const attrs = data.attributes;
    if (!attrs) {
        console.log('   ⏭️  无属性数据');
        return;
    }

    const basicTab = page.locator('text=基本信息, text=Basic Info').first();
    if (await basicTab.isVisible({ timeout: 1200 }).catch(() => false)) {
        await safeClick(basicTab, 1200);
        await page.waitForTimeout(260);
    }

    const headingCandidates = page.locator(
        'text=商品属性, text=关键属性, text=产品属性, text=属性信息, text=Product Attributes, text=Attributes'
    );
    let heading: Locator | null = null;
    for (let i = 0; i < 14; i++) {
        const candidate = await pickNthVisible(headingCandidates, 0);
        if (candidate && await candidate.isVisible({ timeout: 220 }).catch(() => false)) {
            heading = candidate;
            break;
        }

        const attrKeywordNode = await pickNthVisible(
            page.locator('label, span, div, p, th, td').filter({ hasText: /品牌|材质|电压|有害化学|Brand|Material|Voltage|Hazard/i }),
            0,
        );
        if (attrKeywordNode && await attrKeywordNode.isVisible({ timeout: 180 }).catch(() => false)) {
            heading = attrKeywordNode;
            break;
        }

        await scrollMainContent(page, 720);
        await page.waitForTimeout(240);
    }
    if (heading) {
        await heading.scrollIntoViewIfNeeded().catch(() => { });
        await page.waitForTimeout(220);
    } else {
        console.log('   ⚠️  未定位到属性区锚点（商品属性/关键属性），本轮转人工');
        return;
    }

    let scope: Locator = page.locator('body');
    if (heading) {
        const sectionCandidate = heading.locator(
            'xpath=ancestor::*[self::div or self::section][.//input or .//textarea or .//*[@role="combobox"] or .//*[contains(@class,"select")]][1]'
        );
        if (await sectionCandidate.isVisible({ timeout: 350 }).catch(() => false)) {
            scope = sectionCandidate;
        }
    }

    if (process.env.DEBUG_ATTRIBUTES === '1') {
        const probe = await page.evaluate(() => {
            const key = /(属性|品牌|材质|电压|有害|适配|车型|brand|material|voltage|hazard|fitment|origin)/i;
            const labels = Array.from(document.querySelectorAll('label, span, div, p, th, td'))
                .map((el) => ((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)))
                .filter((x) => x && key.test(x))
                .slice(0, 40);
            const placeholders = Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]'))
                .map((el) => ((((el as HTMLInputElement).placeholder || '') as string).replace(/\s+/g, ' ').trim().slice(0, 80)))
                .filter(Boolean)
                .slice(0, 40);
            const ariaLabels = Array.from(document.querySelectorAll('input[aria-label], textarea[aria-label], [role="combobox"][aria-label]'))
                .map((el) => ((el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80)))
                .filter(Boolean)
                .slice(0, 40);
            const comboboxCount = document.querySelectorAll('[role="combobox"], .ait-select, .next-select').length;
            return { labels, placeholders, ariaLabels, comboboxCount };
        }).then((x) => ({ ok: true as const, data: x })).catch((e) => ({ ok: false as const, error: String(e) }));
        if (probe) {
            if (!probe.ok) {
                console.log(`      🧭 属性探针执行失败: ${probe.error}`);
            } else {
                console.log(`      🧭 属性探针 combobox=${probe.data.comboboxCount}`);
                console.log(`      🧭 属性探针 labels=${probe.data.labels.join(' | ') || '(none)'}`);
                console.log(`      🧭 属性探针 placeholders=${probe.data.placeholders.join(' | ') || '(none)'}`);
                console.log(`      🧭 属性探针 aria=${probe.data.ariaLabels.join(' | ') || '(none)'}`);
            }
        }
        await screenshot(page, 'debug_attributes_probe').catch(() => { });
    }

    let hitCount = 0;
    let attemptedCount = 0;
    const unresolvedFields: string[] = [];
    const dedupeHints = (hints: Array<string | undefined>): string[] => dedupeNonEmpty(hints);
    const markFieldResult = (fieldName: string, ok: boolean): void => {
        if (ok) {
            hitCount++;
            console.log(`   ✅ 属性命中: ${fieldName}`);
            return;
        }
        unresolvedFields.push(fieldName);
        console.log(`   ↪️  属性未命中: ${fieldName}（转人工）`);
    };
    const fillTextAttr = async (fieldName: string, label: RegExp, value: string | undefined, fallbackSelectors: string[]): Promise<void> => {
        if (!value || !value.trim()) return;
        attemptedCount++;
        const ok = await fillBulkInputByLabel(page, scope, label, value.trim(), fallbackSelectors);
        markFieldResult(fieldName, ok);
    };
    const fillSelectAttr = async (fieldName: string, label: RegExp, value: string | undefined, fallbackSelectors: string[]): Promise<void> => {
        if (!value || !value.trim()) return;
        attemptedCount++;
        const ok = await selectBulkDropdownByLabel(page, scope, label, value.trim(), fallbackSelectors);
        markFieldResult(fieldName, ok);
    };
    const fillSelectAttrWithHints = async (
        fieldName: string,
        label: RegExp,
        value: string | undefined,
        optionHints: string[],
        fallbackSelectors: string[],
    ): Promise<void> => {
        if (!value || !value.trim()) return;
        attemptedCount++;
        const ok = await selectDropdownWithOptionHintsByLabel(page, scope, label, optionHints, fallbackSelectors);
        markFieldResult(fieldName, ok);
    };
    const fillAutocompleteAttrWithHints = async (
        fieldName: string,
        label: RegExp,
        queryText: string | undefined,
        optionHints: string[],
        fallbackSelectors: string[],
    ): Promise<void> => {
        const query = (queryText || '').trim();
        if (!query && optionHints.length === 0) return;
        attemptedCount++;
        const ok = await selectAutocompleteWithOptionHintsByLabel(
            page,
            scope,
            label,
            query || optionHints[0],
            optionHints,
            fallbackSelectors,
        );
        markFieldResult(fieldName, ok);
    };
    const fillHazardousChemicalAttr = async (fieldName: string, value: string | undefined): Promise<void> => {
        if (!value || !value.trim()) return;
        attemptedCount++;
        const hazardLabelNode = await pickMostSpecificLabelNode(scope, /高关注化学品|有害|危险化学|Hazardous/i);
        const hazardRowWithButton = hazardLabelNode
            ? await findNearestContainerWithSelector(hazardLabelNode, 'button, [role="button"]')
            : null;
        const hasSettingButton = hazardRowWithButton
            ? !!await pickNthVisible(
                hazardRowWithButton.locator('button, [role="button"]').filter({ hasText: /设置|Set/i }),
                0,
            )
            : false;

        const ok = hasSettingButton
            ? await selectHazardousChemicalByModal(page, scope, value)
            : await selectDropdownWithOptionHintsByLabel(page, scope, /高关注化学品|有害|危险化学|Hazardous/i, hazardHints, [
                '[aria-label*="有害"]',
                '[placeholder*="有害"]',
                '[placeholder*="Hazardous"]',
            ]);
        markFieldResult(fieldName, ok);
    };

    // 高置信字段：命中则填，未命中不阻塞
    const brandHints = dedupeHints([
        attrs.brand,
        attrs.brand === '无品牌' ? 'No Brand' : undefined,
        attrs.brand === '无品牌' ? 'NoBrand' : undefined,
        attrs.brand === '无品牌' ? 'NONE(NONE)' : undefined,
        attrs.brand === '无品牌' ? 'NONE' : undefined,
    ]);
    const originHints = dedupeHints([
        attrs.origin,
        attrs.origin === '中国' ? '中国大陆' : undefined,
        attrs.origin === '中国' ? 'China' : undefined,
        attrs.origin === '中国' ? 'CN' : undefined,
        attrs.origin === '中国' ? '中国大陆(Origin)(Mainland China)' : undefined,
        attrs.origin === '中国' ? 'Mainland China' : undefined,
    ]);
    const hazardHints = dedupeHints([
        attrs.hazardous_chemical,
        /^(否|no)$/i.test(attrs.hazardous_chemical || '') ? '不含高关注化学品' : undefined,
        /^(否|no)$/i.test(attrs.hazardous_chemical || '') ? 'No' : undefined,
        /^(否|no)$/i.test(attrs.hazardous_chemical || '') ? '无(None)' : undefined,
        /^(否|no)$/i.test(attrs.hazardous_chemical || '') ? '无' : undefined,
    ]);
    const productTypeHints = resolveProductTypeHints(data);
    const voltageHints = resolveVoltageHints(attrs.voltage);
    const accessoryPositionHints = resolveAccessoryPositionHints(attrs.accessory_position);

    await fillSelectAttrWithHints('品牌', /品牌|Brand/i, attrs.brand, brandHints, [
        '[aria-label*="品牌"]',
        '[placeholder*="品牌"]',
        '[placeholder*="Brand"]',
        '[class*="brand"] .ait-select',
    ]);
    await fillSelectAttrWithHints('产地', /产地|原产地|Origin/i, attrs.origin, originHints, [
        '[aria-label*="产地"]',
        '[placeholder*="产地"]',
        '[placeholder*="Origin"]',
    ]);
    await fillAutocompleteAttrWithHints('产品类型', /产品类型|Product\s*Type/i, attrs.product_type || productTypeHints[0], productTypeHints, [
        'input[aria-label*="产品类型"]',
        'input[placeholder*="产品类型"]',
        'input[placeholder*="从列表选择"]',
        'input[placeholder*="list"]',
    ]);
    await fillHazardousChemicalAttr('高关注化学品', attrs.hazardous_chemical);
    await fillTextAttr('材质', /材质|Material/i, attrs.material, [
        'input[aria-label*="材质"]',
        'input[placeholder*="材质"]',
        'input[placeholder*="Material"]',
        'textarea[placeholder*="Material"]',
    ]);
    await fillSelectAttrWithHints('电压', /电压|Voltage/i, attrs.voltage, voltageHints, [
        '[aria-label*="电压"]',
        '[placeholder*="电压"]',
        '[placeholder*="Voltage"]',
        '[class*="voltage"] .ait-select',
    ]);
    await fillSelectAttrWithHints('配件位置', /位置|安装位|Position/i, attrs.accessory_position, accessoryPositionHints, [
        '[aria-label*="位置"]',
        '[placeholder*="位置"]',
        '[placeholder*="Position"]',
        '[class*="position"] .ait-select',
    ]);

    const fitmentText = [attrs.fitment?.car_make, attrs.fitment?.car_model, attrs.fitment?.year]
        .filter(Boolean)
        .join(' ');
    await fillTextAttr('适用车型', /适用|适配|车型|Fitment|Model/i, fitmentText, [
        'input[aria-label*="适用"]',
        'input[placeholder*="适用"]',
        'input[placeholder*="车型"]',
        'input[placeholder*="Fitment"]',
    ]);

    const requiredHits = Math.min(5, attemptedCount);
    if (hitCount > 0) {
        console.log(`   ✅ 商品属性自动命中 ${hitCount} 项`);
    } else {
        console.log('   ⚠️  商品属性字段未命中（DOM 结构与预期不一致），转人工填写');
    }
    if (attemptedCount > 0 && hitCount < requiredHits) {
        console.log(`   ⚠️  模块2未达验收线: ${hitCount}/${attemptedCount}（要求 >= ${requiredHits}）`);
    }
    if (unresolvedFields.length > 0) {
        console.log(`   ↪️  模块2人工项: ${unresolvedFields.join(' / ')}`);
    }
    if (process.env.STRICT_MODULE2 === '1' && attemptedCount > 0 && hitCount < requiredHits) {
        throw new Error(`模块2验收失败: ${hitCount}/${attemptedCount} < ${requiredHits}`);
    }
}


// ============================================================
// 模块 3: 海关监管 🟢
// ============================================================

async function openComplianceTab(page: Page): Promise<void> {
    const interactiveTabCandidates = page
        .locator('[role="tab"], button, .next-tabs-tab, .ait-tabs-tab')
        .filter({ hasText: /合规信息|Compliance/i });
    const fallbackTabCandidates = page
        .locator('div, span')
        .filter({ hasText: /合规信息|Compliance/i });
    const tab =
        (await pickTopmostVisible(interactiveTabCandidates)) ??
        (await pickTopmostVisible(fallbackTabCandidates)) ??
        page.locator('text=合规信息, text=Compliance').first();
    if (await tab.isVisible({ timeout: 1200 }).catch(() => false)) {
        await safeClick(tab, 1800);
        await page.waitForTimeout(350);
    }
}

export async function fillCustoms(page: Page, data: ProductData): Promise<string | null> {
    console.log('\n🛃 模块 3: 海关监管...');
    let manualGateScreenshotPath: string | null = null;
    // 通常有默认值，只在需要时填写
    if (data.customs?.hs_code) {
        await openComplianceTab(page);

        const candidateLocators: Locator[] = [
            page.locator('input[placeholder*="海关"]').first(),
            page.locator('input[placeholder*="HS"]').first(),
            page.locator('textarea[placeholder*="海关"]').first(),
            page.locator('textarea[placeholder*="HS"]').first(),
            page.locator('xpath=//label[contains(normalize-space(.),"海关编码") or contains(normalize-space(.),"HS编码") or contains(normalize-space(.),"HS Code") or contains(normalize-space(.),"HS code")]/following::input[1]').first(),
            page.locator('xpath=//label[contains(normalize-space(.),"海关编码") or contains(normalize-space(.),"HS编码") or contains(normalize-space(.),"HS Code") or contains(normalize-space(.),"HS code")]/following::textarea[1]').first(),
            page.locator('xpath=//*[self::div or self::span or self::td or self::th][contains(normalize-space(.),"海关编码") or contains(normalize-space(.),"HS编码") or contains(normalize-space(.),"HS Code") or contains(normalize-space(.),"HS code")]/ancestor::*[self::div or self::td or self::tr][1]//*[self::input or self::textarea][1]').first(),
        ];

        let hsInput: Locator | null = null;
        for (const candidate of candidateLocators) {
            if (await candidate.isVisible({ timeout: 500 }).catch(() => false)) {
                hsInput = candidate;
                break;
            }
        }

        if (hsInput) {
            await hsInput.fill('');
            await hsInput.fill(data.customs.hs_code);
            console.log(`   ✅ 海关编码: ${data.customs.hs_code}`);
        } else {
            const manualGateSignal = page
                .locator('text=海关监管属性')
                .or(page.locator('text=资质信息'))
                .or(page.locator('text=关联欧盟责任人'))
                .first();
            const manualGateTriggered = await manualGateSignal
                .isVisible({ timeout: 600 })
                .catch(() => false);
            if (manualGateTriggered) {
                console.log('   ⚠️  当前合规信息页已切换为海关监管/资质流，模块 3 转人工处理');
                manualGateScreenshotPath = await screenshot(page, 'customs_manual_gate').catch(() => null);
            } else {
                console.log('   ⏭️  未找到海关编码输入框，可能已有默认值');
            }
        }
    } else {
        console.log('   ⏭️  使用默认值');
    }
    return manualGateScreenshotPath;
}


// ============================================================
// 模块 4: 价格与库存设置 🟢
// ============================================================

export async function fillPricingSettings(page: Page, data: ProductData): Promise<void> {
    console.log('\n💰 模块 4: 价格与库存设置...');
    const settings = data.pricing_settings;
    if (!settings) {
        console.log('   ⏭️  使用默认设置');
        return;
    }

    await resetSkuTabAnchor(page);
    const skuPanel = page.locator('#sku-panel');
    const scope = await skuPanel.isVisible({ timeout: 350 }).catch(() => false) ? skuPanel : page.locator('body');

    if (settings.min_unit) {
        const minUnitFilled = await selectDropdownWithOptionHintsByLabel(
            page,
            scope,
            /最小计量单元|计量单元/i,
            [settings.min_unit],
            [
                '[data-field="min_unit"]',
                '#min-unit',
                '[role="combobox"]',
                '.next-select',
            ],
        );
        if (minUnitFilled) {
            console.log(`   ✅ 最小计量单元: ${settings.min_unit}`);
        } else {
            console.log('   ⚠️  未找到计量单元选择器，跳过');
        }
    }

    if (settings.sell_by) {
        const sellByFilled = await selectDropdownWithOptionHintsByLabel(
            page,
            scope,
            /销售方式|出售方式/i,
            [settings.sell_by],
            [
                '[data-field="sell_by"]',
                '#sell-by',
                '[role="combobox"]',
                '.next-select',
            ],
        );
        if (sellByFilled) {
            console.log(`   ✅ 销售方式: ${settings.sell_by}`);
        } else {
            console.log('   ⚠️  未找到销售方式选择器，跳过');
        }
    }

    await randomDelay();
}


// ============================================================
// 模块 5 (部分): SKU 价格/库存/重量填写 🟡
// ============================================================

export async function fillSKUs(page: Page, data: ProductData, hooks?: Module5ProgressHooks): Promise<void> {
    console.log('\n🏷️  模块 5: SKU 变体...');
    if (!data.skus || data.skus.length === 0) {
        console.log('   ⏭️  SKU 列表为空，跳过');
        return;
    }

    resetSkuRuntimeState();
    await ensureSkuSectionVisible(page);
    const usedColors = new Set<string>();
    await hooks?.onProgress?.({
        action: 'fill_sku_variants',
        field: 'SKU 颜色 / 自定义名称',
        details: '填写 SKU 颜色与自定义名称',
    });

    for (let i = 0; i < data.skus.length; i++) {
        const sku = data.skus[i];
        console.log(`   📦 SKU ${i + 1}/${data.skus.length}: ${sku.name}`);

        let nameInputs = getSkuNameInputs(page);
        let rowCount = await nameInputs.count().catch(() => 0);
        if (i >= rowCount) {
            // 页面可能还在渲染，先滚动并重试几次
            for (let retry = 0; retry < 3 && i >= rowCount; retry++) {
                await scrollMainContent(page, 700, { allowWheelFallback: false });
                await randomDelay(300, 700);
                nameInputs = getSkuNameInputs(page);
                rowCount = await nameInputs.count().catch(() => 0);
            }
        }
        if (i >= rowCount) {
            console.log(`      ⚠️  第 ${i + 1} 行 SKU 输入区未出现，请人工新增颜色后继续`);
            continue;
        }

        const nameInput = nameInputs.nth(i);
        const row = getSkuRowFromNameInput(nameInput);
        const pickedColor = await selectUniqueLightColorForRow(page, row, i, usedColors);
        if (pickedColor) {
            patchSkuRuntimeState(i, { colorSelected: true, pickedColor });
            console.log(`      ✅ 光线颜色: ${pickedColor}`);
        } else {
            patchSkuRuntimeState(i, { colorSelected: false });
            console.log('      ⚠️  光线颜色选择失败，请人工选择');
        }

        // 填写 SKU 自定义名称
        try {
            const nameInputs = page.locator('input[placeholder*="自定义名称"], input[placeholder*="Custom"]');
            const nameInput = nameInputs.nth(i);
            const customName = resolveSkuCustomName(sku);
            if (!customName) {
                patchSkuRuntimeState(i, { customNameFilled: false });
                console.log('      ⚠️  SKU 名称为空，跳过自定义名称填写');
            } else if (await nameInput.isVisible({ timeout: 3000 })) {
                await nameInput.clear();
                await nameInput.fill(customName);
                patchSkuRuntimeState(i, { customNameFilled: true });
                console.log(`      ✅ 名称: ${customName}`);
            } else {
                patchSkuRuntimeState(i, { customNameFilled: false });
                console.log('      ⚠️  未找到名称输入框');
            }
        } catch {
            patchSkuRuntimeState(i, { customNameFilled: false });
            console.log('      ⚠️  未找到名称输入框');
        }

        await randomDelay();
    }

    // 统一交给 fillSkuGridValues / tryBatchFillForMultiSku 定位，避免双重滚动链路
    console.log('   ↪️  光线颜色完成，进入 SKU 数值填写流程...');

    // 二阶段：统一填写 SKU 数值表格（零售价/货值/库存）
    await fillSkuGridValues(page, data, hooks);

    // 填写重量和尺寸 (所有 SKU 共用)
    await hooks?.onProgress?.({
        action: 'fill_sku_shared_fields',
        field: 'SKU 重量 / 尺寸',
        details: '填写 SKU 共用重量与尺寸',
    });
    const skuSharedFieldScope = await getSkuSharedFieldScope(page);
    if (data.weight_kg > 0) {
        try {
            const weightInput = skuSharedFieldScope
                .locator('input[placeholder*="重量"], input[placeholder*="Weight"]')
                .first();
            if (await weightInput.isVisible({ timeout: 3000 })) {
                await weightInput.clear();
                await weightInput.fill(String(data.weight_kg));
                console.log(`   ✅ 重量: ${data.weight_kg}kg`);
            }
        } catch {
            console.log('   ⚠️  未找到重量输入框');
        }
    }

    // 包装尺寸
    const dims = data.package_dimensions;
    if (dims && (dims.length_cm > 0 || dims.width_cm > 0 || dims.height_cm > 0)) {
        const dimLabels = ['长', '宽', '高'];
        const dimValues = [dims.length_cm, dims.width_cm, dims.height_cm];
        for (let d = 0; d < 3; d++) {
            if (dimValues[d] > 0) {
                try {
                    const dimInput = skuSharedFieldScope.locator(`input[placeholder*="${dimLabels[d]}"]`).first();
                    if (await dimInput.isVisible({ timeout: 2000 })) {
                        await dimInput.clear();
                        await dimInput.fill(String(dimValues[d]));
                    }
                } catch {
                    // 尝试按顺序定位
                }
            }
        }
        console.log(`   ✅ 尺寸: ${dims.length_cm}×${dims.width_cm}×${dims.height_cm}cm`);
    }

    // 批发设置
    if (data.wholesale) {
        console.log(`   📦 批发: ${data.wholesale.min_quantity}件起, ${data.wholesale.discount_percent}%折扣`);
        // TODO: 定位批发设置区域
    }
}


// ============================================================
// 模块 6a: 买家须知 🟢
// ============================================================

export async function fillBuyersNote(page: Page, data: ProductData): Promise<void> {
    console.log('\n📋 模块 6a: 买家须知...');

    const templatePath = data.buyers_note_template;
    if (!templatePath || templatePath === '') {
        console.log('   ⏭️  无买家须知模板');
        return;
    }

    // 读取 HTML 模板
    const repoRoot = path.resolve(__dirname, '..');
    const legacyRoot = path.resolve(repoRoot, '..');
    const candidatePaths = path.isAbsolute(templatePath)
        ? [templatePath]
        : [
            path.resolve(repoRoot, templatePath),
            path.resolve(legacyRoot, templatePath),
            path.resolve(process.cwd(), templatePath),
        ];
    const fullPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath))
        || candidatePaths[0];
    if (!fs.existsSync(fullPath)) {
        console.log(`   ⚠️  模板文件不存在: ${fullPath}`);
        return;
    }

    let html = fs.readFileSync(fullPath, 'utf-8');

    // 如果有额外补充内容，追加到 HTML 末尾
    if (data.buyers_note_extra) {
        html += `\n<p><br/></p><p><strong>补充说明:</strong></p><p>${data.buyers_note_extra}</p>`;
    }

    // 查找买家须知的编辑器
    // AliExpress 通常使用富文本编辑器，需要切换到源码模式粘贴 HTML
    try {
        // 尝试找到源码/HTML编辑按钮
        const sourceBtn = page.locator('button:has-text("源码"), button:has-text("HTML"), [title*="源码"]');
        if (await sourceBtn.isVisible({ timeout: 5000 })) {
            await sourceBtn.click();
            await randomDelay(500, 1000);

            // 找到源码编辑区域并粘贴
            const sourceArea = page.locator('textarea, .source-editor, [contenteditable]');
            if (await sourceArea.isVisible({ timeout: 3000 })) {
                await sourceArea.fill(html);
                await sourceArea.evaluate((el: HTMLElement | HTMLTextAreaElement) => {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof (el as HTMLElement).blur === 'function') {
                        (el as HTMLElement).blur();
                    }
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                }).catch(() => { });
                console.log('   ✅ 买家须知 HTML 已粘贴 (源码模式)');

                // 切回预览模式
                await sourceBtn.click();
                await randomDelay();
            }
        } else {
            // 如果没有源码按钮，尝试直接注入 HTML
            console.log('   → 未找到源码按钮，尝试直接注入 HTML...');
            const editor = page.locator('[contenteditable="true"]').first();
            if (await editor.isVisible({ timeout: 5000 })) {
                await editor.evaluate((el: HTMLElement, htmlContent: string) => {
                    if (typeof el.focus === 'function') {
                        el.focus();
                    }
                    el.innerHTML = htmlContent;
                    // 触发 input 事件让框架感知变化
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof el.blur === 'function') {
                        el.blur();
                    }
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                }, html);
                console.log('   ✅ 买家须知 HTML 已注入');
            } else {
                console.log('   ⚠️  未找到编辑器');
            }
        }
    } catch (e) {
        console.log(`   ⚠️  买家须知填写失败: ${e}`);
    }
}

export async function fillDetailImages(
    page: Page,
    data: ProductData,
    options: DetailImageFillOptions = {},
): Promise<ModuleExecutionResult> {
    console.log('\n🖼️  模块 6b: 详情图...');

    if (!data.detail_images || data.detail_images.length === 0) {
        console.log('   ⏭️  无详情图数据');
        return autoModuleExecutionResult('detail_images_skipped_empty');
    }

    const resolvedPaths = resolveDetailImageLibraryPaths(data);
    if (resolvedPaths.length === 0) {
        console.log('   ⚠️  详情图路径无法推导，转人工上传');
        const manualGateScreenshotPath = await screenshot(page, 'detail_images_manual_gate').catch(() => null);
        return manualGateModuleExecutionResult('detail_images_manual_gate', [manualGateScreenshotPath]);
    }

    if (resolvedPaths.length < data.detail_images.filter(Boolean).length) {
        console.log(`   ⚠️  仅解析出 ${resolvedPaths.length}/${data.detail_images.filter(Boolean).length} 张详情图，未解析部分转人工`);
    }

    const selectImage = options.selectImageFromLibraryFn ?? selectImageFromLibrary;
    const failedImages: string[] = [];

    for (const imagePath of resolvedPaths) {
        const uploadBtn = await locateDetailImageUploadButton(page);
        if (!uploadBtn) {
            console.log('   ⚠️  未找到详情图区上传入口，剩余详情图转人工');
            failedImages.push(imagePath.filename, ...resolvedPaths.slice(resolvedPaths.indexOf(imagePath) + 1).map((item) => item.filename));
            break;
        }

        let ok = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
            ok = await selectImage(page, uploadBtn, imagePath);
            if (ok) break;
            if (attempt < 2) {
                console.log(`      ↪️  详情图上传中断，重新打开图库重试 (${attempt + 1}/2)`);
                await randomDelay(300, 700);
            }
        }

        if (ok) {
            console.log(`      ✅ 详情图: ${imagePath.filename}`);
        } else {
            failedImages.push(imagePath.filename);
            console.log(`      ⚠️  详情图失败，转人工: ${imagePath.filename}`);
        }
    }

    if (failedImages.length > 0) {
        console.log(`   👤 人工补充详情图: ${failedImages.join(', ')}`);
        const manualGateScreenshotPath = await screenshot(page, 'detail_images_manual_gate').catch(() => null);
        return manualGateModuleExecutionResult('detail_images_manual_gate', [manualGateScreenshotPath]);
    } else {
        console.log(`   ✅ 详情图完成: ${resolvedPaths.length} 张`);
        return autoModuleExecutionResult('detail_images_done');
    }
}

export async function fillAppDescriptionManualGate(page: Page, data: ProductData): Promise<string | null> {
    console.log('\n🧾 模块 6c: APP 详情描述...');
    if (!(data.app_description || '').trim()) {
        console.log('   ⏭️  无 APP 描述数据');
        return null;
    }

    console.log('   ⚠️  当前策略 = 人工步骤。请手动进入 APP 详情描述编辑器，粘贴/调整描述内容。');
    return await screenshot(page, 'app_description_manual_gate').catch(() => null);
}


// ============================================================
// 模块 7: 包装与物流 🟢
// ============================================================

async function waitForShippingSectionSignal(page: Page, timeout: number): Promise<boolean> {
    return await page.waitForFunction(() => {
        const candidates = Array.from(document.querySelectorAll(
            '#module7 input[placeholder], #module7 textarea[placeholder], input[placeholder], textarea[placeholder]'
        )) as Array<HTMLInputElement | HTMLTextAreaElement>;

        return candidates.some((node) => {
            const placeholder = (node.getAttribute('placeholder') || '').trim();
            if (!/^(重量|长|宽|高|长\(cm\)|宽\(cm\)|高\(cm\)|weight|length|width|height)$/i.test(placeholder)) {
                return false;
            }

            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return rect.width > 0
                && rect.height > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden';
        });
    }, { timeout }).then(() => true).catch(() => false);
}

async function openShippingTab(page: Page): Promise<void> {
    const tabCandidates = page
        .locator('[role="tab"], .next-tabs-tab, .ait-tabs-tab, .tab')
        .filter({ hasText: /包装与物流|Packaging/i });
    const tab = (await pickNthVisible(tabCandidates, 0)) ?? page.locator('text=包装与物流, text=Packaging').first();
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await safeClick(tab, 1800);
        const shippingReadyAfterTab = await waitForShippingSectionSignal(page, 400);
        if (!shippingReadyAfterTab) {
            await page.waitForTimeout(180);
        }
    }
}

async function locateShippingSectionScope(page: Page): Promise<Locator> {
    const lengthCmInput = await pickNthVisible(
        page.locator('input[placeholder="长(cm)"], input[placeholder*="长(cm)"], input[placeholder="Length(cm)"], input[placeholder*="Length(cm)"]'),
        0,
    );
    if (lengthCmInput && await lengthCmInput.isVisible({ timeout: 120 }).catch(() => false)) {
        const ancestors = lengthCmInput.locator('xpath=ancestor-or-self::*[self::section or self::div or self::form or self::article]');
        const ancestorCount = await ancestors.count().catch(() => 0);
        let dimOnlyFallback: Locator | null = null;
        for (let offset = 1; offset <= Math.min(ancestorCount, 10); offset++) {
            const index = ancestorCount - offset;
            const ancestor = ancestors.nth(index);
            if (!await ancestor.isVisible({ timeout: 120 }).catch(() => false)) continue;

            const dimCount = await ancestor
                .locator('input[placeholder="长(cm)"], input[placeholder*="长(cm)"], input[placeholder="宽(cm)"], input[placeholder*="宽(cm)"], input[placeholder="高(cm)"], input[placeholder*="高(cm)"]')
                .count()
                .catch(() => 0);
            if (dimCount < 3) continue;

            const inputCount = await ancestor.locator('input:not([type="hidden"]), textarea').count().catch(() => 0);
            const text = ((await ancestor.textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
            if (inputCount >= 4 || /总重量|重量|weight/i.test(text)) {
                return ancestor;
            }
            if (!dimOnlyFallback) {
                dimOnlyFallback = ancestor;
            }
        }

        if (dimOnlyFallback) {
            return dimOnlyFallback;
        }
    }

    const headingCandidates = page
        .locator('h1, h2, h3, h4, h5, div, span, p, label, a, button')
        .filter({ hasText: /包装与物流|Packaging/i });

    const total = await headingCandidates.count().catch(() => 0);
    let heading: Locator | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < total; i++) {
        const candidate = headingCandidates.nth(i);
        if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!text || !/包装与物流|Packaging/i.test(text)) continue;
        const exactBonus = /^(包装与物流|Packaging)$/i.test(text) ? -100 : 0;
        const rect = await candidate.boundingBox().catch(() => null);
        const areaPenalty = rect ? Math.min(5000, (rect.width * rect.height) / 500) : 0;
        const score = text.length + areaPenalty + exactBonus;
        if (score < bestScore) {
            heading = candidate;
            bestScore = score;
        }
    }
    if (!heading) {
        return page.locator('body');
    }

    await heading.scrollIntoViewIfNeeded().catch(() => { });

    const ancestors = heading.locator('xpath=ancestor-or-self::*[self::section or self::div or self::form or self::article]');
    const ancestorCount = await ancestors.count().catch(() => 0);
    let fallback: Locator | null = null;

    for (let offset = 1; offset <= Math.min(ancestorCount, 10); offset++) {
        const index = ancestorCount - offset;
        const ancestor = ancestors.nth(index);
        if (!await ancestor.isVisible({ timeout: 120 }).catch(() => false)) continue;

        const inputCount = await ancestor.locator('input:not([type="hidden"]), textarea').count().catch(() => 0);
        if (inputCount < 3) continue;

        const text = ((await ancestor.textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
        if (/(重量|长|宽|高|尺寸|运费模板|物流)/i.test(text)) {
            return ancestor;
        }

        if (!fallback) {
            fallback = ancestor;
        }
    }

    return fallback ?? page.locator('body');
}

async function debugShippingProbe(page: Page, scope: Locator, phase: 'before' | 'after'): Promise<void> {
    if (process.env.DEBUG_SHIPPING !== '1') return;

    const globalPlaceholders = await page.locator('input:not([type="hidden"])').evaluateAll((els) =>
        els
            .map((el) => (el.getAttribute('placeholder') || '').trim())
            .filter(Boolean)
            .slice(0, 40)
    ).catch(() => []);

    const scopedInputs = await scope.locator('input:not([type="hidden"]), textarea').evaluateAll((els) =>
        els.map((el) => ({
            placeholder: (el.getAttribute('placeholder') || '').trim(),
            aria: (el.getAttribute('aria-label') || '').trim(),
            value: ((el as HTMLInputElement).value || '').trim(),
        }))
    ).catch(() => []);

    const visibleRelevantInputs = await page.locator('input:not([type="hidden"])').evaluateAll((els) =>
        els
            .filter((el) => {
                const rect = (el as HTMLElement).getBoundingClientRect();
                const style = window.getComputedStyle(el as HTMLElement);
                const placeholder = (el.getAttribute('placeholder') || '').trim();
                return rect.width > 0
                    && rect.height > 0
                    && style.visibility !== 'hidden'
                    && style.display !== 'none'
                    && /^(重量|长|宽|高|长\(cm\)|宽\(cm\)|高\(cm\))$/i.test(placeholder);
            })
            .map((el) => ({
                placeholder: (el.getAttribute('placeholder') || '').trim(),
                value: ((el as HTMLInputElement).value || '').trim(),
                top: Math.round((el as HTMLElement).getBoundingClientRect().top),
                left: Math.round((el as HTMLElement).getBoundingClientRect().left),
            }))
    ).catch(() => []);

    console.log(`   🧭 物流探针(${phase}) global_placeholders=${globalPlaceholders.join(' | ') || '(none)'}`);
    console.log(`   🧭 物流探针(${phase}) scoped_inputs=${JSON.stringify(scopedInputs)}`);
    console.log(`   🧭 物流探针(${phase}) visible_relevant=${JSON.stringify(visibleRelevantInputs)}`);
    await screenshot(page, `debug_shipping_probe_${phase}`).catch(() => { });
}

export async function fillShipping(page: Page, data: ProductData): Promise<void> {
    console.log('\n📦 模块 7: 包装与物流...');
    const shipping = data.shipping;
    if (!shipping) {
        console.log('   ⏭️  无物流数据');
        return;
    }

    await openShippingTab(page);

    // 滚动到物流模块
    const shippingSection = page.locator('text=包装与物流').or(page.locator('text=Packaging'));
    if (await shippingSection.isVisible({ timeout: 5000 }).catch(() => false)) {
        await shippingSection.scrollIntoViewIfNeeded();
    }

    const shippingScope = await locateShippingSectionScope(page);
    await debugShippingProbe(page, shippingScope, 'before');

    // 填写总重量
    if (shipping.total_weight_kg > 0) {
        try {
            const weightFilled = await fillBulkInputByLabel(
                page,
                shippingScope,
                /总重量|重量|weight/i,
                String(shipping.total_weight_kg),
                [
                    'input[placeholder="重量"]',
                    'input[placeholder*="重量"]',
                    'input[aria-label*="重量"]',
                    'input[placeholder*="weight"]',
                    'input[placeholder*="Weight"]',
                ],
            );
            if (weightFilled) {
                console.log(`   ✅ 总重量: ${shipping.total_weight_kg}kg`);
            } else {
                console.log('   ⚠️  未找到物流重量输入框');
            }
        } catch {
            console.log('   ⚠️  未找到物流重量输入框');
        }
    }

    // 填写总尺寸
    const dims = shipping.total_dimensions;
    if (dims && (dims.length_cm > 0 || dims.width_cm > 0 || dims.height_cm > 0)) {
        console.log(`   📐 尺寸: ${dims.length_cm}×${dims.width_cm}×${dims.height_cm}cm`);
        const lengthValue = String(dims.length_cm);
        const widthValue = String(dims.width_cm);
        const heightValue = String(dims.height_cm);

        const lengthFilled = dims.length_cm > 0
            ? await fillBulkInputByLabel(
                page,
                shippingScope,
                /(^|\s)长($|\s)|length/i,
                lengthValue,
                [
                    'input[placeholder="长(cm)"]',
                    'input[placeholder*="长(cm)"]',
                    'input[placeholder="长"]',
                    'input[placeholder*="长"]',
                    'input[aria-label*="长"]',
                    'input[placeholder*="length"]',
                    'input[placeholder*="Length"]',
                ],
            )
            : true;
        const widthFilled = dims.width_cm > 0
            ? await fillBulkInputByLabel(
                page,
                shippingScope,
                /(^|\s)宽($|\s)|width/i,
                widthValue,
                [
                    'input[placeholder="宽(cm)"]',
                    'input[placeholder*="宽(cm)"]',
                    'input[placeholder="宽"]',
                    'input[placeholder*="宽"]',
                    'input[aria-label*="宽"]',
                    'input[placeholder*="width"]',
                    'input[placeholder*="Width"]',
                ],
            )
            : true;
        const heightFilled = dims.height_cm > 0
            ? await fillBulkInputByLabel(
                page,
                shippingScope,
                /(^|\s)高($|\s)|height/i,
                heightValue,
                [
                    'input[placeholder="高(cm)"]',
                    'input[placeholder*="高(cm)"]',
                    'input[placeholder="高"]',
                    'input[placeholder*="高"]',
                    'input[aria-label*="高"]',
                    'input[placeholder*="height"]',
                    'input[placeholder*="Height"]',
                ],
            )
            : true;

        if (lengthFilled && widthFilled && heightFilled) {
            console.log('   ✅ 物流尺寸已填写');
        } else {
            console.log('   ⚠️  物流尺寸未完全命中');
        }
    }

    await debugShippingProbe(page, shippingScope, 'after');

    // 选择运费模板
    if (shipping.shipping_template) {
        try {
            const templateSelector = shippingScope.locator('text=运费模板').locator('..').locator('.next-select, [role="combobox"]');
            if (await templateSelector.isVisible({ timeout: 3000 })) {
                await templateSelector.click();
                await randomDelay(300, 600);
                await page.locator(`[role="option"]:has-text("${shipping.shipping_template}")`).click();
                console.log(`   ✅ 运费模板: ${shipping.shipping_template}`);
            }
        } catch {
            console.log('   ⚠️  未找到运费模板选择器');
        }
    }

}


// ============================================================
// 模块 8: 其它设置 🟢
// ============================================================

async function openOtherSettingsTab(page: Page): Promise<void> {
    const tabCandidates = page
        .locator('[role="tab"], .next-tabs-tab, .ait-tabs-tab, .tab')
        .filter({ hasText: /其它设置|Other Settings/i });
    const tab = (await pickNthVisible(tabCandidates, 0)) ?? page.locator('text=其它设置, text=Other Settings').first();
    if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await safeClick(tab, 1800);
        await page.waitForTimeout(350);
    }
}

async function locateAssociationRow(page: Page, labelPattern: RegExp): Promise<Locator | null> {
    const labelNode = await pickNthVisible(
        page.locator('label, span, div, p, strong').filter({ hasText: labelPattern }),
        0,
    );
    if (labelNode) {
        const row = labelNode.locator(
            'xpath=ancestor::*[self::div or self::section or self::li][.//a[contains(normalize-space(.),"管理")] or .//*[@role="combobox"] or .//*[contains(@class,"select")]][1]'
        );
        if (await row.isVisible({ timeout: 500 }).catch(() => false)) {
            return row;
        }
    }

    const fallbackRows = page
        .locator('div, section, li')
        .filter({ hasText: labelPattern })
        .filter({ has: page.locator('a:has-text("管理"), [role="combobox"], .ait-select, .next-select') });
    return await pickNthVisible(fallbackRows, 0);
}

async function isAssociationLinked(row: Locator): Promise<boolean> {
    const rowText = ((await row.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (/已关联|linked/i.test(rowText) && !/未关联|not linked/i.test(rowText)) {
        return true;
    }

    const placeholder = row.locator(
        '.ait-select-selection-placeholder, .next-select-placeholder, input[placeholder*="请选择"], input[placeholder*="Select"]'
    ).first();
    if (await placeholder.isVisible({ timeout: 250 }).catch(() => false)) {
        return false;
    }

    const selection = row.locator(
        '.ait-select-selection-item, .next-select-value, .next-select-inner, [role="combobox"]'
    ).first();
    const selectedText = ((await selection.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (selectedText && !/请选择|Please select|Select/i.test(selectedText)) {
        return true;
    }

    return false;
}

async function clickManageLinkInRow(page: Page, row: Locator, labels: string[]): Promise<boolean> {
    for (const label of labels) {
        const local = row.locator(
            `a:has-text("${label}"), button:has-text("${label}"), [role="button"]:has-text("${label}")`
        ).first();
        if (await local.isVisible({ timeout: 350 }).catch(() => false)) {
            if (await safeClick(local, 1800)) return true;
        }
    }

    for (const label of labels) {
        const global = page.locator(
            `a:has-text("${label}"), button:has-text("${label}"), [role="button"]:has-text("${label}")`
        ).first();
        if (await global.isVisible({ timeout: 350 }).catch(() => false)) {
            if (await safeClick(global, 1800)) return true;
        }
    }

    return false;
}

export async function fillOtherSettings(page: Page, data: ProductData): Promise<string | null> {
    console.log('\n⚙️  模块 8: 其它设置...');
    const settings = data.other_settings;
    if (!settings) {
        console.log('   ⏭️  使用默认设置');
        return null;
    }

    await openOtherSettingsTab(page);
    await randomDelay(220, 420);
    const manualTasks: string[] = [];

    // 库存扣减方式
    if (settings.stock_deduction) {
        try {
            const deductSelector = page.locator('text=库存扣减').locator('..').locator('.next-select, .next-radio-group, [role="combobox"]');
            if (await deductSelector.isVisible({ timeout: 3000 })) {
                await deductSelector.click();
                await randomDelay(300, 600);
                await page.locator(`[role="option"]:has-text("${settings.stock_deduction}")`).or(
                    page.locator(`label:has-text("${settings.stock_deduction}")`)
                ).click();
                console.log(`   ✅ 库存扣减: ${settings.stock_deduction}`);
            }
        } catch {
            console.log('   ⚠️  未找到库存扣减选择器');
        }
    }

    // EU 责任人
    if (settings.eu_responsible_person) {
        try {
            const euRow = await locateAssociationRow(page, /关联欧盟责任人|欧盟责任人|EU Responsible/i);
            if (!euRow) {
                console.log('   ⚠️  未找到欧盟责任人关联行（转人工）');
                manualTasks.push('欧盟责任人');
            } else if (await isAssociationLinked(euRow)) {
                console.log('   ✅ 欧盟责任人已关联');
            } else {
                console.log('   👤 欧盟责任人未关联，当前策略 = 人工处理');
                manualTasks.push('欧盟责任人');
            }
        } catch (e) {
            console.log(`   ⚠️  欧盟责任人设置异常: ${e}`);
            manualTasks.push('欧盟责任人');
        }
    }

    // 制造商
    if (settings.manufacturer_linked) {
        try {
            const mfgRow = await locateAssociationRow(page, /关联制造商|制造商|Manufacturer/i);
            if (!mfgRow) {
                console.log('   ⚠️  未找到制造商关联行（转人工）');
                manualTasks.push('制造商');
            } else if (await isAssociationLinked(mfgRow)) {
                console.log('   ✅ 制造商已关联');
            } else {
                console.log('   👤 制造商未关联，当前策略 = 人工处理');
                manualTasks.push('制造商');
            }
        } catch (e) {
            console.log(`   ⚠️  制造商设置异常: ${e}`);
            manualTasks.push('制造商');
        }
    }

    if (manualTasks.length > 0) {
        const uniqueTasks = Array.from(new Set(manualTasks));
        console.log(`   👤 人工处理其它设置: ${uniqueTasks.join('、')}`);
        const manualGateScreenshotPath = await screenshot(page, 'other_settings_manual_gate').catch(() => null);
        await randomDelay();
        return manualGateScreenshotPath;
    }

    await randomDelay();
    return null;
}
