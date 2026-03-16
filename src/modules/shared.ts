import type { Locator, Page } from 'playwright';

import { randomDelay } from '../browser';

export type ScrollMainContentOptions = {
    allowWheelFallback?: boolean;
};

export type ModuleExecutionStatus = 'auto_ok' | 'manual_gate';

export interface ModuleExecutionResult {
    status: ModuleExecutionStatus;
    evidence: string[];
    screenshotPaths: string[];
}

export function autoModuleExecutionResult(evidence: string | string[]): ModuleExecutionResult {
    return {
        status: 'auto_ok',
        evidence: Array.isArray(evidence) ? evidence : [evidence],
        screenshotPaths: [],
    };
}

export function manualGateModuleExecutionResult(
    evidence: string | string[],
    screenshotPaths: Array<string | null | undefined> = [],
): ModuleExecutionResult {
    return {
        status: 'manual_gate',
        evidence: Array.isArray(evidence) ? evidence : [evidence],
        screenshotPaths: screenshotPaths
            .map((entry) => (entry || '').trim())
            .filter(Boolean),
    };
}

export function escapeRegex(source: string): string {
    return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeCategoryPath(
    rawCategory: string | undefined | null,
    fallback: string[] = [],
): string[] {
    const source = (rawCategory || '').trim();
    if (!source) return [...fallback];
    return source
        .split(/\s*(?:>>|>|\/)\s*/)
        .map((part) => part.trim())
        .filter(Boolean);
}

export function buildCategoryRecentPattern(parts: string[]): RegExp {
    const source = parts.map((part) => escapeRegex(part)).join('\\s*(?:/|>>|>)\\s*');
    return new RegExp(source, 'i');
}

export function dedupeNonEmpty(values: Array<string | undefined>): string[] {
    const out: string[] = [];
    for (const value of values) {
        const normalized = (value || '').trim();
        if (!normalized) continue;
        if (!out.includes(normalized)) out.push(normalized);
    }
    return out;
}

export function getMainScrollContainer(page: Page): Locator {
    return page.locator('#ait-layout-content, #ait-microapp-content, .layout-content-container').first();
}

export async function scrollMainContent(
    page: Page,
    deltaY: number = 900,
    options: ScrollMainContentOptions = {},
): Promise<void> {
    const allowWheelFallback = options.allowWheelFallback ?? true;
    const scroller = getMainScrollContainer(page);
    if (await scroller.isVisible({ timeout: 1000 }).catch(() => false)) {
        const changed = await scroller.evaluate((el, y) => {
            const node = el as HTMLElement;
            const before = node.scrollTop;
            node.scrollTop += y as number;
            return { before, after: node.scrollTop };
        }, deltaY).catch(() => null);

        if (!changed || changed.before === changed.after) {
            await page.evaluate((y) => window.scrollBy(0, y as number), deltaY).catch(() => { });
            if (allowWheelFallback) {
                await page.mouse.wheel(0, deltaY).catch(() => { });
            }
        }
    } else {
        await page.evaluate((y) => window.scrollBy(0, y as number), deltaY).catch(() => { });
        if (allowWheelFallback) {
            await page.mouse.wheel(0, deltaY).catch(() => { });
        }
    }
    await randomDelay(250, 450);
}

export async function pickNthVisible(locator: Locator, visibleIndex: number = 0): Promise<Locator | null> {
    const domIndex = await locator.evaluateAll((elements, targetVisibleIndex) => {
        let seenVisible = 0;
        for (let i = 0; i < elements.length; i++) {
            const node = elements[i];
            if (!(node instanceof Element)) continue;

            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const browserVisible = typeof (node as Element & { checkVisibility?: (options?: Record<string, boolean>) => boolean; }).checkVisibility === 'function'
                ? (node as Element & { checkVisibility: (options?: Record<string, boolean>) => boolean; }).checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                })
                : true;
            const visible = browserVisible
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && style.opacity !== '0'
                && rect.width > 0
                && rect.height > 0
                && node.getClientRects().length > 0;
            if (!visible) continue;

            if (seenVisible === targetVisibleIndex) return i;
            seenVisible++;
        }
        return null;
    }, visibleIndex).catch(() => null);

    if (typeof domIndex === 'number' && domIndex >= 0) {
        return locator.nth(domIndex);
    }

    const total = await locator.count().catch(() => 0);
    let seenVisible = 0;
    for (let i = 0; i < total; i++) {
        const item = locator.nth(i);
        if (await item.isVisible({ timeout: 100 }).catch(() => false)) {
            if (seenVisible === visibleIndex) return item;
            seenVisible++;
        }
    }
    return null;
}

