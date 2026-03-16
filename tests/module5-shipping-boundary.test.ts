import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillSKUs, fillShipping } from '../src/modules';
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
        name: 'SKU Test A',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
        price_cny: 1299,
        declared_value_cny: 999,
        stock: 20,
        is_original_box: true,
      },
      {
        name: 'SKU Test B',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUb.jpg',
        price_cny: 1399,
        declared_value_cny: 1099,
        stock: 20,
        is_original_box: true,
      },
    ],
    weight_kg: 6.8,
    package_dimensions: { length_cm: 64, width_cm: 34, height_cm: 27 },
    wholesale: { min_quantity: 0, discount_percent: 0 },
    buyers_note_template: '',
    buyers_note_extra: '',
    detail_images: [],
    app_description: '',
    shipping: {
      total_weight_kg: 7.5,
      total_dimensions: { length_cm: 65, width_cm: 35, height_cm: 28 },
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
    <section id="module7" style="margin-bottom: 40px;">
      <h2>包装与物流</h2>
      <div class="field-row">
        <div class="field-label"><span>总重量</span></div>
        <div class="field-control"><input id="shipping-weight" placeholder="重量" value="" /></div>
      </div>
      <div class="field-row">
        <div class="field-label"><span>包装尺寸</span></div>
        <div class="field-control dims">
          <input id="shipping-length" placeholder="长" value="" />
          <input id="shipping-width" placeholder="宽" value="" />
          <input id="shipping-height" placeholder="高" value="" />
        </div>
      </div>
    </section>

    <button id="sku-tab" role="tab" type="button">SKU价格与库存</button>

    <section id="sku-panel" style="display:block; margin-top: 16px;">
      <div class="posting-feild-color-item" data-row="0">
        <div class="ait-select" tabindex="0">
          <span class="ait-select-selection-item">选择主色系</span>
          <input class="color-combo" role="combobox" aria-label="光线颜色" />
        </div>
        <input class="sku-name" placeholder="自定义名称" />
      </div>
      <div class="posting-feild-color-item" data-row="1" style="margin-top: 12px;">
        <div class="ait-select" tabindex="0">
          <span class="ait-select-selection-item">选择主色系</span>
          <input class="color-combo" role="combobox" aria-label="光线颜色" />
        </div>
        <input class="sku-name" placeholder="自定义名称" />
      </div>

      <div class="sell-sku-head-cell col-skuPrice">零售价(CNY)</div>
      <div class="sell-sku-head-cell col-cargoPrice">货值(CNY)</div>
      <div class="sell-sku-head-cell col-skuStock">商家库存</div>

      <button id="batch-fill-btn" type="button">批量填充</button>

      <div class="sku-shared-fields" style="margin: 12px 0;">
        <label>重量<input id="sku-weight-shared" placeholder="重量" value="" /></label>
        <label>长<input id="sku-length-shared" placeholder="长" value="" /></label>
        <label>宽<input id="sku-width-shared" placeholder="宽" value="" /></label>
        <label>高<input id="sku-height-shared" placeholder="高" value="" /></label>
      </div>

      <table>
        <tbody>
          <tr data-grid-row="0">
            <td class="sell-sku-cell col-skuPrice"><div contenteditable="true" class="editor price" data-field="price-0"></div></td>
            <td class="sell-sku-cell col-cargoPrice"><div contenteditable="true" class="editor declared" data-field="declared-0"></div></td>
            <td class="sell-sku-cell col-skuStock"><div contenteditable="true" class="editor stock" data-field="stock-0"></div></td>
          </tr>
          <tr data-grid-row="1">
            <td class="sell-sku-cell col-skuPrice"><div contenteditable="true" class="editor price" data-field="price-1"></div></td>
            <td class="sell-sku-cell col-cargoPrice"><div contenteditable="true" class="editor declared" data-field="declared-1"></div></td>
            <td class="sell-sku-cell col-skuStock"><div contenteditable="true" class="editor stock" data-field="stock-1"></div></td>
          </tr>
        </tbody>
      </table>
    </section>

    <div id="batch-modal" class="next-overlay-wrapper" style="display:none; margin-top: 16px; padding: 12px; border: 1px solid #ccc;">
      <div>批量填充</div>
      <label>零售价<input id="batch-price" placeholder="零售价(CNY)" /></label>
      <label>货值<input id="batch-declared" placeholder="货值(CNY)" /></label>
      <label>商家库存<input id="batch-stock" placeholder="商家库存" /></label>
      <button id="fill-btn" type="button">填充</button>
    </div>

    <script>
      const colors = ['蓝色', '绿色', '红色'];
      const combos = Array.from(document.querySelectorAll('.color-combo'));
      combos.forEach((combo, rowIndex) => {
        combo.dataset.index = '0';
        combo.addEventListener('keydown', (event) => {
          const current = Number(combo.dataset.index || '0');
          if (event.key === 'ArrowDown') {
            combo.dataset.index = String(Math.min(colors.length - 1, current + 1));
            event.preventDefault();
          }
          if (event.key === 'Enter') {
            const nextIndex = Number(combo.dataset.index || '0');
            combo.closest('.posting-feild-color-item').querySelector('.ait-select-selection-item').textContent = colors[nextIndex];
            document.body.dataset['colorRow' + rowIndex] = colors[nextIndex];
            event.preventDefault();
          }
        });
      });

      document.getElementById('sku-tab').addEventListener('click', () => {
        document.body.dataset.skuOpened = '1';
      });

      document.querySelectorAll('.editor').forEach((editor) => {
        editor.addEventListener('input', () => {
          const field = editor.dataset.field;
          const key = field.startsWith('stock-') ? 'rowStockEdits' : field.startsWith('price-') ? 'rowPriceEdits' : 'rowDeclaredEdits';
          const current = Number(document.body.dataset[key] || '0');
          document.body.dataset[key] = String(current + 1);
        });
      });

      document.getElementById('batch-fill-btn').addEventListener('click', () => {
        document.getElementById('batch-modal').style.display = 'block';
        document.body.dataset.batchOpened = '1';
      });

      document.getElementById('fill-btn').addEventListener('click', () => {
        const stock = document.getElementById('batch-stock').value;
        document.querySelector('[data-field="stock-0"]').textContent = stock;
        document.querySelector('[data-field="stock-1"]').textContent = stock;
        document.body.dataset.batchStockApplied = stock;
        document.getElementById('batch-modal').style.display = 'none';
      });
    </script>
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
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.setContent(html);
});

