import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillPricingSettings } from '../src/modules';
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
    pricing_settings: { min_unit: '双', sell_by: '按 双 出售' },
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

test('fillPricingSettings opens SKU tab and selects 最小计量单元 + 销售方式', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <button id="tab-basic" role="tab" type="button">基本信息</button>
        <button id="tab-sku" role="tab" type="button">SKU价格与库存</button>

        <section id="sku-panel" style="display:none; margin-top: 24px;">
          <div class="field-row">
            <label>最小计量单元</label>
            <div id="min-unit" role="combobox" tabindex="0" data-field="min_unit">件/个 (piece/pieces)</div>
          </div>
          <div class="field-row" style="margin-top: 16px;">
            <label>销售方式</label>
            <div id="sell-by" role="combobox" tabindex="0" data-field="sell_by">按 件 出售</div>
          </div>
        </section>

        <div id="overlay" style="display:none; margin-top: 24px;"></div>

        <script>
          const skuPanel = document.getElementById('sku-panel');
          const overlay = document.getElementById('overlay');
          const state = { activeField: null };
          document.getElementById('tab-sku').addEventListener('click', () => {
            document.body.dataset.skuOpened = '1';
            skuPanel.style.display = 'block';
          });

          function openOptions(field) {
            state.activeField = field;
            overlay.style.display = 'block';
            overlay.innerHTML = '';
            const values = field === 'min_unit'
              ? ['件/个 (piece/pieces)', '双']
              : ['按 件 出售', '按 双 出售'];
            for (const value of values) {
              const option = document.createElement('div');
              option.setAttribute('role', 'option');
              option.textContent = value;
              option.addEventListener('click', () => {
                document.querySelector('[data-field=\"' + field + '\"]').textContent = value;
                document.body.dataset[field] = value;
                overlay.style.display = 'none';
              });
              overlay.appendChild(option);
            }
          }

          document.getElementById('min-unit').addEventListener('click', () => openOptions('min_unit'));
          document.getElementById('sell-by').addEventListener('click', () => openOptions('sell_by'));
        </script>
      </body>
    </html>
  `);

  await fillPricingSettings(page, makeProductData());

  const dataset = await page.evaluate(() => ({
    skuOpened: document.body.dataset.skuOpened || '',
    minUnit: document.body.dataset.min_unit || '',
    sellBy: document.body.dataset.sell_by || '',
    minUnitText: document.getElementById('min-unit')?.textContent?.trim() || '',
    sellByText: document.getElementById('sell-by')?.textContent?.trim() || '',
  }));

  assert.equal(dataset.skuOpened, '1');
  assert.equal(dataset.minUnit, '双');
  assert.equal(dataset.sellBy, '按 双 出售');
  assert.equal(dataset.minUnitText, '双');
  assert.equal(dataset.sellByText, '按 双 出售');

  await page.close();
  await browser.close();
});
