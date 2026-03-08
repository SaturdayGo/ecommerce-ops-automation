/**
 * safe-click.ts — 渐进式降级点击模块 (Phase 2 核心)
 * 
 * 设计理念 (来自混合架构 implementation_plan.md):
 *   Level 1: 标准 Playwright DOM click — 最快, 但容易被拦截
 *   Level 2: BoundingBox 物理坐标点击 — 模拟真实鼠标移动轨迹
 *   Level 3: (未来) CV 视觉模板匹配 — 纯屏幕截图找图
 * 
 * 本模块实现 Level 1 → Level 2 的自动降级。
 * 所有鼠标移动均附带贝塞尔曲线 (Bézier) 轨迹 + 随机抖动，
 * 模拟人类操作，降低被风控识别为机器行为的概率。
 * 
 * 用法:
 *   import { safeClick, safeClickByText, humanMouseMove } from './safe-click';
 *   await safeClick(page, '#submit-btn');
 *   await safeClickByText(page, '确认');
 */

import type { Page, Locator } from 'playwright';

// ============================================================
// 工具函数: 贝塞尔曲线与随机抖动
// ============================================================

/** 生成一个在 [min, max] 之间的随机数 */
function rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/**
 * 三次贝塞尔曲线插值 (Cubic Bézier)
 * t ∈ [0, 1], P0 → P3
 */
function cubicBezier(
    t: number,
    p0: number, p1: number, p2: number, p3: number
): number {
    const u = 1 - t;
    return u * u * u * p0 +
        3 * u * u * t * p1 +
        3 * u * t * t * p2 +
        t * t * t * p3;
}

/**
 * 生成从 (x0, y0) 到 (x1, y1) 的人类模拟鼠标轨迹点
 * 
 * 使用贝塞尔曲线 + 微小随机偏移，让轨迹看起来像人手滑动鼠标。
 * steps 越多轨迹越细腻（但也越慢）。
 */
function generateHumanPath(
    x0: number, y0: number,
    x1: number, y1: number,
    steps: number = 20
): Array<{ x: number; y: number }> {
    // 随机生成两个控制点，制造弧度
    const cpX1 = x0 + (x1 - x0) * rand(0.2, 0.5) + rand(-30, 30);
    const cpY1 = y0 + (y1 - y0) * rand(0.1, 0.4) + rand(-30, 30);
    const cpX2 = x0 + (x1 - x0) * rand(0.5, 0.8) + rand(-20, 20);
    const cpY2 = y0 + (y1 - y0) * rand(0.6, 0.9) + rand(-20, 20);

    const path: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // 非线性时间分布: 开始慢 → 中间快 → 结束慢 (模拟人手加减速)
        const easedT = t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const x = cubicBezier(easedT, x0, cpX1, cpX2, x1) + rand(-1.5, 1.5);
        const y = cubicBezier(easedT, y0, cpY1, cpY2, y1) + rand(-1.5, 1.5);
        path.push({ x: Math.round(x), y: Math.round(y) });
    }
    return path;
}

// ============================================================
// 核心 API
// ============================================================

export interface SafeClickOptions {
    /** 超时时间 (ms)，Level 1 等待元素的超时 */
    timeout?: number;
    /** 点击前的额外等待 (ms) */
    delayBefore?: number;
    /** 点击后的额外等待 (ms) */
    delayAfter?: number;
    /** 是否强制使用 Level 2 (跳过 Level 1 DOM 点击) */
    forcePhysical?: boolean;
    /** 日志前缀 */
    label?: string;
}

const DEFAULT_OPTIONS: Required<SafeClickOptions> = {
    timeout: 5000,
    delayBefore: 0,
    delayAfter: 200,
    forcePhysical: false,
    label: '',
};

/**
 * 模拟人类鼠标移动到目标坐标
 * 
 * 公开此函数以用于非点击场景（如拖拽前的移动）。
 */
export async function humanMouseMove(
    page: Page,
    targetX: number,
    targetY: number,
    options?: { steps?: number }
): Promise<void> {
    // 获取当前鼠标位置 (Playwright 没有直接 API，我们用 viewport 中心作为起点估算)
    const viewport = page.viewportSize();
    const startX = viewport ? viewport.width / 2 : 500;
    const startY = viewport ? viewport.height / 2 : 400;

    const path = generateHumanPath(startX, startY, targetX, targetY, options?.steps ?? 18);

    for (const point of path) {
        await page.mouse.move(point.x, point.y);
        // 每步之间加一个微小的随机延迟 (5-15ms)
        await page.waitForTimeout(Math.floor(rand(5, 15)));
    }
}

/**
 * 渐进式安全点击 — 接受 CSS/XPath/Text 选择器
 * 
 * 1. Level 1: 尝试 Playwright 原生 locator.click()
 * 2. Level 2: 获取 BoundingBox → 人类鼠标曲线移动 → 物理点击
 * 
 * @returns 实际使用的方式 ('dom' | 'physical')
 */
