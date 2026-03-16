import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillCustoms } from '../src/modules';
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
    customs: { hs_code: '8512209000' },
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

test('fillCustoms fills HS code from a label-scoped field when placeholder is absent', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <section id="customs">
          <div class="form-row">
            <div class="field-label"><span>海关编码</span></div>
            <div class="field-control"><input id="hs-code-input" value="" /></div>
          </div>
        </section>
      </body>
    </html>
  `);

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    await fillCustoms(page, makeProductData());

    const value = await page.locator('#hs-code-input').inputValue();
    assert.equal(value, '8512209000');
    assert.ok(logs.some((line) => line.includes('✅ 海关编码: 8512209000')));
  } finally {
    console.log = originalLog;
    await page.close();
    await browser.close();
  }
});

test('fillCustoms opens 合规信息 tab before looking for HS code fields', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <button id="tab-basic" role="tab" type="button">基本信息</button>
        <button id="tab-compliance" role="tab" type="button">合规信息</button>

        <section id="basic-panel">basic</section>
        <section id="compliance-panel" style="display:none;">
          <div class="form-row">
            <div class="field-label"><span>HS Code</span></div>
            <div class="field-control"><input id="hs-code-input" value="" /></div>
          </div>
        </section>

        <script>
          document.getElementById('tab-compliance').addEventListener('click', () => {
            document.body.dataset.complianceOpened = '1';
            document.getElementById('compliance-panel').style.display = 'block';
          });
        </script>
      </body>
    </html>
  `);

  await fillCustoms(page, makeProductData());

  const dataset = await page.evaluate(() => ({
    complianceOpened: document.body.dataset.complianceOpened || '',
    hsCode: document.getElementById('hs-code-input').value,
  }));

  assert.equal(dataset.complianceOpened, '1');
  assert.equal(dataset.hsCode, '8512209000');

  await page.close();
  await browser.close();
});

test('fillCustoms prefers the top 合规信息 tab over same-text sidebar anchors', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <div style="display:flex; gap: 32px;">
          <div style="flex:1;">
            <div style="display:flex; gap: 24px; margin-top: 40px;">
              <button id="tab-basic" role="tab" type="button">基本信息</button>
              <button id="tab-compliance" role="tab" type="button">合规信息</button>
            </div>
            <section id="compliance-panel" style="display:none; margin-top: 120px;">
              <div class="form-row">
                <div class="field-label"><span>海关编码</span></div>
                <div class="field-control"><input id="hs-code-input" value="" /></div>
              </div>
            </section>
          </div>
          <aside style="width: 240px; margin-top: 260px;">
            <div id="sidebar-compliance">合规信息</div>
          </aside>
        </div>

        <script>
          document.getElementById('tab-compliance').addEventListener('click', () => {
            document.body.dataset.topComplianceOpened = '1';
            document.getElementById('compliance-panel').style.display = 'block';
          });
          document.getElementById('sidebar-compliance').addEventListener('click', () => {
            document.body.dataset.sidebarComplianceClicked = '1';
          });
        </script>
      </body>
    </html>
  `);

  await fillCustoms(page, makeProductData());

  const dataset = await page.evaluate(() => ({
    topComplianceOpened: document.body.dataset.topComplianceOpened || '',
    sidebarComplianceClicked: document.body.dataset.sidebarComplianceClicked || '',
    hsCode: document.getElementById('hs-code-input').value,
  }));

  assert.equal(dataset.topComplianceOpened, '1');
  assert.equal(dataset.sidebarComplianceClicked, '');
  assert.equal(dataset.hsCode, '8512209000');

  await page.close();
  await browser.close();
});

test('fillCustoms turns into a manual gate when 合规信息 has shifted to 海关监管属性 flow', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <button id="tab-compliance" role="tab" type="button">合规信息</button>
        <section id="compliance-panel">
          <div>*海关监管属性</div>
          <div>属性信息已修改，请确认是否需要更新海关信息</div>
          <div>*资质信息</div>
          <div>关联欧盟责任人</div>
        </section>
      </body>
    </html>
  `);

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    await fillCustoms(page, makeProductData());
    assert.ok(logs.some((line) => line.includes('模块 3 转人工处理')));
  } finally {
    console.log = originalLog;
    await page.close();
    await browser.close();
  }
});
