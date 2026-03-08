#!/usr/bin/env tsx
/**
 * 轮播图选择测试脚本
 * 
 * 正确流程 (一次选 6 张):
 *   1. 打开浏览器 → 发布页
 *   2. 找到商品图片区域，点击「添加图片」
 *   3. 弹窗中切换到「选择图片」tab
 *   4. 在左侧文件夹树导航到目标文件夹 (商品发布 → TailLights → FAMILY SUV → TOYOTA SIENNA)
 *   5. 在右侧图片列表中，按名称依次点击 6 张图片 (SKUb ~ SKUg)
 *   6. 点击「确认」，一次性完成
 * 
 * 用法:
 *   npx tsx src/test-carousel.ts ../products/test-toyota-sienna.yaml
 *   或编译后: node dist/test-carousel.js ../products/test-toyota-sienna.yaml
 */

import { launchBrowser, navigateToPublishPage, navigateToLoginPage, saveAuth, screenshot, randomDelay, waitForHumanConfirmation, waitForSellerLogin } from './browser';
import { loadProductData } from './types';
import { parseImageLibraryPath, type ImageLibraryPath } from './modules';
import { safeClickFirst } from './safe-click';

async function main() {
    const yamlPath = process.argv[2];
    if (!yamlPath) {
        console.error('❌ 用法: npx tsx src/test-carousel.ts <yaml文件路径>');
        process.exit(1);
    }

    const data = loadProductData(yamlPath);
    console.log('📄 测试数据:');
    console.log(`   标题: ${data.title}`);
    console.log(`   轮播图: ${data.carousel?.length || 0} 张`);
    data.carousel?.forEach((img, i) => console.log(`     ${i + 1}. ${img}`));

    // 解析所有图片路径
    const imagePaths: ImageLibraryPath[] = [];
    for (const imgStr of (data.carousel || [])) {
        const parsed = parseImageLibraryPath(imgStr);
        if (parsed) imagePaths.push(parsed);
    }

    if (imagePaths.length === 0) {
        console.error('❌ 没有有效的图片路径');
        process.exit(1);
    }

    // 所有图片应在同一个文件夹
    const firstPath = imagePaths[0];
    const filenames = imagePaths.map(p => p.filename);
    console.log(`\n📁 目标文件夹: 商品发布 → TailLights → ${firstPath.category} → ${firstPath.product}`);
    console.log(`📷 要选的 ${filenames.length} 张图片: ${filenames.join(', ')}`);

    // 启动浏览器
    const { browser, context, page } = await launchBrowser();

    try {
        // ========================================================
        // 登录流程: 先确保登录成功，再进入发布页
        // ========================================================
        console.log('\n' + '='.repeat(60));
        console.log('🔐 步骤 0: 登录卖家后台');
        console.log('='.repeat(60));

        let pageState = await navigateToPublishPage(page);

        if (pageState === 'login') {
            // 被重定向到登录页 → 跳转到卖家专用登录页
            await navigateToLoginPage(page);

            // 自动等待人工登录完成 (检测 URL 变化)
            const loginSuccess = await waitForSellerLogin(page);
            if (!loginSuccess) {
                console.error('❌ 登录超时，请重新运行脚本');
                process.exit(1);
            }

            // 保存登录状态，下次可免登录
            await saveAuth(context);

            // 登录成功后重新导航到发布页
            console.log('\n📄 登录成功，正在导航到商品发布页...');
            pageState = await navigateToPublishPage(page);

            if (pageState !== 'publish') {
                console.error('❌ 登录后仍无法进入发布页');
                await screenshot(page, 'login_failed');
                process.exit(1);
            }
        }

        console.log('✅ 已进入商品发布页，开始测试\n');

        await screenshot(page, 'test_carousel_start');
        console.log('\n' + '='.repeat(60));
        console.log('🧪 开始测试: 轮播图选择 (一次选 6 张)');
        console.log('='.repeat(60));

        // ========================================================
        // Step 1: 找到商品图片区域，点击「添加图片」
        // ========================================================
        console.log('\n--- Step 1: 定位图片上传区域 ---');
        await page.waitForTimeout(2000);

        const uploadHit = await safeClickFirst(page, [
            'text=添加图片',
            '[class*="upload"] [class*="btn"]',
            '[class*="image-upload"]',
            '[class*="add-image"]',
            '[class*="upload-trigger"]',
            '[class*="image-item-add"]',
            '[class*="img-upload-btn"]',
        ], { label: '添加图片' });

        if (!uploadHit) {
            await screenshot(page, 'test_carousel_no_upload_btn');
            console.log('   ⚠️  未自动找到上传按钮，请手动点击「添加图片」');
            await waitForHumanConfirmation('点击完成后按 Enter');
        }

        await randomDelay(800, 1500);
        await screenshot(page, 'test_carousel_dialog_open');

        // ========================================================
        // Step 2: 切换到「选择图片」tab
        // ========================================================
        console.log('\n--- Step 2: 切换到「选择图片」tab ---');

        const tabHit = await safeClickFirst(page, [
            'text=选择图片',
            '[role="tab"]:has-text("选择图片")',
            '.next-tabs-tab:has-text("选择图片")',
        ], { label: '选择图片Tab' });

        if (!tabHit) {
            await screenshot(page, 'test_carousel_no_select_tab');
            console.log('   ⚠️  未找到「选择图片」tab，请手动点击');
            await waitForHumanConfirmation('点击完成后按 Enter');
        }

        await randomDelay(800, 1500);
        await screenshot(page, 'test_carousel_select_tab');

        // ========================================================
        // Step 3: 导航文件夹树
        //   商品发布 → TailLights → {分类} → {产品}
        // ========================================================
        console.log('\n--- Step 3: 导航文件夹树 ---');

        const folderPath = ['商品发布', 'TailLights', firstPath.category, firstPath.product];

        for (const folderName of folderPath) {
            console.log(`   → 查找文件夹: "${folderName}"`);

            const folderHit = await safeClickFirst(page, [
                `.next-tree-node:has-text("${folderName}")`,
                `[role="treeitem"]:has-text("${folderName}")`,
                `text="${folderName}"`,
                `text=${folderName}`,
            ], { label: `文件夹:${folderName}` });

            if (!folderHit) {
                await screenshot(page, `test_carousel_missing_${folderName.replace(/\s+/g, '_')}`);
                console.log(`      ❌ 未找到 "${folderName}"，请手动点击`);
                await waitForHumanConfirmation(`手动点击 "${folderName}" 后按 Enter`);
            }

            await randomDelay(500, 1000);
        }

        // 等待右侧图片列表加载
        await page.waitForTimeout(2000);
        await screenshot(page, 'test_carousel_folder_opened');

        // ========================================================
        // Step 4: 在图片列表中一次性选择 6 张图片
        //   点击每张图片的缩略图/卡片，蓝色勾选标记会出现
        // ========================================================
        console.log('\n--- Step 4: 选择 6 张图片 (一次性多选) ---');

        let selectedCount = 0;
        for (let i = 0; i < filenames.length; i++) {
            const filename = filenames[i];
            const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
            console.log(`   📷 [${i + 1}/${filenames.length}] 点击: ${filename}`);

            const imageHit = await safeClickFirst(page, [
                `text="${filename}"`,
                `text=${filename}`,
                `[title="${filename}"]`,
                `[title*="${nameWithoutExt}"]`,
                `img[alt="${filename}"]`,
                `img[alt*="${nameWithoutExt}"]`,
                `*:has-text("${filename}"):not(:has(*:has-text("${filename}")))`,
            ], { label: `图片:${filename}` });

            if (imageHit) {
                selectedCount++;
            } else {
                console.log(`      ❌ 未找到 ${filename}，请手动点击该图片`);
                await waitForHumanConfirmation(`选择 "${filename}" 后按 Enter`);
                selectedCount++;
            }

            await randomDelay(300, 600);
        }

        console.log(`\n   📊 已选择 ${selectedCount} / ${filenames.length} 张`);
        await screenshot(page, 'test_carousel_all_selected');

        // ========================================================
        // Step 5: 点击「确认」按钮
        // ========================================================
        console.log('\n--- Step 5: 点击「确认」 ---');

        const confirmHit = await safeClickFirst(page, [
            'button:has-text("确定")',
            'button:has-text("确认")',
            'button:has-text("OK")',
            '.next-btn-primary:has-text("确")',
        ], { label: '确认按钮' });

        if (!confirmHit) {
            console.log('   ⚠️  未找到确认按钮，请手动点击');
            await waitForHumanConfirmation('点击确认后按 Enter');
        }

        await randomDelay(500, 1000);
        await screenshot(page, 'test_carousel_confirmed');

        // ========================================================
        // 测试结果
        // ========================================================
        console.log('\n' + '='.repeat(60));
        console.log('🧪 测试完成!');
        console.log('='.repeat(60));
        console.log('请检查:');
        console.log('  1. 浏览器中图片是否正确填入 6 个槽位');
        console.log('  2. 图片顺序是否按 SKUb → SKUg 排列');
        console.log('截图保存在 automation/screenshots/ 目录\n');

        await waitForHumanConfirmation('检查完成后按 Enter 退出');
        await saveAuth(context);

    } catch (error) {
        console.error('\n❌ 测试出错:', error);
        await screenshot(page, 'test_carousel_error').catch(() => { });
    } finally {
        console.log('\n🧹 关闭浏览器...');
        await browser.close().catch(() => { });
    }
}

main().catch(console.error);
