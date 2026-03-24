import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

const STORAGE_PATH = path.resolve(__dirname, '../.auth/storage-state.json');
const ALIEXPRESS_LOGIN_URL = 'https://login.aliexpress.com/user/seller/login?bizSegment=CSP&_lang=zh_CN';
const ALIEXPRESS_PUBLISH_URL = 'https://csp.aliexpress.com/m_apps/product-publish-v2/pop';
const ALIEXPRESS_PUBLISH_URL_FALLBACK = 'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639';
const LEGACY_PUBLISH_PATH_MARKER = '/ait/cn_pop/item_product/product_publish';
const MODERN_PUBLISH_PATH_MARKER = '/m_apps/product-publish-v2/pop';

const USER_DATA_DIR = path.resolve(__dirname, '../.auth/chrome-profile');

interface ChromeFrontWindowState {
    title: string;
    url: string;
}

interface VisibilityDeps {
    activateChrome?: () => Promise<void> | void;
    getFrontChromeWindow?: () => Promise<ChromeFrontWindowState | null> | ChromeFrontWindowState | null;
}

function writeBrowserLaunchMarker(): void {
    const markerPath = process.env.AUTOMATION_TEST_BROWSER_LAUNCH_MARKER?.trim();
    if (!markerPath) return;

    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, new Date().toISOString() + '\n', 'utf8');
}

// ============================================================
// 浏览器管理
// ============================================================

/**
 * 清理上次崩溃留下的残留文件和进程
 */
function cleanupChromeProfile(userDataDir: string): void {
    // 删除 SingletonLock (上次 Chrome 崩溃时的残留)
    const lockFile = path.join(userDataDir, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
        try {
            fs.unlinkSync(lockFile);
            console.log('🧹 已清理残留的 SingletonLock 文件');
        } catch (e) {
            console.log(`⚠️  无法删除 SingletonLock: ${e}`);
        }
    }

    // 杀掉使用同一 user-data-dir 的残留 Chrome 进程
    try {
        const result = execSync(
            `ps aux | grep "[c]hrome-profile" | grep -v grep | awk '{print $2}'`,
            { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        if (result) {
            const pids = result.split('\n').filter(Boolean);
            console.log(`🧹 发现 ${pids.length} 个残留 Chrome 进程，正在清理...`);
            for (const pid of pids) {
                try { execSync(`kill -9 ${pid}`, { timeout: 3000 }); } catch { /* ignore */ }
            }
            // 等进程释放
            execSync('sleep 1', { timeout: 3000 });
        }
    } catch { /* no orphans, fine */ }
}

/**
 * 启动浏览器 — 使用系统 Chrome + 独立用户数据目录
 * 
 * 每次启动前自动清理残留的 SingletonLock 和僵尸进程。
 * 使用系统 Chrome (channel: 'chrome') 减少被反爬检测的概率。
 */
export async function launchBrowser(options: { recordVideoDir?: string } = {}): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    console.log('🌐 正在启动独立配置的系统 Chrome...');
    writeBrowserLaunchMarker();

    if (!fs.existsSync(USER_DATA_DIR)) {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    // 启动前清理残留
    cleanupChromeProfile(USER_DATA_DIR);

    try {
        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            channel: 'chrome',
            headless: false,
            slowMo: 100,
            viewport: null,
            recordVideo: options.recordVideoDir ? { dir: options.recordVideoDir } : undefined,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--start-maximized'
            ]
        });

        const browser = context.browser() as Browser || { close: () => context.close() };
        const pages = context.pages();
        const page = pages.length > 0 ? pages[0] : await context.newPage();

        console.log('✅ 独立 Chrome 启动成功');
        return { browser, context, page };
    } catch (error) {
        console.error('❌ 启动失败:', error instanceof Error ? error.message.split('\n')[0] : error);

        // 如果还是 SingletonLock 问题,说明用户的 Chrome 主进程占用了
        if (String(error).includes('ProcessSingleton')) {
            console.log('');
            console.log('⚠️  你的 Chrome 浏览器正在运行，和自动化脚本冲突了。');
            console.log('   请 Command+Q 完全退出 Chrome，然后重新运行脚本。');
            console.log('   (脚本会启动一个独立的 Chrome 窗口，不影响你的书签和密码)');
            console.log('');
        }
        throw error;
    }
}

