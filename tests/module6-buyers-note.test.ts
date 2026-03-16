import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

import { fillBuyersNote } from '../src/modules';
import type { ProductData } from '../src/types';

const html = `
<!doctype html>
<html>
  <body>
    <section>
      <h2>详情描述</h2>
      <div id="editor" contenteditable="true"></div>
    </section>
    <script>
      window.__buyersNoteEvents = { input: 0, change: 0, blur: 0 };
      const editor = document.getElementById('editor');
      editor.addEventListener('input', () => window.__buyersNoteEvents.input += 1);
      editor.addEventListener('change', () => window.__buyersNoteEvents.change += 1);
      editor.addEventListener('blur', () => {
        window.__buyersNoteEvents.blur += 1;
        editor.setAttribute('data-committed-html', editor.innerHTML);
      });
    </script>
  </body>
</html>
`;

function makeProductData(templatePath: string): ProductData {
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
    buyers_note_template: templatePath,
    buyers_note_extra: 'Module 6 extra note',
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
const repoRoot = path.resolve(__dirname, '..');
const templateAbsolutePath = path.join(repoRoot, 'templates', 'test-buyers-note.html');
const templateRelativePath = 'templates/test-buyers-note.html';

test.before(async () => {
  browser = await chromium.launch({ headless: true });
  fs.mkdirSync(path.dirname(templateAbsolutePath), { recursive: true });
  fs.writeFileSync(templateAbsolutePath, '<p><strong>Buyer note template</strong></p>', 'utf8');
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
  fs.rmSync(templateAbsolutePath, { force: true });
});

test('fillBuyersNote injects HTML and dispatches commit-like events for contenteditable editors', async () => {
  await fillBuyersNote(page, makeProductData(templateRelativePath));

  const result = await page.evaluate(() => {
    const editor = document.getElementById('editor');
    return {
      html: editor?.innerHTML || '',
      committed: editor?.getAttribute('data-committed-html') || '',
      events: (window as typeof window & { __buyersNoteEvents: { input: number; change: number; blur: number } }).__buyersNoteEvents,
    };
  });

  assert.match(result.html, /Buyer note template/);
  assert.match(result.html, /Module 6 extra note/);
  assert.match(result.committed, /Buyer note template/);
  assert.ok(result.events.input >= 1);
  assert.ok(result.events.change >= 1);
  assert.ok(result.events.blur >= 1);
});
