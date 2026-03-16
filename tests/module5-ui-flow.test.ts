import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillSKUs } from '../src/modules';
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

test('fillSKUs uses batch fill for shared stock and only row-fills price/declared value', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(html);

  await fillSKUs(page, makeProductData());

  const snapshot = await page.evaluate(() => ({
    skuOpened: document.body.dataset.skuOpened || '',
    batchOpened: document.body.dataset.batchOpened || '',
    batchStockApplied: document.body.dataset.batchStockApplied || '',
    rowPriceEdits: document.body.dataset.rowPriceEdits || '0',
    rowDeclaredEdits: document.body.dataset.rowDeclaredEdits || '0',
    rowStockEdits: document.body.dataset.rowStockEdits || '0',
    colorRow0: document.body.dataset.colorRow0 || '',
    colorRow1: document.body.dataset.colorRow1 || '',
    skuName0: (document.querySelectorAll('.sku-name')[0] as HTMLInputElement).value,
    skuName1: (document.querySelectorAll('.sku-name')[1] as HTMLInputElement).value,
    price0: document.querySelector('[data-field="price-0"]')?.textContent?.trim() || '',
    price1: document.querySelector('[data-field="price-1"]')?.textContent?.trim() || '',
    declared0: document.querySelector('[data-field="declared-0"]')?.textContent?.trim() || '',
    declared1: document.querySelector('[data-field="declared-1"]')?.textContent?.trim() || '',
    stock0: document.querySelector('[data-field="stock-0"]')?.textContent?.trim() || '',
    stock1: document.querySelector('[data-field="stock-1"]')?.textContent?.trim() || '',
  }));

  assert.equal(snapshot.skuOpened, '1');
  assert.equal(snapshot.batchOpened, '1');
  assert.equal(snapshot.batchStockApplied, '20');
  assert.equal(snapshot.rowStockEdits, '0');
  assert.equal(snapshot.colorRow0, '蓝色');
  assert.equal(snapshot.colorRow1, '绿色');
  assert.equal(snapshot.skuName0, 'SKU Test A');
  assert.equal(snapshot.skuName1, 'SKU Test B');
  assert.equal(snapshot.price0, '1299');
  assert.equal(snapshot.price1, '1399');
  assert.equal(snapshot.declared0, '999');
  assert.equal(snapshot.declared1, '1099');
  assert.equal(snapshot.stock0, '20');
  assert.equal(snapshot.stock1, '20');
  assert.ok(Number(snapshot.rowPriceEdits) >= 2);
  assert.ok(Number(snapshot.rowDeclaredEdits) >= 2);

  await page.close();
  await browser.close();
});

test('fillSKUs avoids long fixed page waits when batch UI signals are already immediate', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(html);

  const waitCalls: number[] = [];
  const originalWaitForTimeout = page.waitForTimeout.bind(page);
  (page as Page & { waitForTimeout: (timeout: number) => Promise<void> }).waitForTimeout = async (timeout: number) => {
    waitCalls.push(timeout);
    return undefined;
  };

  try {
    await fillSKUs(page, makeProductData());
  } finally {
    (page as Page & { waitForTimeout: typeof originalWaitForTimeout }).waitForTimeout = originalWaitForTimeout;
  }

  const snapshot = await page.evaluate(() => ({
    batchStockApplied: document.body.dataset.batchStockApplied || '',
    price0: document.querySelector('[data-field="price-0"]')?.textContent?.trim() || '',
    price1: document.querySelector('[data-field="price-1"]')?.textContent?.trim() || '',
    declared0: document.querySelector('[data-field="declared-0"]')?.textContent?.trim() || '',
    declared1: document.querySelector('[data-field="declared-1"]')?.textContent?.trim() || '',
  }));

  assert.equal(snapshot.batchStockApplied, '20');
  assert.equal(snapshot.price0, '1299');
  assert.equal(snapshot.price1, '1399');
  assert.equal(snapshot.declared0, '999');
  assert.equal(snapshot.declared1, '1099');
  assert.ok(Math.max(...waitCalls) < 300, `unexpected page waits: ${waitCalls.join(', ')}`);

  await page.close();
  await browser.close();
});

