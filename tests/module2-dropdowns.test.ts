import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillAttributes } from '../src/modules';
import type { ProductData } from '../src/types';

const html = `
<!doctype html>
<html>
  <body>
    <section id="attrs">
      <h2>商品属性</h2>

      <div class="field-row" data-field="brand">
        <div class="field-label"><span>品牌</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">请选择</span></div>
          <div class="ait-select-dropdown" style="display:none">
            <div class="ait-select-item-option">No Brand</div>
            <div class="ait-select-item-option">Acme</div>
          </div>
        </div>
      </div>

      <div class="field-row" data-field="origin">
        <div class="field-label"><span>产地（国家或地区）</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">请选择</span></div>
          <div class="ait-select-dropdown" style="display:none">
            <div class="ait-select-item-option">China</div>
            <div class="ait-select-item-option">USA</div>
          </div>
        </div>
      </div>

      <div class="field-row" data-field="hazard">
        <div class="field-label"><span>高关注化学品</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">请选择</span></div>
          <div class="ait-select-dropdown" style="display:none">
            <div class="ait-select-item-option">No</div>
            <div class="ait-select-item-option">Yes</div>
          </div>
        </div>
      </div>
    </section>

    <script>
      document.querySelectorAll('.field-row').forEach((row) => {
        const trigger = row.querySelector('.ait-select');
        const display = row.querySelector('.ait-select-selection-item');
        const dropdown = row.querySelector('.ait-select-dropdown');
        const hideAll = () => {
          document.querySelectorAll('.ait-select-dropdown').forEach((el) => {
            el.style.display = 'none';
          });
        };
        trigger.addEventListener('click', (event) => {
          event.stopPropagation();
          hideAll();
          dropdown.style.display = 'block';
        });
        dropdown.querySelectorAll('.ait-select-item-option').forEach((opt) => {
          opt.addEventListener('click', (event) => {
            event.stopPropagation();
            display.textContent = opt.textContent.trim();
            dropdown.style.display = 'none';
          });
        });
      });
      document.addEventListener('click', () => {
        document.querySelectorAll('.ait-select-dropdown').forEach((el) => {
          el.style.display = 'none';
        });
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
      brand: '无品牌',
      origin: '中国',
      product_type: '',
      hazardous_chemical: '否',
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

test('fillAttributes selects dropdown values when label and trigger are sibling nodes', async () => {
  await fillAttributes(page, makeProductData());

  const values = await page.evaluate(() => ({
    brand: document.querySelector('[data-field="brand"] .ait-select-selection-item')?.textContent?.trim(),
    origin: document.querySelector('[data-field="origin"] .ait-select-selection-item')?.textContent?.trim(),
    hazard: document.querySelector('[data-field="hazard"] .ait-select-selection-item')?.textContent?.trim(),
  }));

  assert.deepEqual(values, {
    brand: 'No Brand',
    origin: 'China',
    hazard: 'No',
  });
});
