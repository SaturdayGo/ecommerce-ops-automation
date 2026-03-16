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
            <div class="ait-select-item-option">NONE(NONE)</div>
          </div>
        </div>
      </div>

      <div class="field-row" data-field="origin">
        <div class="field-label"><span>产地（国家或地区）</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">请选择</span></div>
          <div class="ait-select-dropdown" style="display:none">
            <div class="ait-select-item-option">中国大陆(Origin)(Mainland China)</div>
            <div class="ait-select-item-option">美国(Origin)(USA)</div>
          </div>
        </div>
      </div>

      <div class="field-row" data-field="product-type">
        <div class="field-label"><span>产品类型</span></div>
        <div class="field-control">
          <input id="product-type-input" placeholder="请输入或从列表选择" value="" />
          <div class="selected-display"></div>
          <div class="autocomplete" style="display:none">
            <div class="option">尾灯总成(Tail Light Assembly)</div>
            <div class="option">大灯总成(Headlight Assembly)</div>
          </div>
        </div>
      </div>

      <div class="field-row" data-field="voltage">
        <div class="field-label"><span>电压</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">请选择</span></div>
          <div class="ait-select-dropdown" style="display:none">
            <div class="ait-select-item-option">12伏(12 V)</div>
            <div class="ait-select-item-option">24伏(24 V)</div>
          </div>
        </div>
      </div>

      <div class="field-row" data-field="position">
        <div class="field-label"><span>配件位置</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">请选择</span></div>
          <div class="ait-select-dropdown" style="display:none">
            <div class="ait-select-item-option">左(Left)</div>
            <div class="ait-select-item-option">右(Right)</div>
            <div class="ait-select-item-option">右+左(Right & left)</div>
          </div>
        </div>
      </div>

      <div class="field-row" data-field="hazard">
        <div class="field-label"><span>高关注化学品</span></div>
        <div class="field-control">
          <button type="button" class="hazard-btn">设置</button>
        </div>
      </div>
    </section>

    <div class="hazard-modal" style="display:none">
      <div class="modal-title">指标选择</div>
      <label class="hazard-option">
        <input type="checkbox" id="hazard-none" />
        <span>无(None)</span>
      </label>
      <label class="hazard-option">
        <input type="checkbox" id="hazard-other" />
        <span>其他</span>
      </label>
      <button type="button" class="hazard-confirm">确定</button>
    </div>

    <script>
      const hideAllDropdowns = () => {
        document.querySelectorAll('.ait-select-dropdown').forEach((el) => {
          el.style.display = 'none';
        });
      };

      document.querySelectorAll('.field-row[data-field="brand"], .field-row[data-field="origin"], .field-row[data-field="voltage"], .field-row[data-field="position"]').forEach((row) => {
        const trigger = row.querySelector('.ait-select');
        const display = row.querySelector('.ait-select-selection-item');
        const dropdown = row.querySelector('.ait-select-dropdown');
        trigger.addEventListener('click', (event) => {
          event.stopPropagation();
          hideAllDropdowns();
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

      const productTypeInput = document.getElementById('product-type-input');
      const productTypeDisplay = document.querySelector('[data-field="product-type"] .selected-display');
      const autocomplete = document.querySelector('.autocomplete');
      const renderAutocomplete = () => {
        const keyword = productTypeInput.value.trim().toLowerCase();
        autocomplete.style.display = 'block';
        autocomplete.querySelectorAll('.option').forEach((opt) => {
          const visible = !keyword || opt.textContent.toLowerCase().includes(keyword);
          opt.style.display = visible ? 'block' : 'none';
        });
      };
      productTypeInput.addEventListener('click', renderAutocomplete);
      productTypeInput.addEventListener('input', renderAutocomplete);
      autocomplete.querySelectorAll('.option').forEach((opt) => {
        opt.addEventListener('click', () => {
          const selected = opt.textContent.trim();
          productTypeInput.value = selected;
          productTypeDisplay.textContent = selected;
          autocomplete.style.display = 'none';
          setTimeout(() => {
            productTypeInput.value = '';
          }, 80);
        });
      });

      const hazardBtn = document.querySelector('.hazard-btn');
      const hazardModal = document.querySelector('.hazard-modal');
      const hazardNone = document.getElementById('hazard-none');
      const hazardConfirm = document.querySelector('.hazard-confirm');
      hazardBtn.addEventListener('click', () => {
        hazardModal.style.display = 'block';
      });
      hazardConfirm.addEventListener('click', () => {
        hazardBtn.textContent = hazardNone.checked ? '无(None)' : '设置';
        hazardModal.style.display = 'none';
      });

      document.addEventListener('click', () => {
        hideAllDropdowns();
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
      voltage: '12伏(12 V)',
      special_features: [],
      accessory_position: '右+左(Right & left)',
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

test('fillAttributes handles brand/origin/product type/hazard modal with page-specific choices', async () => {
  await fillAttributes(page, makeProductData());

  const values = await page.evaluate(() => ({
    brand: document.querySelector('[data-field="brand"] .ait-select-selection-item')?.textContent?.trim(),
    origin: document.querySelector('[data-field="origin"] .ait-select-selection-item')?.textContent?.trim(),
    productTypeInput: (document.getElementById('product-type-input') as HTMLInputElement).value,
    productTypeDisplay: document.querySelector('[data-field="product-type"] .selected-display')?.textContent?.trim(),
    voltage: document.querySelector('[data-field="voltage"] .ait-select-selection-item')?.textContent?.trim(),
    position: document.querySelector('[data-field="position"] .ait-select-selection-item')?.textContent?.trim(),
    hazard: document.querySelector('.hazard-btn')?.textContent?.trim(),
  }));

  assert.equal(values.brand, 'NONE(NONE)');
  assert.equal(values.origin, '中国大陆(Origin)(Mainland China)');
  assert.equal(values.productTypeInput, '');
  assert.equal(values.productTypeDisplay, '尾灯总成(Tail Light Assembly)');
  assert.equal(values.voltage, '12伏(12 V)');
  assert.equal(values.position, '右+左(Right & left)');
  assert.equal(values.hazard, '无(None)');
});


test('fillAttributes accepts dropdowns whose committed value is rendered outside trigger text', async () => {
  const page2 = await browser.newPage();
  await page2.setContent(`
<!doctype html>
<html>
  <body>
    <section id="attrs">
      <h2>商品属性</h2>
      <div class="field-row" data-field="origin">
        <div class="field-label"><span>产地（国家或地区）</span></div>
        <div class="field-control">
          <span class="next-select" tabindex="0"><input role="combobox" aria-label="select" value="" /></span>
          <span class="selected-display"></span>
        </div>
      </div>
      <div class="field-row" data-field="voltage">
        <div class="field-label"><span>电压</span></div>
        <div class="field-control">
          <span class="next-select" tabindex="0"><input role="combobox" aria-label="select" value="" /></span>
          <span class="selected-display"></span>
        </div>
      </div>
      <div class="field-row" data-field="position">
        <div class="field-label"><span>配件位置</span></div>
        <div class="field-control">
          <span class="next-select" tabindex="0"><input role="combobox" aria-label="select" value="" /></span>
          <span class="selected-display"></span>
        </div>
      </div>
      <div class="next-overlay-wrapper" style="display:none"></div>
    </section>
    <script>
      const overlay = document.querySelector('.next-overlay-wrapper');
      const fieldOptions = {
        origin: ['中国大陆(Origin)(Mainland China)', '美国(Origin)(USA)'],
        voltage: ['12伏(12 V)', '24伏(24 V)'],
        position: ['左(Left)', '右(Right)', '右+左(Right & left)'],
      };
      const closeOverlay = () => {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
      };
      document.querySelectorAll('.field-row').forEach((row) => {
        const field = row.getAttribute('data-field');
        const trigger = row.querySelector('.next-select');
        const display = row.querySelector('.selected-display');
        trigger.addEventListener('click', (event) => {
          event.stopPropagation();
          overlay.innerHTML = '';
          fieldOptions[field].forEach((label) => {
            const li = document.createElement('li');
            li.textContent = label;
            li.setAttribute('role', 'option');
            li.addEventListener('click', (ev) => {
              ev.stopPropagation();
              display.textContent = label;
              closeOverlay();
            });
            overlay.appendChild(li);
          });
          overlay.style.display = 'block';
        });
      });
      document.addEventListener('click', closeOverlay);
    </script>
  </body>
</html>`);

  const data = makeProductData();
  data.attributes.brand = '';
  data.attributes.product_type = '';
  data.attributes.hazardous_chemical = '';
  data.attributes.material = '';
  data.attributes.fitment = { car_make: '', car_model: '', year: '' };

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    await fillAttributes(page2, data);
  } finally {
    console.log = originalLog;
  }

  const values = await page2.evaluate(() => ({
    origin: document.querySelector('[data-field="origin"] .selected-display')?.textContent?.trim(),
    voltage: document.querySelector('[data-field="voltage"] .selected-display')?.textContent?.trim(),
    position: document.querySelector('[data-field="position"] .selected-display')?.textContent?.trim(),
  }));

  assert.equal(values.origin, '中国大陆(Origin)(Mainland China)');
  assert.equal(values.voltage, '12伏(12 V)');
  assert.equal(values.position, '右+左(Right & left)');
  assert.ok(logs.some((line) => line.includes('✅ 属性命中: 产地')));
  assert.ok(logs.some((line) => line.includes('✅ 属性命中: 电压')));
  assert.ok(logs.some((line) => line.includes('✅ 属性命中: 配件位置')));
  assert.ok(!logs.some((line) => line.includes('↪️  属性未命中: 产地')));

  await page2.close();
});

test('fillAttributes does not blindly select changed real-page options when product type candidates drift', async () => {
  const page3 = await browser.newPage();
  await page3.setContent(`
<!doctype html>
<html>
  <body>
    <section id="attrs">
      <h2>商品属性</h2>
      <div class="field-row" data-field="brand">
        <div class="field-label"><span>品牌</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">NONE(NONE)</span></div>
        </div>
      </div>
      <div class="field-row" data-field="origin">
        <div class="field-label"><span>产地（国家或地区）</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">中国大陆(Origin)(Mainland China)</span></div>
        </div>
      </div>
      <div class="field-row" data-field="product-type">
        <div class="field-label"><span>产品类型</span></div>
        <div class="field-control">
          <input id="product-type-input" placeholder="请输入或从列表选择" value="" />
          <div class="selected-display"></div>
          <div class="autocomplete" style="display:none">
            <div class="option">日行灯(Day Light)</div>
            <div class="option">大灯总成(Headlight Assembly)</div>
          </div>
        </div>
      </div>
      <div class="field-row" data-field="hazard">
        <div class="field-label"><span>高关注化学品</span></div>
        <div class="field-control"><button type="button" class="hazard-btn">无(None)</button></div>
      </div>
      <div class="field-row" data-field="voltage">
        <div class="field-label"><span>电压</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">12伏(12 V)</span></div>
        </div>
      </div>
      <div class="field-row" data-field="position">
        <div class="field-label"><span>配件位置</span></div>
        <div class="field-control">
          <div class="ait-select"><span class="ait-select-selection-item">右+左(Right & left)</span></div>
        </div>
      </div>
    </section>
    <script>
      const input = document.getElementById('product-type-input');
      const autocomplete = document.querySelector('.autocomplete');
      window.__productTypeFallbackEnter = 0;
      input.addEventListener('click', () => autocomplete.style.display = 'block');
      input.addEventListener('input', () => autocomplete.style.display = 'block');
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') window.__productTypeFallbackEnter += 1;
      });
      autocomplete.querySelectorAll('.option').forEach((opt) => {
        opt.addEventListener('click', () => {
          input.value = opt.textContent.trim();
          document.querySelector('.selected-display').textContent = opt.textContent.trim();
          autocomplete.style.display = 'none';
        });
      });
    </script>
  </body>
</html>
  `);

  await fillAttributes(page3, makeProductData());

  const values = await page3.evaluate(() => ({
    productTypeInput: (document.getElementById('product-type-input') as HTMLInputElement).value,
    productTypeDisplay: document.querySelector('[data-field="product-type"] .selected-display')?.textContent?.trim() || '',
    fallbackEnter: (window as typeof window & { __productTypeFallbackEnter: number }).__productTypeFallbackEnter,
  }));

  assert.equal(values.productTypeInput, '尾灯总成(Tail Light Assembly)');
  assert.equal(values.productTypeDisplay, '');
  assert.equal(values.fallbackEnter, 0);

  await page3.close();
});

test('fillAttributes aborts voltage dropdown fallback when visible options drift away from expected hints', async () => {
  const page4 = await browser.newPage();
  await page4.setContent(`
<!doctype html>
<html>
  <body>
    <section id="attrs">
      <h2>商品属性</h2>
      <div class="field-row" data-field="voltage">
        <div class="field-label"><span>电压</span></div>
        <div class="field-control">
          <div id="voltage-trigger" class="ait-select" tabindex="0">
            <span class="ait-select-selection-item">请选择</span>
          </div>
        </div>
      </div>
    </section>
    <div id="overlay" style="display:none"></div>
    <script>
      const trigger = document.getElementById('voltage-trigger');
      const overlay = document.getElementById('overlay');
      const display = trigger.querySelector('.ait-select-selection-item');
      const options = ['36伏(36 V)', '48伏(48 V)'];
      let activeIndex = -1;
      window.__voltageArrowDown = 0;
      window.__voltageEnter = 0;

      const closeOverlay = () => {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
        activeIndex = -1;
      };

      const commitOption = (index) => {
        if (index < 0 || index >= options.length) return;
        display.textContent = options[index];
        closeOverlay();
      };

      const renderOverlay = () => {
        overlay.innerHTML = '';
        options.forEach((label, index) => {
          const option = document.createElement('div');
          option.setAttribute('role', 'option');
          option.textContent = label;
          option.addEventListener('click', () => commitOption(index));
          overlay.appendChild(option);
        });
      };

      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        renderOverlay();
        overlay.style.display = 'block';
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          window.__voltageArrowDown += 1;
          if (overlay.style.display === 'block') {
            activeIndex = Math.min(activeIndex + 1, options.length - 1);
          }
        }
        if (event.key === 'Enter') {
          window.__voltageEnter += 1;
          if (overlay.style.display === 'block' && activeIndex >= 0) {
            commitOption(activeIndex);
          }
        }
        if (event.key === 'Escape') {
          closeOverlay();
        }
      });
    </script>
  </body>
</html>
  `);

  const data = makeProductData();
  data.attributes.brand = '';
  data.attributes.origin = '';
  data.attributes.product_type = '';
  data.attributes.hazardous_chemical = '';
  data.attributes.accessory_position = '';

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    await fillAttributes(page4, data);
  } finally {
    console.log = originalLog;
  }

  const values = await page4.evaluate(() => ({
    voltageText: document.querySelector('#voltage-trigger .ait-select-selection-item')?.textContent?.trim() || '',
    overlayVisible: document.getElementById('overlay')?.style.display === 'block',
    arrowDown: (window as typeof window & { __voltageArrowDown: number }).__voltageArrowDown,
    enter: (window as typeof window & { __voltageEnter: number }).__voltageEnter,
  }));

  assert.equal(values.voltageText, '请选择');
  assert.equal(values.overlayVisible, false);
  assert.equal(values.arrowDown, 0);
  assert.equal(values.enter, 0);
  assert.ok(logs.some((line) => line.includes('当前真实交互与预期不一致')));
  assert.ok(logs.some((line) => line.includes('↪️  属性未命中: 电压')));

  await page4.close();
});
