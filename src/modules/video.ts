import type { Locator, Page } from 'playwright';
import type { ProductData } from '../types';
import { randomDelay, screenshot } from '../browser';
import {
  autoModuleExecutionResult,
  dedupeNonEmpty,
  getMainScrollContainer,
  manualGateModuleExecutionResult,
  type ModuleExecutionResult,
  normalizeCategoryPath,
  pickNthVisible,
  recentSelectCategoryPath,
  safeClick,
  scrollMainContent,
} from './shared';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_CATEGORY_PATH = ['汽车及零配件', '车灯', '信号灯总成', '尾灯总成'];
export interface LocalVideoUploadSpec {
    absolutePath: string;
    fileName: string;
    stem: string;
}

export interface VideoSelectionSpec {
    fileName: string;
    stem: string;
    absolutePath: string | null;
    hasLocalFile: boolean;
}

type MediaCenterSelectionResult = 'selected' | 'empty' | 'not_found';

export function resolveLocalVideoUploadSpec(videoFile: string): LocalVideoUploadSpec | null {
    const rawPath = (videoFile || '').trim();
    if (!rawPath) return null;

    const candidates = path.isAbsolute(rawPath)
        ? [rawPath]
        : dedupeNonEmpty([
            path.resolve(process.cwd(), rawPath),
            path.resolve(__dirname, '..', '..', rawPath),
            path.resolve(__dirname, '..', '..', '..', rawPath),
        ]);

    const absolutePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!absolutePath) return null;

    return {
        absolutePath,
        fileName: path.basename(absolutePath),
        stem: path.basename(absolutePath, path.extname(absolutePath)),
    };
}

export function resolveVideoSelectionSpec(videoFile: string): VideoSelectionSpec | null {
    const rawPath = (videoFile || '').trim();
    if (!rawPath) return null;

    const fileName = path.basename(rawPath);
    const extension = path.extname(fileName);
    const stem = path.basename(fileName, extension);
    const absoluteCandidates = [rawPath, path.resolve(process.cwd(), rawPath)];
    const absolutePath = absoluteCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;
    return {
        fileName,
        stem,
        absolutePath,
        hasLocalFile: !!absolutePath,
    };
}

async function maybeDebugVideoProbe(page: Page, phase: string): Promise<void> {
    if (process.env.DEBUG_VIDEO !== '1') return;
    try {
        const source = `
            const visible = (el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && style.opacity !== '0'
                    && rect.width > 0
                    && rect.height > 0;
            };
            const rect = (el) => {
                const box = el.getBoundingClientRect();
                return {
                    x: Math.round(box.x),
                    y: Math.round(box.y),
                    w: Math.round(box.width),
                    h: Math.round(box.height),
                };
            };
            const candidateEls = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'));
            const candidates = candidateEls
                .filter((el) => visible(el) && /(商品视频|上传视频|选择视频|本地上传|媒体中心|video|upload)/i.test((el.textContent || '').trim()))
                .slice(0, 30)
                .map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
                    className: el.className || '',
                    rect: rect(el),
                }));

            const scrollers = Array.from(document.querySelectorAll('body, html, #ait-layout-content, #ait-microapp-content, .layout-content-container, div'))
                .filter((el) => {
                    const style = window.getComputedStyle(el);
                    return /(auto|scroll)/.test(style.overflowY)
                        && el.scrollHeight > el.clientHeight + 20
                        && el.clientHeight > 0;
                })
                .slice(0, 12)
                .map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    id: el.id || '',
                    className: el.className || '',
                    scrollTop: Math.round(el.scrollTop),
                    clientHeight: Math.round(el.clientHeight),
                    scrollHeight: Math.round(el.scrollHeight),
                }));

            return {
                url: location.href,
                candidates,
                scrollers,
                windowScrollY: Math.round(window.scrollY),
            };
        `;
        const report = await page.evaluate((scriptSource) => {
            const fn = new Function(scriptSource);
            return fn();
        }, source);

        console.log(`   🧭 视频探针(${phase}) url=${report.url} windowScrollY=${report.windowScrollY}`);
        console.log(`   🧭 视频探针(${phase}) scrollers=${JSON.stringify(report.scrollers)}`);
        console.log(`   🧭 视频探针(${phase}) candidates=${JSON.stringify(report.candidates)}`);
        await screenshot(page, `debug_video_probe_${phase}`).catch(() => { });
    } catch (e) {
        console.log(`   ⚠️  视频探针失败(${phase}): ${e}`);
    }
}