export async function safeClick(
    page: Page,
    selector: string,
    options?: SafeClickOptions
): Promise<'dom' | 'physical'> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const prefix = opts.label ? `[${opts.label}] ` : '';
    const locator = page.locator(selector).first();

    // ---- Level 1: 标准 DOM 点击 ----
    if (!opts.forcePhysical) {
        try {
            await locator.waitFor({ state: 'visible', timeout: opts.timeout });
            if (opts.delayBefore > 0) await page.waitForTimeout(opts.delayBefore);
            await locator.click({ timeout: 3000 });
            if (opts.delayAfter > 0) await page.waitForTimeout(opts.delayAfter);
            console.log(`   ${prefix}✅ Level 1 DOM 点击成功: ${selector}`);
            return 'dom';
        } catch (e) {
            console.log(`   ${prefix}⚠️  Level 1 失败，降级到 Level 2 物理点击...`);
        }
    }

    // ---- Level 2: BoundingBox + 物理鼠标 ----
    try {
        await locator.waitFor({ state: 'attached', timeout: opts.timeout });

        // 先滚动到可见区域
        await locator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        const box = await locator.boundingBox();
        if (!box) {
            throw new Error(`无法获取 BoundingBox: ${selector}`);
        }

        // 计算目标点: 元素中心 + 随机偏移 (不完全点在正中心，更像人类)
        const targetX = box.x + box.width / 2 + rand(-box.width * 0.15, box.width * 0.15);
        const targetY = box.y + box.height / 2 + rand(-box.height * 0.15, box.height * 0.15);

        if (opts.delayBefore > 0) await page.waitForTimeout(opts.delayBefore);

        // 人类轨迹移动
        await humanMouseMove(page, targetX, targetY);

        // 短暂悬停 (模拟人看到了按钮后犹豫一下)
        await page.waitForTimeout(Math.floor(rand(50, 200)));

        // 物理点击: mousedown → 短延迟 → mouseup
        await page.mouse.down();
        await page.waitForTimeout(Math.floor(rand(30, 80)));
        await page.mouse.up();

        if (opts.delayAfter > 0) await page.waitForTimeout(opts.delayAfter);
        console.log(`   ${prefix}✅ Level 2 物理点击成功: ${selector} @ (${Math.round(targetX)}, ${Math.round(targetY)})`);
        return 'physical';
    } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        console.error(`   ${prefix}❌ Level 1+2 均失败: ${selector} — ${err}`);
        throw e;
    }
}

/**
 * 渐进式安全点击 — 接受 Locator 对象
 * 
 * 当你已经有一个 Playwright Locator 时使用此方法
 */
export async function safeClickLocator(
    page: Page,
    locator: Locator,
    options?: SafeClickOptions
): Promise<'dom' | 'physical'> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const prefix = opts.label ? `[${opts.label}] ` : '';

    // ---- Level 1 ----
    if (!opts.forcePhysical) {
        try {
            await locator.waitFor({ state: 'visible', timeout: opts.timeout });
            if (opts.delayBefore > 0) await page.waitForTimeout(opts.delayBefore);
            await locator.click({ timeout: 3000 });
            if (opts.delayAfter > 0) await page.waitForTimeout(opts.delayAfter);
            console.log(`   ${prefix}✅ Level 1 DOM 点击成功`);
            return 'dom';
        } catch {
            console.log(`   ${prefix}⚠️  Level 1 失败，降级到 Level 2...`);
        }
    }

    // ---- Level 2 ----
    try {
        await locator.waitFor({ state: 'attached', timeout: opts.timeout });
        await locator.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);

        const box = await locator.boundingBox();
        if (!box) throw new Error('无法获取 BoundingBox');

        const targetX = box.x + box.width / 2 + rand(-box.width * 0.15, box.width * 0.15);
        const targetY = box.y + box.height / 2 + rand(-box.height * 0.15, box.height * 0.15);

        if (opts.delayBefore > 0) await page.waitForTimeout(opts.delayBefore);
        await humanMouseMove(page, targetX, targetY);
        await page.waitForTimeout(Math.floor(rand(50, 200)));
        await page.mouse.down();
        await page.waitForTimeout(Math.floor(rand(30, 80)));
        await page.mouse.up();
        if (opts.delayAfter > 0) await page.waitForTimeout(opts.delayAfter);

        console.log(`   ${prefix}✅ Level 2 物理点击成功 @ (${Math.round(targetX)}, ${Math.round(targetY)})`);
        return 'physical';
    } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        console.error(`   ${prefix}❌ Level 1+2 均失败 — ${err}`);
        throw e;
    }
}

/**
 * 按文本内容安全点击 — 快捷方法
 * 
 * 示例: await safeClickByText(page, '确认')
 */
export async function safeClickByText(
    page: Page,
    text: string,
    options?: SafeClickOptions
): Promise<'dom' | 'physical'> {
    return safeClick(page, `text="${text}"`, {
        label: text,
        ...options,
    });
}

/**
 * 尝试在多个选择器中逐一点击第一个可见的
 * 
 * 替代 test-carousel.ts 中大量重复的 for-loop 探针代码。
 * 
 * @returns 点击成功的选择器，全部失败则返回 null
 */
export async function safeClickFirst(
    page: Page,
    selectors: string[],
    options?: SafeClickOptions
): Promise<string | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const prefix = opts.label ? `[${opts.label}] ` : '';

    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();
            const visible = await locator.isVisible().catch(() => false);
            if (!visible) continue;

            await safeClickLocator(page, locator, { ...opts, timeout: 3000 });
            console.log(`   ${prefix}✅ 从 ${selectors.length} 个候选中命中: ${selector}`);
            return selector;
        } catch {
            continue;
        }
    }

    console.log(`   ${prefix}❌ ${selectors.length} 个选择器全部失败`);
    return null;
}

/**
 * 人类模拟输入文本 — 逐字符输入，带随机间隔
 * 
 * 比 locator.fill() 更接近真人打字。
 */
export async function humanType(
    page: Page,
    selector: string,
    text: string,
    options?: { clearFirst?: boolean; label?: string }
): Promise<void> {
    const prefix = options?.label ? `[${options.label}] ` : '';
    const locator = page.locator(selector).first();

    await locator.waitFor({ state: 'visible', timeout: 5000 });
    await locator.click();

    if (options?.clearFirst) {
        // 全选并清除
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
    }

    for (const char of text) {
        await page.keyboard.type(char, { delay: Math.floor(rand(30, 120)) });
    }

    console.log(`   ${prefix}✅ 已输入 ${text.length} 个字符`);
}
