import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillOtherSettings } from '../src/modules';
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
      eu_responsible_person: true,
      manufacturer_linked: true,
    },
    notes: '',
    gemini_raw_data: '',
  };
}

const html = `
<!doctype html>
<html>
  <body>
    <button id="tab-other" role="tab" type="button">其它设置</button>
    <section id="other-settings">
      <div id="eu-row" class="setting-row">
        <span>关联欧盟责任人</span>
        <a href="#" id="eu-manage">欧盟责任人管理</a>
        <span>未关联</span>
      </div>
      <div id="mfg-row" class="setting-row">
        <span>关联制造商</span>
        <a href="#" id="mfg-manage">制造商管理</a>
        <span>未关联</span>
      </div>
    </section>
    <script>
      document.getElementById('tab-other').addEventListener('click', () => {
        document.body.dataset.otherTabOpened = '1';
      });
      document.getElementById('eu-manage').addEventListener('click', (event) => {
        event.preventDefault();
        document.body.dataset.euClicked = '1';
      });
      document.getElementById('mfg-manage').addEventListener('click', (event) => {
        event.preventDefault();
        document.body.dataset.mfgClicked = '1';
      });
    </script>
  </body>
</html>
`;

test('fillOtherSettings keeps unlinked association rows as explicit manual gate', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setContent(html);

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    await fillOtherSettings(page, makeProductData());

    const dataset = await page.evaluate(() => ({
      otherTabOpened: document.body.dataset.otherTabOpened || '',
      euClicked: document.body.dataset.euClicked || '',
      mfgClicked: document.body.dataset.mfgClicked || '',
    }));

    assert.equal(dataset.otherTabOpened, '1');
    assert.equal(dataset.euClicked, '');
    assert.equal(dataset.mfgClicked, '');
    assert.ok(logs.some((line) => line.includes('人工处理其它设置: 欧盟责任人、制造商')));
  } finally {
    console.log = originalLog;
    await page.close();
    await browser.close();
  }
});