async function locateVideoUploadButton(page: Page): Promise<Locator | null> {
    const pickVideoUploadTrigger = async (scope: Locator): Promise<Locator | null> => {
        const direct = await pickNthVisible(
            scope.locator('button, [role="button"], a').filter({ hasText: /上传视频|选择视频|Upload Video/i }),
            0,
        );
        if (direct) return direct;

        const containerCandidates = scope.locator('div, span, p').filter({ hasText: /上传视频|选择视频|Upload Video/i });
        const containerTotal = await containerCandidates.count().catch(() => 0);
        let bestCardLike: { locator: Locator; area: number } | null = null;
        for (let i = 0; i < Math.min(containerTotal, 20); i++) {
            const candidate = containerCandidates.nth(i);
            if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const box = await candidate.boundingBox().catch(() => null);
            if (!box) continue;
            if (box.width < 48 || box.height < 48 || box.width > 220 || box.height > 220) continue;
            const area = box.width * box.height;
            if (!bestCardLike || area < bestCardLike.area) {
                bestCardLike = { locator: candidate, area };
            }
        }
        if (bestCardLike) {
            return bestCardLike.locator;
        }

        const textNode = await pickNthVisible(
            scope.locator('div, span, p, strong').filter({ hasText: /上传视频|选择视频|Upload Video/i }),
            0,
        );
        if (!textNode) return null;

        const clickableAncestor = textNode.locator('xpath=ancestor::*[self::button or @role="button" or self::a][1]');
        if (await clickableAncestor.isVisible({ timeout: 120 }).catch(() => false)) {
            return clickableAncestor;
        }

        const looseCandidates = scope.locator('div, span, p').filter({ hasText: /上传视频|选择视频|Upload Video/i });
        const total = await looseCandidates.count().catch(() => 0);
        let best: { locator: Locator; area: number } | null = null;
        for (let i = 0; i < Math.min(total, 20); i++) {
            const candidate = looseCandidates.nth(i);
            if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const box = await candidate.boundingBox().catch(() => null);
            if (!box) continue;
            if (box.width < 20 || box.height < 12 || box.width > 220 || box.height > 220) continue;
            const area = box.width * box.height;
            if (!best || area < best.area) {
                best = { locator: candidate, area };
            }
        }
        if (best) {
            return best.locator;
        }

        return null;
    };

    const locateVideoSection = async (): Promise<Locator | null> => {
        const sectionCandidates = page.locator('div, section, article').filter({ hasText: /商品视频|Product Video/i });
        const total = await sectionCandidates.count().catch(() => 0);
        let best: { locator: Locator; area: number } | null = null;

        for (let i = 0; i < Math.min(total, 80); i++) {
            const section = sectionCandidates.nth(i);
            if (!await section.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const text = ((await section.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
            if (!/商品视频|Product Video/i.test(text) || !/上传视频|选择视频|Upload Video/i.test(text)) continue;

            const box = await section.boundingBox().catch(() => null);
            if (!box || box.width < 200 || box.height < 60 || box.height > 320) continue;
            const area = box.width * box.height;
            if (!best || area < best.area) {
                best = { locator: section, area };
            }
        }

        return best?.locator ?? null;
    };

    const scrollSectionIntoViewAndPick = async (): Promise<Locator | null> => {
        const section = await locateVideoSection();
        if (!section) return null;
        await section.scrollIntoViewIfNeeded().catch(() => { });
        await page.waitForTimeout(220);

        const directTrigger = await pickVideoUploadTrigger(section);
        if (directTrigger) return directTrigger;

        const componentFallback = await pickNthVisible(
            section.locator('.struct-imageVideo, .ui-type-videos, [class*="video"], [class*="upload"]').filter({ hasText: /上传视频|选择视频|Upload Video/i }),
            0,
        );
        if (componentFallback) return componentFallback;

        return null;
    };

    const resetBasicInfoAnchor = async () => {
        const basicInfoTab = await pickNthVisible(
            page.locator('[role="tab"], .next-tabs-tab, .ait-tabs-tab, .tab, div, span, a').filter({ hasText: /基本信息|Basic Information/i }),
            0,
        );
        if (basicInfoTab) {
            await safeClick(basicInfoTab, 1400);
            await page.waitForTimeout(260);
        }

        const scroller = getMainScrollContainer(page);
        const resetDone = await scroller.evaluate((el) => {
            const node = el as HTMLElement;
            node.scrollTop = 0;
            return true;
        }).catch(() => false);
        if (!resetDone) {
            await page.evaluate(() => window.scrollTo(0, 0)).catch(() => { });
        }
        await page.waitForTimeout(260);
    };

    const probeCurrentViewport = async (): Promise<Locator | null> => {
        const sectionCandidates = page.locator('section, div, article').filter({ hasText: /商品视频|Product Video/i });
        const sectionCount = await sectionCandidates.count().catch(() => 0);
        for (let i = 0; i < Math.min(sectionCount, 20); i++) {
            const section = sectionCandidates.nth(i);
            if (!await section.isVisible({ timeout: 120 }).catch(() => false)) continue;

            const uploadBtn = await pickVideoUploadTrigger(section);
            if (uploadBtn) return uploadBtn;
        }

        return await pickVideoUploadTrigger(page.locator('body'));
    };

    await resetBasicInfoAnchor();
    await maybeDebugVideoProbe(page, 'after-reset');
    const firstPass = await scrollSectionIntoViewAndPick();
    if (firstPass) return firstPass;

    for (let attempt = 0; attempt < 12; attempt++) {
        const anchored = await scrollSectionIntoViewAndPick();
        if (anchored) return anchored;

        const uploadBtn = await probeCurrentViewport();
        if (uploadBtn) return uploadBtn;
        await scrollMainContent(page, 180, { allowWheelFallback: false });
        if (attempt === 2 || attempt === 6 || attempt === 11) {
            await maybeDebugVideoProbe(page, `scan-${attempt + 1}`);
        }
        await page.waitForTimeout(180);
    }

    return null;
}

async function isVideoSectionVisible(page: Page): Promise<boolean> {
    const sectionCandidates = page.locator('section, div, article').filter({ hasText: /商品视频|Product Video/i });
    const total = await sectionCandidates.count().catch(() => 0);
    for (let i = 0; i < Math.min(total, 20); i++) {
        const section = sectionCandidates.nth(i);
        if (!await section.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const text = ((await section.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!/商品视频|Product Video/i.test(text)) continue;
        const box = await section.boundingBox().catch(() => null);
        if (box && box.width >= 120 && box.height >= 40) return true;
    }
    return false;
}

interface ProductVideoBindingState {
    sectionFound: boolean;
    bound: boolean;
    uploadPlaceholderVisible: boolean;
    mediaVisible: boolean;
    expectedTextVisible: boolean;
    evidence: string;
}

async function inspectProductVideoBinding(page: Page, expectedFileName?: string): Promise<ProductVideoBindingState> {
    const sectionCandidates = page.locator('section, div, article').filter({ hasText: /商品视频|Product Video/i });
    const total = await sectionCandidates.count().catch(() => 0);
    let section: Locator | null = null;
    let bestArea = Number.POSITIVE_INFINITY;

    for (let i = 0; i < Math.min(total, 20); i++) {
        const candidate = sectionCandidates.nth(i);
        if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;
        const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!/商品视频|Product Video/i.test(text)) continue;
        const box = await candidate.boundingBox().catch(() => null);
        if (!box || box.width < 120 || box.height < 40) continue;
        const area = box.width * box.height;
        if (area < bestArea) {
            bestArea = area;
            section = candidate;
        }
    }

    if (!section) {
        return {
            sectionFound: false,
            bound: false,
            uploadPlaceholderVisible: false,
            mediaVisible: false,
            expectedTextVisible: false,
            evidence: 'video-section-missing',
        };
    }

    const inspection = await section.evaluate((node, expectedName) => {
        const root = node as HTMLElement;
        const normalize = (value: string | null | undefined) =>
            (value || '')
                .replace(/\.mp4$/i, '')
                .replace(/[.…]+$/g, '')
                .replace(/\s+/g, '')
                .trim()
                .toLowerCase();
        const visible = (el: Element | null): el is HTMLElement => {
            if (!(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
        };

        const expected = normalize(expectedName);
        const textNodes = Array.from(root.querySelectorAll('div, span, p, a, button, strong'))
            .filter((el) => visible(el))
            .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        const sectionText = textNodes.join(' | ');

        const uploadPlaceholderVisible = textNodes.some((text) => /上传视频|选择视频|Upload Video/i.test(text));
        const expectedTextVisible = !!expected && textNodes.some((text) => normalize(text).includes(expected));

        const mediaVisible = Array.from(
            root.querySelectorAll('img, video, canvas, [class*="preview"], [class*="thumb"], [class*="poster"], [class*="cover"]')
        ).some((el) => visible(el));

        const backgroundPreviewVisible = Array.from(root.querySelectorAll('div, span'))
            .filter((el) => visible(el))
            .some((el) => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return style.backgroundImage !== 'none' && rect.width >= 40 && rect.height >= 40;
            });

        const bound = expectedTextVisible || mediaVisible || backgroundPreviewVisible;
        const evidence = JSON.stringify({
            uploadPlaceholderVisible,
            mediaVisible,
            backgroundPreviewVisible,
            expectedTextVisible,
            sectionText: sectionText.slice(0, 240),
        });

        return {
            uploadPlaceholderVisible,
            mediaVisible: mediaVisible || backgroundPreviewVisible,
            expectedTextVisible,
            bound,
            evidence,
        };
    }, expectedFileName).catch(() => ({
        uploadPlaceholderVisible: false,
        mediaVisible: false,
        expectedTextVisible: false,
        bound: false,
        evidence: 'video-binding-evaluate-failed',
    }));

    return {
        sectionFound: true,
        bound: inspection.bound,
        uploadPlaceholderVisible: inspection.uploadPlaceholderVisible,
        mediaVisible: inspection.mediaVisible,
        expectedTextVisible: inspection.expectedTextVisible,
        evidence: inspection.evidence,
    };
}

async function waitForProductVideoBinding(page: Page, expectedFileName?: string): Promise<ProductVideoBindingState> {
    const startedAt = Date.now();
    let lastState: ProductVideoBindingState = {
        sectionFound: false,
        bound: false,
        uploadPlaceholderVisible: false,
        mediaVisible: false,
        expectedTextVisible: false,
        evidence: 'video-binding-pending',
    };

    while (Date.now() - startedAt < 5000) {
        lastState = await inspectProductVideoBinding(page, expectedFileName);
        if (lastState.bound) {
            return lastState;
        }
        await page.waitForTimeout(220);
    }

    return lastState;
}

export async function bootstrapVideoCategoryFromRecent(page: Page, data: ProductData): Promise<boolean> {
    console.log('\n🧭 模块 1e 前置: 最近使用类目 bootstrap...');
    const categoryPath = normalizeCategoryPath(data.category, []);
    if (categoryPath.length === 0) {
        console.log('   ⚠️  视频模块缺少 category，无法执行最近使用前置，转人工');
        await screenshot(page, 'video_recent_category_missing').catch(() => { });
        return false;
    }

    console.log(`   目标: 最近使用 -> ${categoryPath.join(' → ')}`);
    try {
        const selected = await recentSelectCategoryPath(page, categoryPath, { acceptNonInputCommit: true });
        if (!selected) {
            console.log('   ⚠️  最近使用类目点击后未写入目标值，转人工');
            await screenshot(page, 'video_recent_category_unlocked').catch(() => { });
            return false;
        }

        const startedAt = Date.now();
        let visible = false;
        while (Date.now() - startedAt < 6000) {
            visible = await isVideoSectionVisible(page);
            if (visible) break;
            await page.waitForTimeout(280);
        }
        if (!visible) {
            console.log('   ⚠️  类目前置完成但商品视频区域未出现，转人工');
            await screenshot(page, 'video_recent_category_missing_panel').catch(() => { });
            return false;
        }

        console.log(`   ✅ 视频前置类目已锁定（最近使用 -> ${categoryPath[categoryPath.length - 1]}）`);
        return true;
    } catch (e) {
        console.log(`   ⚠️  视频最近使用前置失败，转人工: ${e}`);
        await screenshot(page, 'video_recent_category_failed').catch(() => { });
        return false;
    }
}

async function waitForVideoModal(page: Page): Promise<Locator | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10000) {
        const modalCandidates = page.locator('div, section, article').filter({ hasText: /选择视频|本地上传|媒体中心|视频文件/i });
        const total = await modalCandidates.count().catch(() => 0);
        let best: { locator: Locator; area: number } | null = null;
        for (let i = 0; i < Math.min(total, 30); i++) {
            const modal = modalCandidates.nth(i);
            if (!await modal.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const text = ((await modal.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
            if (!/选择视频/i.test(text)) continue;
            if (!/本地上传|媒体中心|视频文件/i.test(text)) continue;
            const box = await modal.boundingBox().catch(() => null);
            if (!box || box.width < 200 || box.height < 80) continue;
            const area = box.width * box.height;
            if (!best || area > best.area) {
                best = { locator: modal, area };
            }
        }
        if (best) {
            return best.locator;
        }
        await randomDelay(150, 280);
    }
    return null;
}

async function switchVideoModalToLocalUpload(page: Page, modal: Locator): Promise<void> {
    const localTab = await pickNthVisible(
        modal.locator('button, [role="tab"], a, div, span').filter({ hasText: /本地上传|Local Upload/i }),
        0,
    );
    if (!localTab) return;

    const className = await localTab.evaluate((el) => (el as HTMLElement).className || '').catch(() => '');
    const ariaSelected = await localTab.getAttribute('aria-selected').catch(() => null);
    if (/active|selected|current/i.test(className) || ariaSelected === 'true') {
        return;
    }

    await safeClick(localTab, 1400);
    await page.waitForTimeout(240);
}

async function switchVideoModalToMediaCenter(page: Page, modal: Locator): Promise<boolean> {
    const scope = page.locator('body');
    const mediaTab = await pickNthVisible(
        scope.locator(
            'xpath=.//*[self::button or @role="tab" or self::a or self::div or self::span][normalize-space()="媒体中心" or normalize-space()="Media Center"]',
        ),
        0,
    );
    if (!mediaTab) return false;

    const className = await mediaTab.evaluate((el) => (el as HTMLElement).className || '').catch(() => '');
    const ariaSelected = await mediaTab.getAttribute('aria-selected').catch(() => null);
    if (!/active|selected|current/i.test(className) && ariaSelected !== 'true') {
        let switched = await safeClick(mediaTab, 1400);
        if (!switched) {
            switched = await mediaTab.click({ force: true, timeout: 1200 }).then(() => true).catch(() => false);
        }
        if (!switched) {
            switched = await page.evaluate(() => {
                const nodes = Array.from(document.querySelectorAll('button, [role="tab"], a, div, span')) as HTMLElement[];
                const target = nodes.find((node) => /^(媒体中心|Media Center)$/.test((node.textContent || '').trim()));
                if (!target) return false;
                target.click();
                return true;
            }).catch(() => false);
        }
        await page.waitForTimeout(260);
    }

    const allVideosVisible = await scope.locator('text=全部视频').first().isVisible({ timeout: 900 }).catch(async () => {
        return await scope.locator('text=All Videos').first().isVisible({ timeout: 900 }).catch(() => false);
    });
    if (allVideosVisible) return true;

    const searchInputVisible = await scope
        .locator('input[placeholder*="在此文件夹下搜索"], input[placeholder*="Search"]')
        .first()
        .isVisible({ timeout: 900 })
        .catch(() => false);
    if (searchInputVisible) return true;

    const cardVisible = await scope
        .locator('input[type="checkbox"], [role="checkbox"], .checkbox, [class*="checkbox"]')
        .nth(1)
        .isVisible({ timeout: 900 })
        .catch(() => false);
    return cardVisible;
}

async function selectVideoFromMediaCenter(page: Page, modal: Locator, spec: VideoSelectionSpec): Promise<MediaCenterSelectionResult> {
    const scope = page.locator('body');
    const switched = await switchVideoModalToMediaCenter(page, modal);
    if (!switched) return 'not_found';

    const normalizeVideoText = (value: string) =>
        value
            .replace(/\.mp4$/i, '')
            .replace(/[.…]+$/g, '')
            .replace(/\s+/g, '')
            .trim()
            .toLowerCase();

    const targetName = normalizeVideoText(spec.fileName);
    const targetStem = normalizeVideoText(spec.stem);
    const targetPrefix = targetStem.slice(0, Math.min(targetStem.length, 8));

    const locateFolderSearchInput = async (): Promise<Locator | null> => {
        const inputs = scope.locator('input[placeholder*="在此文件夹下搜索"], input[placeholder*="Search"]');
        const total = await inputs.count().catch(() => 0);
        let best: { locator: Locator; width: number; y: number } | null = null;
        for (let i = 0; i < Math.min(total, 8); i++) {
            const candidate = inputs.nth(i);
            if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const box = await candidate.boundingBox().catch(() => null);
            if (!box || box.width < 60 || box.height < 20) continue;
            if (!best || box.y < best.y || (Math.abs(box.y - best.y) < 8 && box.width > best.width)) {
                best = { locator: candidate, width: box.width, y: box.y };
            }
        }
        return best?.locator ?? null;
    };

    const runFolderSearch = async (): Promise<void> => {
        const searchInput = await locateFolderSearchInput();
        if (!searchInput) return;

        const query = spec.stem || spec.fileName.replace(/\.[^.]+$/, '');
        console.log(`   → 媒体中心搜索: ${query}`);
        await searchInput.fill(query).catch(() => { });
        await page.waitForTimeout(120);
        await searchInput.press('Enter').catch(() => { });

        const searchContainer = searchInput.locator('xpath=ancestor::*[self::div][1]');
        const searchButton = await pickNthVisible(
            searchContainer.locator('button, [role="button"], span').filter({ hasText: /搜索|search/i }),
            0,
        );
        if (searchButton) {
            await safeClick(searchButton, 1200);
        }
        await page.waitForTimeout(480);
    };

    const emptyState = async () =>
        await pickNthVisible(
            scope.locator('div, span, p').filter({ hasText: /暂无视频|请在媒体中心上传视频|No videos/i }),
            0,
        );

    const locateAllVideos = async () =>
        await pickNthVisible(
            scope.locator(
                'xpath=.//*[self::button or self::div or self::span or self::a][normalize-space()="全部视频" or normalize-space()="All Videos"]',
            ),
            0,
        );

    const exactCard = scope.locator(
        [
            `[title="${spec.fileName}"]`,
            `[alt="${spec.fileName}"]`,
            `[data-name="${spec.fileName}"]`,
            `[data-full-name="${spec.fileName}"]`,
        ].join(', ')
    ).first();

    const textCard = scope.locator(
        `xpath=.//*[self::div or self::span or self::p][normalize-space()="${spec.fileName}"]`,
    ).first();

    const listVisibleVideoCards = async (): Promise<Array<{ locator: Locator; text: string; area: number }>> => {
        const checkboxCandidates = scope.locator('input[type="checkbox"], [role="checkbox"], .checkbox, [class*="checkbox"]');
        const total = await checkboxCandidates.count().catch(() => 0);
        const cards: Array<{ locator: Locator; text: string; area: number }> = [];
        for (let i = 0; i < Math.min(total, 60); i++) {
            const checkbox = checkboxCandidates.nth(i);
            if (!await checkbox.isVisible({ timeout: 120 }).catch(() => false)) continue;

            for (let level = 1; level <= 5; level++) {
                const candidate = checkbox.locator(
                    `xpath=ancestor-or-self::*[self::div or self::label or self::article][${level}]`,
                );
                if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;
                const box = await candidate.boundingBox().catch(() => null);
                if (!box) continue;
                if (box.width < 80 || box.width > 420 || box.height < 80 || box.height > 520) continue;
                const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
                if (!text || /全选|Select All/i.test(text)) continue;
                cards.push({ locator: candidate, text, area: box.width * box.height });
                break;
            }
        }
        cards.sort((a, b) => a.area - b.area);
        return cards;
    };

    const locateSelectedCard = async (): Promise<Locator | null> => {
        const collectAncestorCandidates = (locator: Locator): Locator[] => {
            const candidates: Locator[] = [];
            for (let level = 1; level <= 6; level++) {
                candidates.push(
                    locator.locator(
                        `xpath=ancestor-or-self::*[self::div or self::label or self::article or self::li or @role="button"][${level}]`,
                    ),
                );
            }
            return candidates;
        };

        const cardCandidates: Locator[] = [
            exactCard,
            ...collectAncestorCandidates(exactCard),
            ...collectAncestorCandidates(textCard),
        ];

        for (const candidate of cardCandidates) {
            if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;
            const box = await candidate.boundingBox().catch(() => null);
            if (!box) continue;
            const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
            const hasMediaDescendant = await candidate.locator(
                'img, video, canvas, [class*="preview"], [class*="thumb"], [class*="poster"], [class*="cover"]',
            ).first().isVisible({ timeout: 120 }).catch(() => false);
            const hasSelectableDescendant = await candidate.locator(
                'input[type="checkbox"], [role="checkbox"], .checkbox, [class*="checkbox"]',
            ).first().isVisible({ timeout: 120 }).catch(() => false);
            const explicitName = (
                (await candidate.getAttribute('data-name').catch(() => '')) ||
                (await candidate.getAttribute('data-full-name').catch(() => '')) ||
                (await candidate.getAttribute('title').catch(() => '')) ||
                (await candidate.getAttribute('alt').catch(() => '')) ||
                ''
            ).trim();
            const rowLikeSelectable =
                box.width >= 80 &&
                box.width <= 1400 &&
                box.height >= 32 &&
                box.height <= 180 &&
                (
                    explicitName !== '' ||
                    (hasSelectableDescendant && hasMediaDescendant)
                );
            const cardLike =
                (
                    box.width >= 120 &&
                    box.width <= 420 &&
                    box.height >= 160 &&
                    box.height <= 520 &&
                    (hasMediaDescendant || /复制链接|copy link|\b\d{2}:\d{2}\b/i.test(text))
                ) ||
                rowLikeSelectable;

            if (process.env.DEBUG_VIDEO === '1') {
                console.log(`   🧪 媒体中心选中候选: box=${JSON.stringify({ x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) })} explicit=${JSON.stringify(explicitName)} selectable=${hasSelectableDescendant} media=${hasMediaDescendant} cardLike=${cardLike} text=${JSON.stringify(text.slice(0, 120))}`);
            }

            if (cardLike) {
                return candidate;
            }
        }

        const visibleCards = await listVisibleVideoCards();
        if (process.env.DEBUG_VIDEO === '1') {
            console.log(`   🧪 媒体中心候选卡: ${JSON.stringify(visibleCards.map((card) => card.text.slice(0, 80)))}`);
        }
        const partial = visibleCards.find((card) => {
            const normalized = normalizeVideoText(card.text);
            return (
                normalized.includes(targetName) ||
                normalized.includes(targetStem) ||
                targetName.includes(normalized) ||
                targetStem.includes(normalized) ||
                (targetPrefix.length >= 4 && normalized.includes(targetPrefix))
            );
        });
        if (partial) {
            return partial.locator;
        }

        if (visibleCards.length === 1) {
            return visibleCards[0].locator;
        }
        return null;
    };

    const activateSelectedCard = async (selectedCard: Locator): Promise<void> => {
        const box = await selectedCard.boundingBox().catch(() => null);
        const treatAsBareText =
            !!box &&
            (box.width < 120 || box.height < 120);
        const checkbox = await pickNthVisible(
            selectedCard.locator('input[type="checkbox"], [role="checkbox"], .checkbox, [class*="checkbox"]'),
            0,
        );
        if (checkbox) {
            await safeClick(checkbox, 1400);
            return;
        }

        if (!treatAsBareText && await safeClick(selectedCard, 1400)) {
            return;
        }

        const previewTarget = await pickNthVisible(
            selectedCard.locator(
                'img, video, canvas, [class*="preview"], [class*="thumb"], [class*="poster"], [class*="cover"]',
            ),
            0,
        );
        if (previewTarget && await safeClick(previewTarget, 1400)) {
            return;
        }

        if (!box) return;
        const hotspots = [
            { x: box.x + box.width / 2, y: box.y + Math.min(box.height * 0.35, box.height - 8) },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
            { x: box.x + Math.min(box.width * 0.2, box.width - 8), y: box.y + Math.min(box.height * 0.2, box.height - 8) },
        ];
        for (const point of hotspots) {
            await page.mouse.click(point.x, point.y).catch(() => { });
            await page.waitForTimeout(120);
            if (await confirmEnabled() || await selectionCountReady()) {
                return;
            }
        }
    };

    const locateCardCheckboxHotspotsByTextPrefix = async (): Promise<Array<{ prefix: string; x: number; y: number; rect: { x: number; y: number; width: number; height: number }; target?: string }>> => {
        const prefixes = dedupeNonEmpty([
            spec.stem.slice(0, Math.min(spec.stem.length, 12)),
            spec.stem.slice(0, Math.min(spec.stem.length, 8)),
            spec.stem.slice(0, Math.min(spec.stem.length, 6)),
        ]);

        const hotspots: Array<{ prefix: string; x: number; y: number; rect: { x: number; y: number; width: number; height: number }; target?: string }> = [];
        for (const prefix of prefixes) {
            if (prefix.length < 4) continue;
            const source = `
                const normalizeText = (value) =>
                    (value || '')
                        .replace(/\\.mp4$/i, '')
                        .replace(/[.…]+$/g, '')
                        .replace(/\\s+/g, '')
                        .trim()
                        .toLowerCase();

                const targetPrefix = normalizeText(payload.prefix);
                const isVisible = (node) => {
                    if (!(node instanceof HTMLElement)) return false;
                    const style = window.getComputedStyle(node);
                    const rect = node.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };

                const seen = new Set();
                const results = [];
                const textNodes = Array.from(document.querySelectorAll('div, span, p')).filter((node) => {
                    if (!(node instanceof HTMLElement)) return false;
                    if (!isVisible(node)) return false;
                    const text = normalizeText(node.textContent || '');
                    return text.includes(targetPrefix);
                });

                const registerCandidate = (startNode) => {
                    let node = startNode instanceof HTMLElement ? startNode : startNode?.parentElement || null;
                    for (let depth = 0; depth < 10 && node; depth++, node = node.parentElement) {
                        if (!isVisible(node)) continue;
                        const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
                        const rect = node.getBoundingClientRect();
                        if (!text || /全选|Select All/i.test(text)) continue;
                        if (rect.width < 120 || rect.width > 420 || rect.height < 160 || rect.height > 520) continue;

                        const mediaDescendant = node.querySelector('img, video, canvas, [class*="preview"], [class*="thumb"], [class*="poster"], [class*="cover"]');
                        if (!(mediaDescendant instanceof HTMLElement) && !/复制链接|copy link/i.test(text)) continue;

                        const key = \`\${Math.round(rect.left)}:\${Math.round(rect.top)}:\${Math.round(rect.width)}:\${Math.round(rect.height)}\`;
                        if (seen.has(key)) continue;
                        seen.add(key);

                        const x = rect.left + Math.min(24, Math.max(12, rect.width * 0.12));
                        const y = rect.top + Math.min(24, Math.max(12, rect.height * 0.12));
                        const elementAtHotspot = document.elementFromPoint(x, y);
                        const target = elementAtHotspot instanceof HTMLElement
                            ? \`\${elementAtHotspot.tagName.toLowerCase()}#\${elementAtHotspot.id}.\${String(elementAtHotspot.className || '')}\`.replace(/\\.+$/, '')
                            : '';

                        results.push({
                            x,
                            y,
                            rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
                            target,
                        });
                        break;
                    }
                };

                for (const textNode of textNodes) {
                    registerCandidate(textNode);
                }

                return results;
            `;
            const candidateHotspots = await page.evaluate(({ scriptSource, payload }) => {
                const fn = new Function('payload', scriptSource);
                return fn(payload);
            }, { scriptSource: source, payload: { prefix } }).catch((error) => {
                if (process.env.DEBUG_VIDEO === '1') {
                    console.log(`   🧪 媒体中心前缀热区求值失败: ${String(error)}`);
                }
                return [];
            });

            for (const hotspot of candidateHotspots) {
                hotspots.push({ prefix, ...hotspot });
            }
        }
        return hotspots;
    };

    const clickCardCheckboxHotspotByTextPrefix = async (): Promise<boolean> => {
        const hotspots = await locateCardCheckboxHotspotsByTextPrefix();
        for (const hotspot of hotspots) {
            const attempts = [
                { x: hotspot.x, y: hotspot.y },
                { x: hotspot.x + 6, y: hotspot.y },
                { x: hotspot.x, y: hotspot.y + 6 },
                { x: hotspot.x + 6, y: hotspot.y + 6 },
            ];
            for (const point of attempts) {
                await page.mouse.move(point.x, point.y).catch(() => { });
                await page.waitForTimeout(80);
                await page.mouse.click(point.x, point.y).catch(() => { });
                await page.waitForTimeout(180);
                if (await confirmEnabled() || await selectionCountReady()) {
                    if (process.env.DEBUG_VIDEO === '1') {
                        console.log(`   🧪 媒体中心前缀热区点击命中: ${hotspot.prefix} @ (${Math.round(point.x)}, ${Math.round(point.y)}) rect=${JSON.stringify(hotspot.rect)} target=${hotspot.target || ''}`);
                    }
                    return true;
                }
            }
        }
        if (process.env.DEBUG_VIDEO === '1') {
            console.log(`   🧪 媒体中心前缀热区候选: ${JSON.stringify(hotspots.map((item) => ({ prefix: item.prefix, x: Math.round(item.x), y: Math.round(item.y), rect: item.rect, target: item.target || '' })))}`);
        }
        return false;
    };

    const clickMatchingCardByDom = async (): Promise<boolean> => {
        const clicked = await page.evaluate((args) => {
            const root = document.body;
            const normalizeVideoText = (value: string) =>
                (value || '')
                    .replace(/\.mp4$/i, '')
                    .replace(/[.…]+$/g, '')
                    .replace(/\s+/g, '')
                    .trim()
                    .toLowerCase();

            const targetName = normalizeVideoText(args.fileName);
            const targetStem = normalizeVideoText(args.stem);
            const targetPrefix = targetStem.slice(0, Math.min(targetStem.length, 8));

            const isVisible = (node: Element | null): node is HTMLElement => {
                if (!(node instanceof HTMLElement)) return false;
                const style = window.getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            };

            const roots = new Set<HTMLElement>();
            const registerRoot = (start: Element | null) => {
                let node: HTMLElement | null =
                    start instanceof HTMLElement ? start : start?.parentElement || null;
                for (let depth = 0; depth < 7 && node; depth++, node = node.parentElement) {
                    if (!isVisible(node)) continue;
                    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
                    const rect = node.getBoundingClientRect();
                    if (!text || /全选|Select All/i.test(text)) continue;
                    if (rect.width >= 80 && rect.width <= 520 && rect.height >= 80 && rect.height <= 620) {
                        roots.add(node);
                        break;
                    }
                }
            };

            for (const checkbox of Array.from(
                root.querySelectorAll('input[type="checkbox"], [role="checkbox"], .checkbox, [class*="checkbox"]'),
            )) {
                registerRoot(checkbox);
            }

            for (const explicitNode of Array.from(
                root.querySelectorAll('[data-name], [data-full-name], [title], [alt], .video-card'),
            )) {
                registerRoot(explicitNode);
            }

            const maybeMatchingTextNodes = Array.from(
                root.querySelectorAll('div, article, li, label, a, span, p'),
            ).filter((node) => {
                if (!(node instanceof HTMLElement)) return false;
                if (!isVisible(node)) return false;
                const text = normalizeVideoText(node.textContent || '');
                if (!text) return false;
                return (
                    text.includes(targetName) ||
                    text.includes(targetStem) ||
                    targetName.includes(text) ||
                    targetStem.includes(text) ||
                    (targetPrefix.length >= 4 && text.includes(targetPrefix))
                );
            });
            for (const node of maybeMatchingTextNodes) {
                registerRoot(node);
            }

            const selectionReady = () => {
                const text = (root.textContent || '').replace(/\s+/g, ' ');
                if (/已选择[:：]?\s*1|Selected[:：]?\s*1/i.test(text)) return true;
                const confirmButtons = Array.from(
                    root.querySelectorAll('button, [role="button"]'),
                ).filter((node) => /^(确定|确认|OK)$/i.test((node.textContent || '').trim()));
                return confirmButtons.some((node) => {
                    if (!(node instanceof HTMLElement)) return false;
                    const ariaDisabled = node.getAttribute('aria-disabled');
                    return !node.hasAttribute('disabled') && ariaDisabled !== 'true';
                });
            };

            const cards = Array.from(roots).map((node) => {
                const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
                const normalized = normalizeVideoText(text);
                const explicit = normalizeVideoText(
                    node.getAttribute('data-name') ||
                    node.getAttribute('data-full-name') ||
                    node.getAttribute('title') ||
                    node.getAttribute('alt') ||
                    '',
                );
                return { node, text, normalized, explicit };
            });

            const scoredCards = cards.map((card) => {
                let score = 0;
                if (card.explicit === targetName || card.explicit === targetStem) score += 100;
                if (card.explicit.includes(targetName) || card.explicit.includes(targetStem)) score += 80;
                if (card.normalized.includes(targetName) || card.normalized.includes(targetStem)) score += 60;
                if (targetName.includes(card.normalized) || targetStem.includes(card.normalized)) score += 40;
                if (targetPrefix.length >= 4 && card.normalized.includes(targetPrefix)) score += 20;
                if (card.node.querySelector('img, video, canvas')) score += 8;
                const rect = card.node.getBoundingClientRect();
                if (rect.width >= 120 && rect.width <= 320 && rect.height >= 160 && rect.height <= 420) score += 10;
                return { ...card, score };
            });

            const match =
                scoredCards.find((card) =>
                    card.explicit === targetName ||
                    card.explicit === targetStem ||
                    card.normalized.includes(targetName) ||
                    card.normalized.includes(targetStem),
                ) ||
                scoredCards.find((card) =>
                    targetName.includes(card.normalized) ||
                    targetStem.includes(card.normalized) ||
                    (targetPrefix.length >= 4 && card.normalized.includes(targetPrefix)),
                ) ||
                scoredCards.sort((a, b) => b.score - a.score)[0] ||
                (cards.length === 1 ? cards[0] : null);

            if (!match) return false;

            const checkbox = match.node.querySelector('input[type="checkbox"], [role="checkbox"], .checkbox, [class*="checkbox"]');
            if (checkbox instanceof HTMLElement) {
                checkbox.click();
            } else {
                match.node.click();
                if (!selectionReady()) {
                    const previewTarget = match.node.querySelector(
                        'img, video, canvas, [class*="preview"], [class*="thumb"], [class*="poster"], [class*="cover"]',
                    );
                    if (previewTarget instanceof HTMLElement) {
                        previewTarget.click();
                    }
                }
                if (!selectionReady()) {
                    const rect = match.node.getBoundingClientRect();
                    const hotX = Math.max(rect.left + Math.min(18, rect.width / 6), rect.left + 4);
                    const hotY = Math.max(rect.top + Math.min(18, rect.height / 6), rect.top + 4);
                    const hotspot = document.elementFromPoint(hotX, hotY);
                    if (hotspot instanceof HTMLElement) {
                        hotspot.click();
                    }
                }
            }
            return true;
        }, { fileName: spec.fileName, stem: spec.stem }).catch(() => false);

        if (process.env.DEBUG_VIDEO === '1') {
            console.log(`   🧪 媒体中心 DOM fallback 点击: ${clicked ? 'true' : 'false'}`);
        }
        return clicked;
    };

    const clickFirstVisibleMediaTileByDom = async (): Promise<boolean> => {
        const source = `
            const isVisible = (node) => {
                if (!(node instanceof HTMLElement)) return false;
                const style = window.getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            };

            const candidates = Array.from(document.querySelectorAll('div, article, li, a'))
                .filter((node) => isVisible(node))
                .map((node) => {
                    const rect = node.getBoundingClientRect();
                    const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
                    const mediaChild = node.querySelector('img, video, canvas, [class*="preview"], [class*="thumb"], [class*="poster"], [class*="cover"]');
                    const score =
                        (/\\b\\d{2}:\\d{2}\\b/.test(text) ? 20 : 0) +
                        (/复制链接|copy link/i.test(text) ? 8 : 0) +
                        (mediaChild ? 15 : 0) +
                        (rect.width >= 120 && rect.width <= 320 ? 10 : 0) +
                        (rect.height >= 180 && rect.height <= 420 ? 10 : 0) +
                        (rect.width <= 260 ? 6 : 0) +
                        (rect.height <= 360 ? 6 : 0);
                    return {
                        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
                        text,
                        score,
                    };
                })
                .filter((item) => item.score >= 25)
                .sort((a, b) =>
                    (b.score - a.score) ||
                    ((a.rect.width * a.rect.height) - (b.rect.width * b.rect.height)) ||
                    (a.rect.top - b.rect.top) ||
                    (a.rect.x - b.rect.x)
                );

            return candidates.slice(0, 5).map((item) => ({
                rect: item.rect,
                text: item.text,
                points: [
                    { x: item.rect.x + Math.min(24, Math.max(12, item.rect.width * 0.12)), y: item.rect.y + Math.min(24, Math.max(12, item.rect.height * 0.12)) },
                    { x: item.rect.x + 18, y: item.rect.y + 18 },
                    { x: item.rect.x + 24, y: item.rect.y + 24 },
                    { x: item.rect.x + 30, y: item.rect.y + 18 },
                ],
            }));
        `;
        const candidates = await page.evaluate((scriptSource) => {
            const fn = new Function(scriptSource);
            return fn();
        }, source).catch(() => []);

        for (const candidate of candidates as Array<{ rect: { x: number; y: number; width: number; height: number }; text: string; points: Array<{ x: number; y: number }> }>) {
            for (const point of candidate.points) {
                await page.mouse.move(point.x, point.y).catch(() => { });
                await page.waitForTimeout(80);
                await page.mouse.click(point.x, point.y).catch(() => { });
                await page.waitForTimeout(180);
                if (await confirmEnabled() || await selectionCountReady()) {
                    if (process.env.DEBUG_VIDEO === '1') {
                        console.log(`   🧪 媒体中心几何热区点击命中: (${Math.round(point.x)}, ${Math.round(point.y)}) rect=${JSON.stringify(candidate.rect)} text=${JSON.stringify(candidate.text.slice(0, 80))}`);
                    }
                    return true;
                }
            }
        }

        if (process.env.DEBUG_VIDEO === '1') {
            console.log(`   🧪 媒体中心几何 fallback 点击首卡: false`);
        }
        return false;
    };

    const confirmEnabled = async (): Promise<boolean> => {
        const confirmBtn = await pickNthVisible(
            scope.locator('button, [role="button"]').filter({ hasText: /^确定$|^确认$|^OK$/ }),
            0,
        );
        if (!confirmBtn) return false;
        return await confirmBtn.isEnabled().catch(async () => {
            const ariaDisabled = await confirmBtn.getAttribute('aria-disabled').catch(() => null);
            return ariaDisabled !== 'true';
        });
    };

    const selectionCountReady = async (): Promise<boolean> => {
        const countNode = await pickNthVisible(
            scope.locator('div, span, p').filter({ hasText: /已选择[:：]?\s*1|Selected[:：]?\s*1/i }),
            0,
        );
        return !!countNode;
    };

    const startedAt = Date.now();
    let emptyVisibleSince = 0;
    let clickedAllVideos = false;
    let searchedFolder = false;
    while (Date.now() - startedAt < 12000) {
        if (!searchedFolder) {
            await runFolderSearch();
            searchedFolder = true;
        }

        if (!clickedAllVideos) {
            const allVideos = await locateAllVideos();
            if (allVideos) {
                let openedAllVideos = await safeClick(allVideos, 1400);
                if (!openedAllVideos) {
                    openedAllVideos = await allVideos.click({ force: true, timeout: 1200 }).then(() => true).catch(() => false);
                }
                if (!openedAllVideos) {
                    openedAllVideos = await page.evaluate(() => {
                        const nodes = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], a, div, span')) as HTMLElement[];
                        const target = nodes.find((node) => /^(全部视频|All Videos)$/.test((node.textContent || '').trim()));
                        if (!target) return false;
                        target.click();
                        return true;
                    }).catch(() => false);
                }
                clickedAllVideos = openedAllVideos;
                if (openedAllVideos) {
                    await page.waitForTimeout(280);
                    await runFolderSearch();
                    searchedFolder = true;
                }
            }
        }

        const selectedCard = await locateSelectedCard();
        if (selectedCard) {
            await activateSelectedCard(selectedCard);
            await page.waitForTimeout(260);
            if (await confirmEnabled() || await selectionCountReady()) {
                console.log(`   → 媒体中心选中: ${spec.fileName}`);
                return 'selected';
            }
        }

        if (await clickCardCheckboxHotspotByTextPrefix()) {
            console.log(`   → 媒体中心选中(前缀热区): ${spec.fileName}`);
            return 'selected';
        }

        if (await clickMatchingCardByDom()) {
            await page.waitForTimeout(260);
            if (await confirmEnabled() || await selectionCountReady()) {
                console.log(`   → 媒体中心选中: ${spec.fileName}`);
                return 'selected';
            }
        }

        if (await clickFirstVisibleMediaTileByDom()) {
            await page.waitForTimeout(260);
            if (await confirmEnabled() || await selectionCountReady()) {
                console.log(`   → 媒体中心选中(首卡几何 fallback): ${spec.fileName}`);
                return 'selected';
            }
        }

        const empty = await emptyState();
        if (empty) {
            if (!emptyVisibleSince) emptyVisibleSince = Date.now();
            if (Date.now() - emptyVisibleSince >= 2500) {
                return 'empty';
            }
        } else {
            emptyVisibleSince = 0;
        }

        await page.waitForTimeout(250);
    }

    if (emptyVisibleSince) {
        return 'empty';
    }

    const allVideos = await locateAllVideos();
    if (allVideos && !clickedAllVideos) {
        let openedAllVideos = await safeClick(allVideos, 1400);
        if (!openedAllVideos) {
            openedAllVideos = await allVideos.click({ force: true, timeout: 1200 }).then(() => true).catch(() => false);
        }
        if (!openedAllVideos) {
            openedAllVideos = await page.evaluate(() => {
                const nodes = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], a, div, span')) as HTMLElement[];
                const target = nodes.find((node) => /全部视频|All Videos/i.test((node.textContent || '').trim()));
                if (!target) return false;
                target.click();
                return true;
            }).catch(() => false);
        }
        await page.waitForTimeout(220);
    }
    if (await emptyState()) return 'empty';
    return 'not_found';
}

async function uploadLocalVideoFile(page: Page, modal: Locator, spec: LocalVideoUploadSpec): Promise<boolean> {
    const fileInputs = modal.locator('input[type="file"]');
    if (await fileInputs.count().catch(() => 0)) {
        const directInput = fileInputs.first();
        await directInput.setInputFiles(spec.absolutePath);
        return true;
    }

    const uploadZone = await pickNthVisible(
        modal.locator('button, [role="button"], div, label, span').filter({ hasText: /点击此处或者将文件拖至此处|点击此处|拖至此处|上传/i }),
        0,
    );
    if (!uploadZone) return false;

    const chooserPromise = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
    await safeClick(uploadZone, 1400);
    const chooser = await chooserPromise;
    if (!chooser) return false;
    await chooser.setFiles(spec.absolutePath);
    return true;
}

async function locateVideoNameInput(modal: Locator): Promise<Locator | null> {
    const labeledInput = await pickNthVisible(
        modal.locator('label, div, span').filter({ hasText: /视频名称|Video Name/i }).locator('xpath=following::input[not(@type="file")][1]'),
        0,
    );
    if (labeledInput) return labeledInput;

    return await pickNthVisible(modal.locator('input:not([type="file"])'), 0);
}

async function waitForVideoUploadReady(
    page: Page,
    modal: Locator,
    spec: LocalVideoUploadSpec,
): Promise<{ ready: boolean; screenshotPath: string | null }> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180000) {
        const fileNameVisible = await modal.getByText(spec.fileName, { exact: false }).first()
            .isVisible({ timeout: 120 }).catch(() => false);
        const previewVisible = await modal.locator('video, [class*="video"], [class*="preview"]').first()
            .isVisible({ timeout: 120 }).catch(() => false);

        const nameInput = await locateVideoNameInput(modal);
        const nameValue = nameInput
            ? ((await nameInput.inputValue().catch(() => '')) || '').trim()
            : '';

        const confirmBtn = await pickNthVisible(
            modal.locator('button, [role="button"]').filter({ hasText: /^确定$|^确认$|^OK$/ }),
            0,
        );
        const confirmReady = confirmBtn
            ? await confirmBtn.isEnabled().catch(() => false)
            : false;

        if ((fileNameVisible || previewVisible || nameValue.includes(spec.stem)) && confirmReady) {
            return { ready: true, screenshotPath: null };
        }

        await randomDelay(500, 900);
    }

    const screenshotPath = await screenshot(page, 'video_upload_timeout').catch(() => null);
    return { ready: false, screenshotPath };
}

async function locateFinalVideoConfirmButton(page: Page, modal: Locator): Promise<Locator | null> {
    const pickBest = async (root: Locator): Promise<Locator | null> => {
        const candidates = root.locator('button, [role="button"], div, span').filter({ hasText: /^确定$|^确认$|^OK$/ });
        const total = await candidates.count().catch(() => 0);
        let best: { locator: Locator; enabled: boolean; x: number; y: number } | null = null;

        for (let i = 0; i < Math.min(total, 20); i++) {
            let candidate = candidates.nth(i);
            if (!await candidate.isVisible({ timeout: 120 }).catch(() => false)) continue;

            let box = await candidate.boundingBox().catch(() => null);
            if (!box || box.width < 20 || box.height < 12) {
                const ancestor = candidate.locator('xpath=ancestor-or-self::*[self::button or @role="button" or self::div or self::span][1]').first();
                if (await ancestor.count().catch(() => 0)) {
                    candidate = ancestor;
                    box = await candidate.boundingBox().catch(() => null);
                }
            }
            if (!box) continue;

            const enabled = await candidate.isEnabled().catch(async () => {
                const disabled = await candidate.getAttribute('disabled').catch(() => null);
                const ariaDisabled = await candidate.getAttribute('aria-disabled').catch(() => null);
                return !disabled && ariaDisabled !== 'true';
            });
            if (!best || Number(enabled) > Number(best.enabled) || (enabled === best.enabled && (box.y > best.y || (Math.abs(box.y - best.y) < 8 && box.x > best.x)))) {
                best = { locator: candidate, enabled, x: box.x, y: box.y };
            }
        }
        return best?.locator ?? null;
    };

    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
        const best = (
            await pickBest(modal) ||
            await pickBest(page.locator('body'))
        );
        if (best) return best;
        await page.waitForTimeout(250);
    }

    return null;
}

async function clickVideoConfirmGeometryFallback(page: Page, modal: Locator): Promise<boolean> {
    const box = await modal.boundingBox().catch(() => null);
    const clickPoints = async (
        points: Array<{ x: number; y: number; label?: string }>,
        logPrefix: string,
    ): Promise<boolean> => {
        for (const point of points) {
            await page.mouse.move(point.x, point.y).catch(() => { });
            await page.waitForTimeout(80);
            await page.mouse.click(point.x, point.y).catch(() => { });
            await page.waitForTimeout(220);
            const hidden = !await modal.isVisible().catch(() => true);
            if (hidden) {
                if (process.env.DEBUG_VIDEO === '1') {
                    const extra = point.label ? ` ${point.label}` : '';
                    console.log(`   🧪 ${logPrefix} 命中: (${Math.round(point.x)}, ${Math.round(point.y)})${extra}`);
                }
                return true;
            }
        }
        return false;
    };

    if (box) {
        const modalPoints = [
            { x: box.x + box.width - 64, y: box.y + box.height - 36 },
            { x: box.x + box.width - 92, y: box.y + box.height - 36 },
            { x: box.x + box.width - 64, y: box.y + box.height - 52 },
            { x: box.x + box.width - 48, y: box.y + box.height - 36 },
        ];
        if (await clickPoints(modalPoints, '视频确认模态几何 fallback')) {
            return true;
        }
    }

    const pageLevelCandidates = await page.evaluate(() => {
        const isVisible = (node: Element | null): node is HTMLElement => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.pointerEvents !== 'none' &&
                rect.width > 0 &&
                rect.height > 0
            );
        };

        const isEnabled = (node: HTMLElement): boolean => {
            const ariaDisabled = node.getAttribute('aria-disabled');
            const disabled = node.getAttribute('disabled');
            return ariaDisabled !== 'true' && disabled == null;
        };

        const blueishScore = (value: string): number => {
            const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (!match) return 0;
            const r = Number(match[1]);
            const g = Number(match[2]);
            const b = Number(match[3]);
            return b > 160 && b > r + 20 && b > g + 10 ? 1 : 0;
        };

        const viewportLeft = window.innerWidth * 0.45;
        const viewportTop = window.innerHeight * 0.45;
        const candidates: Array<{
            x: number;
            y: number;
            rect: { x: number; y: number; width: number; height: number };
            score: number;
            text: string;
            label: string;
        }> = [];
        const seen = new Set<string>();

        const pushCandidate = (node: HTMLElement, source: string) => {
            if (!isVisible(node)) return;
            const rect = node.getBoundingClientRect();
            if (rect.left < viewportLeft || rect.top < viewportTop) return;
            if (rect.width < 36 || rect.width > 260 || rect.height < 24 || rect.height > 120) return;

            const text = (node.textContent || '').replace(/\s+/g, '').trim();
            if (/取消|Cancel/i.test(text)) return;

            const style = window.getComputedStyle(node);
            const className = String(node.className || '');
            const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
            if (seen.has(key)) return;
            seen.add(key);

            let score = 0;
            if (/确定|确认|OK/i.test(text)) score += 200;
            if (isEnabled(node)) score += 40;
            if (/primary|confirm|ok|submit|btn-primary/i.test(className)) score += 40;
            score += blueishScore(style.backgroundColor) * 40;
            score += blueishScore(style.borderColor) * 10;
            score += Math.round(rect.left / 10) + Math.round(rect.top / 10);

            candidates.push({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
                score,
                text,
                label: source,
            });
        };

        const roots = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'))
            .filter((node): node is HTMLElement => node instanceof HTMLElement);
        for (const node of roots) {
            pushCandidate(node, 'node');
            let parent = node.parentElement;
            for (let depth = 0; depth < 2 && parent; depth++, parent = parent.parentElement) {
                pushCandidate(parent, 'ancestor');
            }
        }

        const hotspotPoints: Array<{ x: number; y: number; label: string }> = [];
        const xOffsets = [80, 140, 220, 320, 420, 520];
        const yOffsets = [40, 58, 76, 96, 118, 142];
        for (const xOffset of xOffsets) {
            for (const yOffset of yOffsets) {
                hotspotPoints.push({
                    x: window.innerWidth - xOffset,
                    y: window.innerHeight - yOffset,
                    label: `viewport-grid-${xOffset}-${yOffset}`,
                });
            }
        }
        for (const point of hotspotPoints) {
            const stack = document.elementsFromPoint(point.x, point.y);
            for (const element of stack) {
                if (!(element instanceof HTMLElement)) continue;
                pushCandidate(element, point.label);
                let parent = element.parentElement;
                for (let depth = 0; depth < 2 && parent; depth++, parent = parent.parentElement) {
                    pushCandidate(parent, `${point.label}-ancestor`);
                }
            }
        }

        return candidates
            .sort((a, b) => (b.score - a.score) || (b.rect.y - a.rect.y) || (b.rect.x - a.rect.x))
            .slice(0, 8);
    }).catch(() => []);

    const pagePoints: Array<{ x: number; y: number; label?: string }> = [];
    for (const candidate of pageLevelCandidates as Array<{ x: number; y: number; rect: { x: number; y: number; width: number; height: number }; text: string; label: string }>) {
        pagePoints.push(
            { x: candidate.x, y: candidate.y, label: `${candidate.label}:${candidate.text}` },
            { x: candidate.rect.x + candidate.rect.width - 18, y: candidate.rect.y + candidate.rect.height / 2, label: `${candidate.label}:right-edge` },
            { x: candidate.rect.x + candidate.rect.width / 2, y: candidate.rect.y + Math.max(12, candidate.rect.height * 0.35), label: `${candidate.label}:upper-mid` },
        );
    }
    if (process.env.DEBUG_VIDEO === '1') {
        console.log(`   🧪 视频确认页面候选: ${JSON.stringify((pageLevelCandidates as Array<{ x: number; y: number; rect: { x: number; y: number; width: number; height: number }; text: string; label: string }>).map((candidate) => ({
            x: Math.round(candidate.x),
            y: Math.round(candidate.y),
            rect: {
                x: Math.round(candidate.rect.x),
                y: Math.round(candidate.rect.y),
                width: Math.round(candidate.rect.width),
                height: Math.round(candidate.rect.height),
            },
            text: candidate.text,
            label: candidate.label,
        })))}`);
    }
    if (await clickPoints(pagePoints, '视频确认页面级 fallback')) {
        return true;
    }

    const viewport = page.viewportSize() || await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    })).catch(() => null);
    if (viewport) {
        const bruteForcePoints: Array<{ x: number; y: number; label?: string }> = [];
        const xOffsets = [80, 140, 220, 320, 420];
        const yOffsets = [40, 58, 76, 96, 118];
        for (const xOffset of xOffsets) {
            for (const yOffset of yOffsets) {
                bruteForcePoints.push({
                    x: viewport.width - xOffset,
                    y: viewport.height - yOffset,
                    label: `grid-${xOffset}-${yOffset}`,
                });
            }
        }
        if (await clickPoints(bruteForcePoints, '视频确认右下角网格 fallback')) {
            return true;
        }
    }

    if (process.env.DEBUG_VIDEO === '1') {
        console.log('   🧪 视频确认几何 fallback 点击: false');
    }
    return false;
}

