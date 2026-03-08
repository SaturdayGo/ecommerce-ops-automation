import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillCategory } from '../src/modules';
import type { ProductData } from '../src/types';

const html = `
<!doctype html>
<html>
  <body>
    <section>
      <h1>商品发布</h1>
      <div id="shell-state">loading</div>
      <div class="category-area">
        <input id="category-input" placeholder="可输入商品名称关键词、平台已有商品ID或商品链接搜索类目" value="" />
        <button id="recent-btn" style="display:none">最近使用</button>
        <div class="category-history-lists">
          <div id="tail-option" style="display:none">汽车及零配件 / 车灯 / 信号灯总成 / 尾灯总成</div>
        </div>
      </div>
      <div id="schema-text">高关注化学品 适用车型 光线颜色</div>
      <div id="sku-tab">SKU价格与库存</div>
    </section>

    <script>
      const recentBtn = document.getElementById('recent-btn');
      const tailOption = document.getElementById('tail-option');
      const categoryInput = document.getElementById('category-input');
      const shellState = document.getElementById('shell-state');

      setTimeout(() => {
        recentBtn.style.display = 'inline-block';
        shellState.textContent = 'ready';
      }, 3200);

      recentBtn.addEventListener('click', () => {
        tailOption.style.display = 'block';
      });

      tailOption.addEventListener('click', () => {
        categoryInput.value = '尾灯总成';
      });
    </script>
  </body>
</html>
`;

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
      fitment: {
        car_make: '',
        car_model: '',
        year: '',
      },
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

test('fillCategory waits through delayed loading state before clicking 最近使用', async () => {
  await fillCategory(page, makeProductData());

  const values = await page.evaluate(() => ({
    category: (document.getElementById('category-input') as HTMLInputElement).value,
    shell: document.getElementById('shell-state')?.textContent?.trim(),
  }));

  assert.equal(values.category, '尾灯总成');
  assert.equal(values.shell, 'ready');
});
