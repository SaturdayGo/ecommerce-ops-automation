import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillShipping } from '../src/modules';
import type { ProductData } from '../src/types';

const html = `
<!doctype html>
<html>
  <body>
    <section id="module5">
      <h2>SKU价格与库存</h2>
      <div class="grid-row">
        <label>重量</label>
        <input id="sku-weight" placeholder="重量" value="" />
        <label>长</label>
        <input id="sku-length" placeholder="长" value="" />
        <label>宽</label>
        <input id="sku-width" placeholder="宽" value="" />
        <label>高</label>
        <input id="sku-height" placeholder="高" value="" />
      </div>
    </section>

    <section id="module7">
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
      total_weight_kg: 7.5,
      total_dimensions: {
        length_cm: 65,
        width_cm: 35,
        height_cm: 28,
      },
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

test('fillShipping writes module 7 values without touching module 5 lookalike inputs', async () => {
  await fillShipping(page, makeProductData());

  const values = await page.evaluate(() => ({
    shippingWeight: (document.getElementById('shipping-weight') as HTMLInputElement).value,
    shippingLength: (document.getElementById('shipping-length') as HTMLInputElement).value,
    shippingWidth: (document.getElementById('shipping-width') as HTMLInputElement).value,
    shippingHeight: (document.getElementById('shipping-height') as HTMLInputElement).value,
    skuWeight: (document.getElementById('sku-weight') as HTMLInputElement).value,
    skuLength: (document.getElementById('sku-length') as HTMLInputElement).value,
    skuWidth: (document.getElementById('sku-width') as HTMLInputElement).value,
    skuHeight: (document.getElementById('sku-height') as HTMLInputElement).value,
  }));

  assert.equal(values.shippingWeight, '7.5');
  assert.equal(values.shippingLength, '65');
  assert.equal(values.shippingWidth, '35');
  assert.equal(values.shippingHeight, '28');
  assert.equal(values.skuWeight, '');
  assert.equal(values.skuLength, '');
  assert.equal(values.skuWidth, '');
  assert.equal(values.skuHeight, '');
});