export async function fillVideo(page: Page, data: ProductData): Promise<ModuleExecutionResult> {
    console.log('\n🎬 模块 1e: 商品视频...');

    if (!data.video_file || data.video_file.trim() === '') {
        console.log('   ⏭️  无视频数据');
        return autoModuleExecutionResult('video_skipped_empty');
    }
    const selectionSpec = resolveVideoSelectionSpec(data.video_file);
    if (!selectionSpec) {
        console.log(`   ⚠️  视频标识解析失败，转人工: ${data.video_file}`);
        return manualGateModuleExecutionResult('video_selection_spec_invalid');
    }
    const videoSelectionMode = data.video_selection_mode || 'auto';
    const localSpec = selectionSpec.hasLocalFile
        ? {
            absolutePath: selectionSpec.absolutePath!,
            fileName: selectionSpec.fileName,
            stem: selectionSpec.stem,
        }
        : null;
    const manualGate = async (
        evidence: string | string[],
        screenshotName?: string,
        screenshotPath?: string | null,
    ): Promise<ModuleExecutionResult> => {
        let resolvedScreenshotPath = screenshotPath || null;
        if (!resolvedScreenshotPath && screenshotName) {
            resolvedScreenshotPath = await screenshot(page, screenshotName).catch(() => null);
        }
        return manualGateModuleExecutionResult(evidence, resolvedScreenshotPath ? [resolvedScreenshotPath] : []);
    };

    const uploadBtn = await locateVideoUploadButton(page);
    if (!uploadBtn) {
        console.log('   ⚠️  未找到视频上传按钮，转人工');
        return await manualGate('video_upload_button_missing', 'video_upload_button_missing');
    }

    await uploadBtn.scrollIntoViewIfNeeded().catch(() => { });
    const opened = await safeClick(uploadBtn, 1600);
    if (!opened) {
        console.log('   ⚠️  视频上传弹窗未打开，转人工');
        return await manualGate('video_modal_open_failed', 'video_modal_open_failed');
    }

    const modal = await waitForVideoModal(page);
    if (!modal) {
        console.log('   ⚠️  未检测到视频上传弹窗，转人工');
        return await manualGate('video_modal_missing', 'video_modal_missing');
    }

    const mediaCenterResult = await selectVideoFromMediaCenter(page, modal, selectionSpec);
    if (mediaCenterResult === 'selected') {
        console.log(`   → 媒体中心选择: ${selectionSpec.fileName}`);
    } else if (videoSelectionMode === 'media_center') {
        if (mediaCenterResult === 'empty') {
            console.log('   ⚠️  媒体中心为空，请先把视频上传到平台服务器');
            return await manualGate('video_media_center_empty', 'video_media_center_empty');
        } else {
            console.log(`   ⚠️  媒体中心未命中，且当前模式禁止回退本地上传: ${selectionSpec.fileName}`);
            return await manualGate('video_media_center_required', 'video_media_center_required');
        }
    } else if (localSpec) {
        await switchVideoModalToLocalUpload(page, modal);

        const uploaded = await uploadLocalVideoFile(page, modal, localSpec);
        if (!uploaded) {
            console.log('   ⚠️  本地视频文件未能注入上传控件，转人工');
            return await manualGate('video_local_upload_missing_input', 'video_local_upload_missing_input');
        }

        console.log(`   → 本地上传: ${localSpec.fileName}`);
        const readyState = await waitForVideoUploadReady(page, modal, localSpec);
        if (!readyState.ready) {
            console.log(`   ⚠️  视频上传超时，转人工: ${localSpec.fileName}`);
            return await manualGate('video_upload_timeout', undefined, readyState.screenshotPath);
        }
    } else {
        console.log(`   ⚠️  媒体中心未命中，且本地文件不可用，转人工: ${selectionSpec.fileName}`);
        return await manualGate('video_media_center_missing_item', 'video_media_center_missing_item');
    }

    await page.mouse.move(40, 40).catch(() => { });
    await page.waitForTimeout(450);

    const confirmBtn = await locateFinalVideoConfirmButton(page, modal);
    let confirmed = false;
    if (confirmBtn) {
        await confirmBtn.scrollIntoViewIfNeeded().catch(() => { });
        confirmed = await safeClick(confirmBtn, 1600);
        if (confirmed) {
            await page.waitForTimeout(220);
        }
    }

    if (!confirmed) {
        confirmed = await clickVideoConfirmGeometryFallback(page, modal);
    }

    if (!confirmed) {
        console.log('   ⚠️  未命中视频最终确认按钮，转人工');
        return await manualGate('video_confirm_button_missing', 'video_confirm_button_missing');
    }

    const modalHidden = await page.waitForFunction(() => {
        const visible = (el: Element | null): el is HTMLElement => {
            if (!(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && style.opacity !== '0'
                && rect.width > 0
                && rect.height > 0;
        };

        return !Array.from(document.querySelectorAll('div, section, article')).some((el) => {
            if (!visible(el)) return false;
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            return /选择视频/i.test(text) && /媒体中心|本地上传|视频文件/i.test(text);
        });
    }, { timeout: 5000 }).then(() => true).catch(() => false);

    if (!modalHidden) {
        console.log('   ⚠️  视频确认后弹窗仍未关闭，转人工');
        return await manualGate('video_confirm_modal_still_open', 'video_confirm_modal_still_open');
    }

    const bindingState = await waitForProductVideoBinding(page, selectionSpec.fileName);
    if (!bindingState.bound) {
        console.log(`   ⚠️  视频弹窗已关闭但商品视频区未回写，转人工: ${bindingState.evidence}`);
        return await manualGate('video_confirm_writeback_missing', 'video_confirm_writeback_missing');
    }

    console.log(`   ✅ 视频上传完成: ${selectionSpec.fileName}`);
    return autoModuleExecutionResult('video_flow_completed');
}