test('fillSKUs does not stall on missing focused input after contenteditable row commit', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(`
<!doctype html>
<html>
  <body>
    <section id="sku-panel" style="display:block; margin-top: 16px;">
      <div class="posting-feild-color-item" data-row="0">
        <div class="ait-select" tabindex="0">
          <span class="ait-select-selection-item">选择主色系</span>
          <input class="color-combo" role="combobox" aria-label="光线颜色" />
        </div>
        <input class="sku-name" placeholder="自定义名称" />
      </div>

      <div class="sell-sku-head-cell col-skuPrice">零售价(CNY)</div>
      <div class="sell-sku-head-cell col-cargoPrice">货值(CNY)</div>
      <div class="sell-sku-head-cell col-skuStock">商家库存</div>

      <table>
        <tbody>
          <tr data-grid-row="0">
            <td class="sell-sku-cell col-skuPrice"><div contenteditable="true" class="editor" data-field="price-0"></div></td>
            <td class="sell-sku-cell col-cargoPrice"><div contenteditable="true" class="editor" data-field="declared-0"></div></td>
            <td class="sell-sku-cell col-skuStock"><div contenteditable="true" class="editor" data-field="stock-0"></div></td>
          </tr>
        </tbody>
      </table>
    </section>

    <script>
      const combo = document.querySelector('.color-combo');
      combo.dataset.index = '0';
      combo.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          combo.closest('.posting-feild-color-item').querySelector('.ait-select-selection-item').textContent = '蓝色';
          document.body.dataset.colorRow0 = '蓝色';
          event.preventDefault();
        }
      });
    </script>
  </body>
</html>
  `);

  const data = makeProductData();
  data.skus = [data.skus[0]];

  const started = Date.now();
  await fillSKUs(page, data);
  const elapsedMs = Date.now() - started;

  const snapshot = await page.evaluate(() => ({
    colorRow0: document.body.dataset.colorRow0 || '',
    skuName0: (document.querySelector('.sku-name') as HTMLInputElement).value,
    price0: document.querySelector('[data-field="price-0"]')?.textContent?.trim() || '',
    declared0: document.querySelector('[data-field="declared-0"]')?.textContent?.trim() || '',
    stock0: document.querySelector('[data-field="stock-0"]')?.textContent?.trim() || '',
  }));

  assert.equal(snapshot.colorRow0, '蓝色');
  assert.equal(snapshot.skuName0, 'SKU Test A');
  assert.equal(snapshot.price0, '1299');
  assert.equal(snapshot.declared0, '999');
  assert.equal(snapshot.stock0, '20');
  assert.ok(elapsedMs < 15000, `row fill stalled too long: ${elapsedMs}ms`);

  await page.close();
  await browser.close();
});

