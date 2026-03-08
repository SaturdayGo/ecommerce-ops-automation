import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page, type Locator } from 'playwright';

import {
  fillDetailImages,
  resolveDetailImageLibraryPaths,
  type ImageLibraryPath,
} from '../src/modules';
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
    skus: [],
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
    <section id="detail-section">
      <h2>详情描述</h2>
      <div class="detail-images-panel">
        <button id="detail-upload" type="button">上传图片</button>
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

test('resolveDetailImageLibraryPaths derives common library folder for filename-only detail images', () => {
  const data = makeProductData();
  data.skus = [
    {
      name: 'SKU A',
      image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
      price_cny: 1,
      declared_value_cny: 1,
      stock: 1,
      is_original_box: true,
    },
  ];
  data.detail_images = ['s_02.jpg', 's_01.jpg'];

  const resolved = resolveDetailImageLibraryPaths(data);

  assert.deepEqual(resolved, [
    { category: 'FAMILY SUV', product: 'TOYOTA SIENNA', filename: 's_02.jpg' },
    { category: 'FAMILY SUV', product: 'TOYOTA SIENNA', filename: 's_01.jpg' },
  ]);
});

test('fillDetailImages skips cleanly when detail_images is empty', async () => {
  const calls: string[] = [];
  await fillDetailImages(page, makeProductData(), {
    selectImageFromLibraryFn: async (_page: Page, _uploadBtn: Locator, imagePath: ImageLibraryPath) => {
      calls.push(imagePath.filename);
      return true;
    },
  });

  assert.deepEqual(calls, []);
});

test('fillDetailImages continues after one image fails and still attempts later images', async () => {
  const data = makeProductData();
  data.skus = [
    {
      name: 'SKU A',
      image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
      price_cny: 1,
      declared_value_cny: 1,
      stock: 1,
      is_original_box: true,
    },
  ];
  data.detail_images = ['s_01.jpg', 's_02.jpg'];

  const calls: string[] = [];
  await fillDetailImages(page, data, {
    selectImageFromLibraryFn: async (_page: Page, _uploadBtn: Locator, imagePath: ImageLibraryPath) => {
      calls.push(imagePath.filename);
      return imagePath.filename === 's_02.jpg';
    },
  });

  assert.deepEqual(calls, ['s_01.jpg', 's_01.jpg', 's_02.jpg']);
});