test.afterEach(async () => {
  await page.close();
});

test.after(async () => {
  await browser.close();
});

test('fillSKUs and fillShipping keep SKU shared fields and shipping totals scoped to their own modules', async () => {
  const data = makeProductData();

  await fillSKUs(page, data);
  await fillShipping(page, data);

  const values = await page.evaluate(() => ({
    skuWeightShared: (document.getElementById('sku-weight-shared') as HTMLInputElement).value,
    skuLengthShared: (document.getElementById('sku-length-shared') as HTMLInputElement).value,
    skuWidthShared: (document.getElementById('sku-width-shared') as HTMLInputElement).value,
    skuHeightShared: (document.getElementById('sku-height-shared') as HTMLInputElement).value,
    shippingWeight: (document.getElementById('shipping-weight') as HTMLInputElement).value,
    shippingLength: (document.getElementById('shipping-length') as HTMLInputElement).value,
    shippingWidth: (document.getElementById('shipping-width') as HTMLInputElement).value,
    shippingHeight: (document.getElementById('shipping-height') as HTMLInputElement).value,
  }));

  assert.equal(values.skuWeightShared, '6.8');
  assert.equal(values.skuLengthShared, '64');
  assert.equal(values.skuWidthShared, '34');
  assert.equal(values.skuHeightShared, '27');
  assert.equal(values.shippingWeight, '7.5');
  assert.equal(values.shippingLength, '65');
  assert.equal(values.shippingWidth, '35');
  assert.equal(values.shippingHeight, '28');
});