test('fillSKUs does not keep repeated 180ms post-cell waits when contenteditable cells commit immediately', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(`
<!doctype html>
<html>
  <body>
    <section id="sku-panel" style="display:block; margin-top: 16px;">
      <div class="posting-feild-color-item" data-row="0">
        <div class="ait-select" tabindex="0">
          <span class="ait-select-selection-item">选择主色系</span>
          <input class="color-combo" role="combobox" aria-label="光线颜色" />
        </div>
        <input class="sku-name" placeholder="自定义名称" />
      </div>

      <div class="sell-sku-head-cell col-skuPrice">零售价(CNY)</div>
      <div class="sell-sku-head-cell col-cargoPrice">货值(CNY)</div>
      <div class="sell-sku-head-cell col-skuStock">商家库存</div>

      <table>
        <tbody>
          <tr data-grid-row="0">
            <td class="sell-sku-cell col-skuPrice"><div contenteditable="true" class="editor" data-field="price-0"></div></td>
            <td class="sell-sku-cell col-cargoPrice"><div contenteditable="true" class="editor" data-field="declared-0"></div></td>
            <td class="sell-sku-cell col-skuStock"><div contenteditable="true" class="editor" data-field="stock-0"></div></td>
          </tr>
        </tbody>
      </table>
    </section>

    <script>
      const combo = document.querySelector('.color-combo');
      combo.dataset.index = '0';
      combo.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          combo.closest('.posting-feild-color-item').querySelector('.ait-select-selection-item').textContent = '蓝色';
          event.preventDefault();
        }
      });
    </script>
  </body>
</html>
  `);

  const waitCalls: number[] = [];
  const originalWaitForTimeout = page.waitForTimeout.bind(page);
  (page as Page & { waitForTimeout: (timeout: number) => Promise<void> }).waitForTimeout = async (timeout: number) => {
    waitCalls.push(timeout);
    return undefined;
  };

  const data = makeProductData();
  data.skus = [data.skus[0]];

  try {
    await fillSKUs(page, data);
  } finally {
    (page as Page & { waitForTimeout: typeof originalWaitForTimeout }).waitForTimeout = originalWaitForTimeout;
  }

  try {
    const snapshot = await page.evaluate(() => ({
      price0: document.querySelector('[data-field="price-0"]')?.textContent?.trim() || '',
      declared0: document.querySelector('[data-field="declared-0"]')?.textContent?.trim() || '',
      stock0: document.querySelector('[data-field="stock-0"]')?.textContent?.trim() || '',
    }));

    assert.equal(snapshot.price0, '1299');
    assert.equal(snapshot.declared0, '999');
    assert.equal(snapshot.stock0, '20');
    assert.ok(waitCalls.filter((timeout) => timeout === 180).length <= 1, `unexpected post-cell waits: ${waitCalls.join(', ')}`);
  } finally {
    await page.close();
    await browser.close();
  }
});

test('fillSKUs does not keep repeated 220ms retail-header waits when row cells are already visible', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(`
<!doctype html>
<html>
  <body>
    <section id="sku-panel" style="display:block; margin-top: 16px;">
      <div class="posting-feild-color-item" data-row="0">
        <div class="ait-select" tabindex="0">
          <span class="ait-select-selection-item">选择主色系</span>
          <input class="color-combo" role="combobox" aria-label="光线颜色" />
        </div>
        <input class="sku-name" placeholder="自定义名称" />
      </div>

      <table>
        <tbody>
          <tr data-grid-row="0">
            <td class="sell-sku-cell col-skuPrice"><div contenteditable="true" class="editor" data-field="price-0"></div></td>
            <td class="sell-sku-cell col-cargoPrice"><div contenteditable="true" class="editor" data-field="declared-0"></div></td>
            <td class="sell-sku-cell col-skuStock"><div contenteditable="true" class="editor" data-field="stock-0"></div></td>
          </tr>
        </tbody>
      </table>
    </section>

    <script>
      const combo = document.querySelector('.color-combo');
      combo.dataset.index = '0';
      combo.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          combo.closest('.posting-feild-color-item').querySelector('.ait-select-selection-item').textContent = '蓝色';
          event.preventDefault();
        }
      });
    </script>
  </body>
</html>
  `);

  const waitCalls: number[] = [];
  const originalWaitForTimeout = page.waitForTimeout.bind(page);
  (page as Page & { waitForTimeout: (timeout: number) => Promise<void> }).waitForTimeout = async (timeout: number) => {
    waitCalls.push(timeout);
    return undefined;
  };

  const data = makeProductData();
  data.skus = [data.skus[0]];

  try {
    await fillSKUs(page, data);
  } finally {
    (page as Page & { waitForTimeout: typeof originalWaitForTimeout }).waitForTimeout = originalWaitForTimeout;
  }

  try {
    const snapshot = await page.evaluate(() => ({
      price0: document.querySelector('[data-field="price-0"]')?.textContent?.trim() || '',
      declared0: document.querySelector('[data-field="declared-0"]')?.textContent?.trim() || '',
      stock0: document.querySelector('[data-field="stock-0"]')?.textContent?.trim() || '',
    }));

    assert.equal(snapshot.price0, '1299');
    assert.equal(snapshot.declared0, '999');
    assert.equal(snapshot.stock0, '20');
    assert.ok(
      waitCalls.filter((timeout) => timeout === 220).length <= 1,
      `unexpected retail-header waits: ${waitCalls.join(', ')}`,
    );
  } finally {
    await page.close();
    await browser.close();
  }
});

