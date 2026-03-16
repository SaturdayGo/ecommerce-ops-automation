import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page, type Locator } from 'playwright';

import { fillSKUImages } from '../src/modules';
import type { ProductData } from '../src/types';

function makeProductData(): ProductData {
  return {
    category: '',
    title: '',
    image_dir: '',
    carousel: [],
    white_bg_image: '',
    marketing_image: '',
    video_file: '',
    attributes: {
      brand: '',
      origin: '',
      product_type: '',
      hazardous_chemical: '',
      material: '',
      voltage: '',
      special_features: [],
      accessory_position: '',
      fitment: { car_make: '', car_model: '', year: '' },
      custom_attributes: {},
    },
    customs: { hs_code: '' },
    pricing_settings: { min_unit: '', sell_by: '' },
    taobao_price_cny: 0,
    price_formula: { multiplier: 0, shipping_buffer_cny: 0 },
    skus: [
      {
        name: 'SKU A',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
        price_cny: 1,
        declared_value_cny: 1,
        stock: 1,
        is_original_box: true,
      },
      {
        name: 'SKU B',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUb.jpg',
        price_cny: 1,
        declared_value_cny: 1,
        stock: 1,
        is_original_box: true,
      },
    ],
    weight_kg: 0,
    package_dimensions: { length_cm: 0, width_cm: 0, height_cm: 0 },
    wholesale: { min_quantity: 0, discount_percent: 0 },
    buyers_note_template: '',
    buyers_note_extra: '',
    detail_images: [],
    app_description: '',
    shipping: {
      total_weight_kg: 0,
      total_dimensions: { length_cm: 0, width_cm: 0, height_cm: 0 },
      shipping_template: '',
    },
    other_settings: {
      stock_deduction: '',
      eu_responsible_person: false,
      manufacturer_linked: false,
    },
    notes: '',
    gemini_raw_data: '',
  };
}

const html = `
<!doctype html>
<html>
  <body>
    <section id="sku-panel">
      <div class="posting-feild-color-item" data-sku-index="0">
        <div class="ait-select"><span class="ait-select-selection-item">红色</span></div>
        <input placeholder="请输入自定义名称" value="SKU A" />
        <span id="upload-1">上传图片</span>
      </div>
      <div class="posting-feild-color-item" data-sku-index="1">
        <div class="ait-select"><span class="ait-select-selection-item">蓝色</span></div>
        <input placeholder="请输入自定义名称" value="SKU B" />
        <span id="upload-2">上传图片</span>
      </div>
    </section>
  </body>
</html>
`;

let browser: Browser;
let page: Page;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent(html);
});

test.afterEach(async () => {
  await page.close();
});

test.after(async () => {
  await browser.close();
});

test('fillSKUImages keeps going after one SKU exhausts immediate retries, then retries it once at module end', async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    await fillSKUImages(page, makeProductData(), {
      selectImageFromLibraryFn: async (_page: Page, uploadBtn: Locator, imagePath) => {
        const uploadId = await uploadBtn.getAttribute('id');
        calls.push(`${uploadId}:${imagePath.filename}`);
        if (uploadId === 'upload-1') {
          return calls.filter((entry) => entry === 'upload-1:SKUa.jpg').length >= 3;
        }
        return uploadId === 'upload-2';
      },
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    'upload-1:SKUa.jpg',
    'upload-1:SKUa.jpg',
    'upload-2:SKUb.jpg',
    'upload-1:SKUa.jpg',
  ]);
  assert.ok(logs.some((line) => line.includes('先继续后续 SKU，模块末尾再单独回补 SKU 1')));
  assert.ok(logs.some((line) => line.includes('SKU 图片待回补 1 项，模块结束前重试一次')));
  assert.ok(logs.some((line) => line.includes('🔁 回补 SKU 1: SKU A')));
});

test('fillSKUImages does not keep a fixed long sleep after SKU tab click once upload controls are already visible', async () => {
  const page2 = await browser.newPage();
  await page2.setContent(`
<!doctype html>
<html>
  <body>
    <button id="sku-tab" type="button">SKU价格与库存</button>
    <section id="sku-panel" style="display:none">
      <div class="posting-feild-color-item" data-sku-index="0">
        <div class="ait-select"><span class="ait-select-selection-item">红色</span></div>
        <input placeholder="请输入自定义名称" value="SKU A" />
        <span id="upload-after-tab">上传图片</span>
      </div>
    </section>
    <script>
      document.getElementById('sku-tab').addEventListener('click', () => {
        document.getElementById('sku-panel').style.display = 'block';
      });
    </script>
  </body>
</html>
  `);

  const waitCalls: number[] = [];
  const uploadCalls: string[] = [];
  let firstUploadCallMs: number | null = null;
  const originalWaitForTimeout = page2.waitForTimeout.bind(page2);
  (page2 as Page & { waitForTimeout: (timeout: number) => Promise<void> }).waitForTimeout = async (timeout: number) => {
    waitCalls.push(timeout);
    return undefined;
  };

  const data = makeProductData();
  data.skus = [data.skus[0]];

  try {
    const started = Date.now();
    await fillSKUImages(page2, data, {
      selectImageFromLibraryFn: async (_page: Page, uploadBtn: Locator) => {
        firstUploadCallMs ??= Date.now() - started;
        uploadCalls.push(await uploadBtn.getAttribute('id') ?? '<missing>');
        return true;
      },
    });
  } finally {
    (page2 as Page & { waitForTimeout: typeof originalWaitForTimeout }).waitForTimeout = originalWaitForTimeout;
  }

  assert.deepEqual(uploadCalls, ['upload-after-tab']);
  assert.ok(firstUploadCallMs !== null && firstUploadCallMs < 5000, `upload flow started too late: ${firstUploadCallMs}ms`);
  assert.ok(Math.max(...waitCalls) < 1000, `unexpected wait calls: ${waitCalls.join(', ')}`);

  await page2.close();
});

test('fillSKUImages reports image-flow start before upload attempts', async () => {
  const uploadCalls: string[] = [];
  const progressActions: string[] = [];
  const fillSKUImagesWithHooks = fillSKUImages as (
    page: Page,
    data: ProductData,
    options?: {
      selectImageFromLibraryFn?: (
        page: Page,
        uploadBtn: Locator,
        imagePath: { category: string; product: string; filename: string },
      ) => Promise<boolean>;
      onProgress?: (event: { action: string; details: string }) => void | Promise<void>;
    },
  ) => Promise<void>;

  await fillSKUImagesWithHooks(page, makeProductData(), {
    onProgress(event) {
      progressActions.push(event.action);
    },
    selectImageFromLibraryFn: async (_page: Page, uploadBtn: Locator) => {
      uploadCalls.push(await uploadBtn.getAttribute('id') ?? '<missing>');
      return true;
    },
  });

  assert.equal(progressActions[0], 'fill_sku_images_running');
  assert.deepEqual(uploadCalls, ['upload-1', 'upload-2']);
});