function isPublishWindowUrl(url: string): boolean {
    return url.includes('aliexpress.com')
        && (
            isLegacyPublishUrl(url)
            || isModernPublishUrl(url)
            || url.includes('product_publish')
        );
}

async function activateChromeApp(): Promise<void> {
    if (process.platform !== 'darwin') return;
    try {
        execSync(`osascript -e 'tell application "Google Chrome" to activate'`, {
            stdio: 'ignore',
            timeout: 5000,
        });
    } catch {
        // Ignore activation failures; visibility gate below will catch mismatch.
    }
}

async function getFrontChromeWindowState(): Promise<ChromeFrontWindowState | null> {
    if (process.platform !== 'darwin') return null;
    try {
        const output = execSync(
            `osascript -e 'tell application "Google Chrome" to if (count of windows) is 0 then return ""' ` +
            `-e 'tell application "Google Chrome" to return (title of active tab of front window) & linefeed & (URL of active tab of front window)'`,
            { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        if (!output) return null;
        const [title, url] = output.split('\n');
        if (!url) return null;
        return {
            title: title?.trim() || '',
            url: url.trim(),
        };
    } catch {
        return null;
    }
}

async function sleep(waitMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
}

export async function ensureAutomationPageVisible(
    page: Page,
    options: {
        attempts?: number;
        waitMs?: number;
        deps?: VisibilityDeps;
    } = {},
): Promise<void> {
    const attempts = options.attempts ?? 4;
    const waitMs = options.waitMs ?? 500;
    const activateChrome = options.deps?.activateChrome ?? activateChromeApp;
    const getFrontChromeWindow = options.deps?.getFrontChromeWindow ?? getFrontChromeWindowState;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await page.bringToFront().catch(() => { });
        await page.evaluate(() => { window.focus(); }).catch(() => { });
        await activateChrome();

        const frontWindow = await getFrontChromeWindow();
        if (frontWindow && isPublishWindowUrl(frontWindow.url)) {
            console.log(`👁️  前台可视校验通过: ${frontWindow.title || frontWindow.url}`);
            return;
        }

        if (attempt < attempts) {
            await sleep(waitMs);
        }
    }

    const frontWindow = await getFrontChromeWindow();
    const debugLabel = frontWindow
        ? `${frontWindow.title || '(无标题)'} | ${frontWindow.url}`
        : 'front-window-unavailable';
    throw new Error(`Automation page not visible in front Chrome window: ${debugLabel}`);
}

/**
 * 保存当前 cookie / localStorage / sessionStorage
 */
export async function saveAuth(context: BrowserContext): Promise<void> {
    const dir = path.dirname(STORAGE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    await context.storageState({ path: STORAGE_PATH });
    console.log('💾 登录状态已保存');
}

export type PublishPageState = 'publish' | 'login';

function isLegacyPublishUrl(url: string): boolean {
    return url.includes(LEGACY_PUBLISH_PATH_MARKER);
}

function isModernPublishUrl(url: string): boolean {
    return url.includes(MODERN_PUBLISH_PATH_MARKER);
}

function parseUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

function isSellerWorkbenchUrl(url: string): boolean {
    const parsed = parseUrl(url);
    return parsed?.hostname === 'csp.aliexpress.com';
}

async function waitForPublishFormReady(page: Page, timeoutMs: number = 25000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const hasMarker = await page.locator(
            'text=基本信息, text=商品标题, text=商品图片, text=类目, text=SKU价格与库存, text=SKU Price & Inventory'
        ).first().isVisible({ timeout: 600 }).catch(() => false);
        if (hasMarker) return true;

        // 有时页面只渲染顶栏，主内容尚未注入；检测主容器是否空白
        const hasEnoughDom = await page.evaluate(() => {
            const bodyText = (document.body?.innerText || '').trim();
            const bodyNodes = document.body?.querySelectorAll('*')?.length || 0;
            return bodyNodes > 80 && bodyText.length > 30;
        }).catch(() => false);
        if (hasEnoughDom) {
            const hasFormLikeInput = await page.locator(
                'input[placeholder*="标题"], input[placeholder*="类目"], input[name="title"], input[placeholder*="商品名称关键词"]'
            ).first().isVisible({ timeout: 600 }).catch(() => false);
            if (hasFormLikeInput) return true;
        }

        await page.waitForTimeout(800);
    }
    return false;
}

async function detectLoginGate(page: Page): Promise<boolean> {
    const currentUrl = page.url();
    if (
        currentUrl.includes('login.aliexpress.com')
        || currentUrl.includes('passport.aliexpress.com')
        || currentUrl.includes('/user/seller/login')
    ) {
        return true;
    }

    return await page.locator('input[type="password"]').isVisible({ timeout: 500 }).catch(() => false);
}

/**
 * 导航到商品发布页，返回当前页面状态
 * 
 * 判断逻辑:
 *   - URL 在 csp.aliexpress.com → 'publish' (等几秒让页面稳定)
 *   - URL 在 login / passport → 'login'
 *   - 其它 → 等待最多 30s
 */
export async function navigateToPublishPage(page: Page): Promise<PublishPageState> {
    console.log('📄 正在打开商品发布页...');
    console.log(`   目标: ${ALIEXPRESS_PUBLISH_URL}`);

    // 用 domcontentloaded，不等网络空闲 (AliExpress 的页面永远有后台请求)
    try {
        await page.goto(ALIEXPRESS_PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
        console.log(`   ⚠️  goto 超时，继续检测页面状态...`);
    }

    const deadline = Date.now() + 30000; // 最多等 30s
    let lastUrl = '';
    while (Date.now() < deadline) {
        const currentUrl = page.url();
        if (currentUrl !== lastUrl) {
            console.log(`   📍 当前 URL: ${currentUrl.substring(0, 100)}`);
            lastUrl = currentUrl;
        }

        // ✅ 已到达卖家后台 (csp.aliexpress.com)
        if (isSellerWorkbenchUrl(currentUrl)) {
            console.log('   ⏳ 已到达卖家后台，等待发布表单渲染...');
            const ready = await waitForPublishFormReady(page, 20000);
            if (ready && isLegacyPublishUrl(currentUrl)) {
                console.log('✅ 商品发布页已就绪');
                return 'publish';
            }

            if (ready && isModernPublishUrl(currentUrl)) {
                console.log('   ↪️  命中新前端壳页，强制切到 legacy 发布页...');
            }

            // 回退路径：有时 m_apps 壳页会卡空白，直接跳转到稳定的 ait 发布页
            console.log('   ↪️  表单未渲染，尝试切到 fallback 发布页...');
            await page.goto(ALIEXPRESS_PUBLISH_URL_FALLBACK, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { });
            const fallbackReady = await waitForPublishFormReady(page, 25000);
            if (fallbackReady) {
                console.log('✅ fallback 发布页已就绪');
                return 'publish';
            }
            if (await detectLoginGate(page)) {
                console.log('🔐 fallback 跳转后检测到登录页');
                return 'login';
            }

            // 最后兜底：刷新当前页再等一次
            console.log('   ↪️  fallback 仍未就绪，刷新重试一次...');
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => { });
            const reloadReady = await waitForPublishFormReady(page, 15000);
            if (reloadReady) {
                console.log('✅ 刷新后发布页已就绪');
                return 'publish';
            }
            if (await detectLoginGate(page)) {
                console.log('🔐 刷新后检测到登录页');
                return 'login';
            }
            throw new Error(`发布页未就绪：未检测到发布表单，当前 URL = ${page.url()}`);
        }

        // 🔐 被重定向到登录页
        if (currentUrl.includes('login.aliexpress.com')
            || currentUrl.includes('passport.aliexpress.com')
            || currentUrl.includes('/user/seller/login')) {
            console.log(`🔐 被重定向到登录页`);
            return 'login';
        }

        // 也检查页面内容 (某些登录页 URL 不含 login)
        const hasLoginForm = await page.locator('input[type="password"]').isVisible({ timeout: 500 }).catch(() => false);
        if (hasLoginForm) {
            console.log(`🔐 检测到登录表单`);
            return 'login';
        }

        await page.waitForTimeout(1000);
    }

    // 超时 — 最后一次检测
    const finalUrl = page.url();
    console.log(`   ⏰ 等待超时，最终 URL: ${finalUrl}`);
    if (finalUrl.includes('login') || finalUrl.includes('passport')) {
        return 'login';
    }
    // 如果 URL 在 aliexpress.com 域下，也当作发布页处理
    if (isSellerWorkbenchUrl(finalUrl)) {
        console.log('   ⚠️  虽然超时，但仍在 AliExpress 域下，尝试继续...');
        return 'publish';
    }

    throw new Error(`页面加载超时：当前 URL = ${finalUrl}`);
}

/**
 * 导航到卖家后台登录页 (带 bizSegment=CSP 参数)
 */
export async function navigateToLoginPage(page: Page): Promise<void> {
    console.log('🔐 正在打开卖家后台登录页...');
    console.log(`   URL: ${ALIEXPRESS_LOGIN_URL}`);
    await page.goto(ALIEXPRESS_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('✅ 卖家登录页已打开');
}

/**
 * 等待人工完成登录，检测是否成功进入卖家后台
 * 
 * 原理: 人工登录成功后，浏览器会自动跳转到 csp.aliexpress.com
 * 每 2s 检查一次 URL，最多等 5 分钟
 */
export async function waitForSellerLogin(page: Page): Promise<boolean> {
    console.log('\n🔐 请在浏览器中手动登录 AliExpress 卖家后台...');
    console.log('   (登录成功后会自动检测，最多等待 5 分钟)');

    const deadline = Date.now() + 5 * 60 * 1000; // 5 分钟
    let lastLogTime = 0;
    while (Date.now() < deadline) {
        const currentUrl = page.url();

        // 每 10 秒打印一次当前 URL，方便排查
        const now = Date.now();
        if (now - lastLogTime > 10000) {
            const remaining = Math.round((deadline - now) / 1000);
            console.log(`   ⏳ [剩余 ${remaining}s] 当前 URL: ${currentUrl.substring(0, 80)}`);
            lastLogTime = now;
        }

        // 成功: 跳转到了 csp.aliexpress.com
        if (currentUrl.includes('csp.aliexpress.com')) {
            console.log('✅ 检测到已登录卖家后台!');
            return true;
        }

        // 成功: 跳转到了卖家工作台
        if (currentUrl.includes('seller.aliexpress.com') || currentUrl.includes('gsp0.aliexpress.com')) {
            console.log('✅ 检测到已登录卖家后台!');
            return true;
        }

        await page.waitForTimeout(2000);
    }

    console.log('⚠️  等待登录超时 (5 分钟)');
    return false;
}

/**
 * 截图工具 — 每次操作前后对比
 */
export async function screenshot(page: Page, name: string): Promise<string> {
    const dir = path.resolve(__dirname, '../screenshots');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filepath = path.join(dir, `${name}_${Date.now()}.png`);
    try {
        await page.screenshot({ path: filepath, fullPage: false });
    } catch (error) {
        const contextWithCdp = page.context() as {
            newCDPSession?: (page: Page) => Promise<{
                send: (method: string, params?: Record<string, unknown>) => Promise<{ data: string }>;
                detach?: () => Promise<void>;
            }>;
        };
        if (!(error instanceof Error) || error.name !== 'TimeoutError' || typeof contextWithCdp.newCDPSession !== 'function') {
            throw error;
        }

        console.log('   ↪️  截图等待字体超时，回退到 CDP capture');
        const session = await contextWithCdp.newCDPSession(page);
        try {
            const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
        } finally {
            if (typeof session.detach === 'function') {
                await session.detach().catch(() => { });
            }
        }
    }
    console.log(`📸 截图: ${filepath}`);
    return filepath;
}

/**
 * 操作间随机延迟 (避免反爬)
 */
export function randomDelay(minMs: number = 500, maxMs: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 等待人工确认后继续
 */
export async function waitForHumanConfirmation(message: string): Promise<void> {
    if (!process.stdin.isTTY) {
        console.log(`\n🤖 非交互环境，自动继续: ${message}`);
        return;
    }

    console.log(`\n⏸️  ${message}`);
    console.log('   按 Enter 继续...');
    process.stdin.resume();
    return new Promise(resolve => {
        process.stdin.once('data', () => resolve());
    });
}