export async function safeClick(locator: Locator, timeout: number = 1800): Promise<boolean> {
    try {
        await locator.click({ timeout });
        return true;
    } catch {
        const handle = await locator.elementHandle({ timeout: 500 }).catch(() => null);
        if (!handle) return false;
        const box = await handle.boundingBox().catch(() => null);
        if (!box) return false;
        await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return true;
    }
}

export async function waitForRecentButtonVisible(
    page: Page,
    recentBtnCandidates: Locator,
    timeoutMs: number = 12000,
): Promise<Locator | null> {
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
}

export async function recentSelectCategoryPath(
    page: Page,
    categoryPath: string[],
    options: { acceptNonInputCommit?: boolean } = {},
): Promise<boolean> {
    const categoryInputCandidates = page.locator(
        'input[placeholder*="商品名称关键词"], input[placeholder*="商品ID"], input[placeholder*="商品链接"], input[placeholder*="搜索类目"], input[placeholder*="类目"], input[placeholder*="category"]'
    );
    const categoryInput: Locator = (await pickNthVisible(categoryInputCandidates, 0)) ?? categoryInputCandidates.first();
    const recentBtnCandidates = page.locator('text=最近使用');
    const recentBtn = await waitForRecentButtonVisible(page, recentBtnCandidates);
    if (!recentBtn) {
        throw new Error('未找到可见的「最近使用」按钮');
    }

    const lastSegment = categoryPath[categoryPath.length - 1] || '';
    const currentCategory = await categoryInput.inputValue().catch(() => '');
    if (lastSegment && currentCategory.includes(lastSegment)) {
        return true;
    }

    await recentBtn.scrollIntoViewIfNeeded().catch(() => { });
    await safeClick(recentBtn, 1600);
    await randomDelay(300, 650);

    const strictPathPattern = buildCategoryRecentPattern(categoryPath);
    const recentOptionCandidates = [
        page.locator('.category-history-lists > div').filter({ hasText: strictPathPattern }).first(),
        page.locator('[class*="history"] div').filter({ hasText: strictPathPattern }).first(),
        page.locator('li, div').filter({ hasText: strictPathPattern }).first(),
    ];

    let matchedOption: Locator | null = null;
    for (const candidate of recentOptionCandidates) {
        if (await candidate.isVisible({ timeout: 700 }).catch(() => false)) {
            matchedOption = candidate;
            break;
        }
    }
    if (!matchedOption) {
        throw new Error(`最近使用下拉中未命中「${categoryPath.join(' / ')}」`);
    }

    let clicked = await matchedOption.click({ force: true, timeout: 1200 })
        .then(() => true)
        .catch(() => false);
    if (!clicked) {
        clicked = await safeClick(matchedOption, 1600);
    }
    if (!clicked) {
        clicked = await page.evaluate((patternSource) => {
            const pattern = new RegExp(patternSource, 'i');
            const candidates = Array.from(document.querySelectorAll('.category-history-lists > div, [class*="history"] div, li, div')) as HTMLElement[];
            for (const el of candidates) {
                const text = (el.textContent || '').replace(/\s+/g, ' ');
                if (!pattern.test(text)) continue;
                const rect = el.getBoundingClientRect();
                if (rect.width < 10 || rect.height < 10) continue;
                el.click();
                return true;
            }
            return false;
        }, strictPathPattern.source).catch(() => false);
    }
    if (!clicked) {
        throw new Error('最近使用目标路径可见但不可点击');
    }

    await page.waitForTimeout(350);
    const categoryValue = await categoryInput.inputValue().catch(() => '');
    if (!lastSegment || categoryValue.includes(lastSegment)) {
        return true;
    }

    if (options.acceptNonInputCommit) {
        await page.waitForTimeout(650);
        return true;
    }

    return false;
}