test('fillSKUs reports sub-phase progress in execution order', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(html);

  const progressActions: string[] = [];
  const progressDetails: string[] = [];
  const fillSKUsWithHooks = fillSKUs as (
    page: Page,
    data: ProductData,
    hooks?: {
      onProgress?: (event: { action: string; details: string }) => void | Promise<void>;
    },
  ) => Promise<void>;

  try {
    await fillSKUsWithHooks(page, makeProductData(), {
      onProgress(event) {
        progressActions.push(event.action);
        progressDetails.push(event.details);
      },
    });

    assert.deepEqual(progressActions, [
      'fill_sku_variants',
      'fill_sku_batch_fields',
      'fill_sku_row_values',
      'fill_sku_shared_fields',
    ]);
    assert.match(progressDetails[0] || '', /SKU 颜色|自定义名称/);
    assert.match(progressDetails[1] || '', /库存|重量|尺寸/);
    assert.match(progressDetails[2] || '', /价格|货值|库存/);
    assert.match(progressDetails[3] || '', /重量|尺寸/);
  } finally {
    await page.close();
    await browser.close();
  }
});

test('fillSKUs reports batch phase even when real page falls back to direct batch path without visible grid', async () => {
  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(`
<!doctype html>
<html>
  <body>
    <button id="sku-tab" role="tab" type="button">SKU价格与库存</button>
    <section id="sku-panel" style="display:block; margin-top: 16px;">
      <div class="posting-feild-color-item" data-row="0">
        <div class="ait-select" tabindex="0">
          <span class="ait-select-selection-item">选择主色系</span>
          <input class="color-combo" role="combobox" aria-label="光线颜色" />
        </div>
        <input class="sku-name" placeholder="自定义名称" />
      </div>
      <div class="posting-feild-color-item" data-row="1">
        <div class="ait-select" tabindex="0">
          <span class="ait-select-selection-item">选择主色系</span>
          <input class="color-combo" role="combobox" aria-label="光线颜色" />
        </div>
        <input class="sku-name" placeholder="自定义名称" />
      </div>

      <button id="batch-fill-btn" type="button">批量填充</button>
      <div id="batch-modal" class="next-overlay-wrapper" style="display:none; margin-top: 16px;">
        <label>零售价<input id="batch-price" placeholder="零售价(CNY)" /></label>
        <label>商家库存<input id="batch-stock" placeholder="商家库存" /></label>
        <label>重量<input id="batch-weight" placeholder="重量" /></label>
        <label>长<input id="batch-length" placeholder="长" /></label>
        <label>宽<input id="batch-width" placeholder="宽" /></label>
        <label>高<input id="batch-height" placeholder="高" /></label>
        <button id="fill-btn" type="button">填充</button>
      </div>
    </section>
    <script>
      const colors = ['蓝色', '绿色', '红色'];
      document.querySelectorAll('.color-combo').forEach((combo, rowIndex) => {
        combo.dataset.index = String(rowIndex);
        combo.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            combo.closest('.posting-feild-color-item').querySelector('.ait-select-selection-item').textContent = colors[rowIndex];
            event.preventDefault();
          }
        });
      });
      document.getElementById('batch-fill-btn').addEventListener('click', () => {
        document.getElementById('batch-modal').style.display = 'block';
      });
      document.getElementById('fill-btn').addEventListener('click', () => {
        document.getElementById('batch-modal').style.display = 'none';
      });
    </script>
  </body>
</html>
  `);

  const progressActions: string[] = [];
  const fillSKUsWithHooks = fillSKUs as (
    page: Page,
    data: ProductData,
    hooks?: {
      onProgress?: (event: { action: string; details: string }) => void | Promise<void>;
    },
  ) => Promise<void>;

  try {
    await fillSKUsWithHooks(page, makeProductData(), {
      onProgress(event) {
        progressActions.push(event.action);
      },
    });

    assert.deepEqual(progressActions, [
      'fill_sku_variants',
      'fill_sku_batch_fields',
      'fill_sku_shared_fields',
    ]);
  } finally {
    await page.close();
    await browser.close();
  }
});
