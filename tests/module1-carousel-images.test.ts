import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { fillCarouselImages } from '../src/modules';
import type { ProductData } from '../src/types';

function makeProductData(): ProductData {
  return {
    category: '',
    title: '',
    image_dir: '',
    carousel: [
      'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
      'FAMILY SUV/TOYOTA SIENNA/SKUb.jpg',
      'FAMILY SUV/TOYOTA SIENNA/SKUc.jpg',
      'FAMILY SUV/TOYOTA SIENNA/SKUd.jpg',
      'FAMILY SUV/TOYOTA SIENNA/SKUe.jpg',
      'FAMILY SUV/TOYOTA SIENNA/SKUf.jpg',
    ],
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
    <section id="carousel-images">
      <div>商品正面图</div>
      <div>商品背面图</div>
      <div>商品实拍图</div>
      <div>商品侧面图</div>
      <div>商品细节图</div>
      <div>商品细节图</div>
    </section>
  </body>
</html>
`;

let browser: Browser;

async function withPage(content: string, run: (page: Page) => Promise<void>): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setContent(content);
    await run(page);
  } finally {
    await page.close();
  }
}

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser.close();
});

test('fillCarouselImages returns manual_gate when configured carousel slots have no usable upload entry', async () => {
  await withPage(html, async (page) => {
    const result = await fillCarouselImages(page, makeProductData()) as {
      status: string;
      evidence: string[];
      screenshotPaths?: string[];
    };

    assert.equal(result.status, 'manual_gate');
    assert.ok((result.evidence.length || 0) >= 1);
    assert.ok((result.screenshotPaths?.length || 0) >= 1);
  });
});
