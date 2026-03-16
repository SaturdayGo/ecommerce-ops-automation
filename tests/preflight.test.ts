import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { buildExecutionPlan } from '../src/execution-plan';
import type { ProductData } from '../src/types';
import { validatePreflight } from '../src/preflight';

function makeProductData(): ProductData {
  return {
    category: '汽车及零配件 / 车灯 / 头灯总成',
    title: 'fit for test headlight assembly',
    image_dir: 'HeadLights/BENZ W221',
    carousel: ['HeadLights/BENZ W221/a_01.jpg'],
    white_bg_image: 'HeadLights/BENZ W221/white.jpg',
    marketing_image: 'HeadLights/BENZ W221/scene.jpg',
    video_file: '',
    video_selection_mode: 'auto',
    attributes: {
      brand: 'NONE(NONE)',
      origin: '中国大陆(Origin)(Mainland China)',
      product_type: '头灯总成(Headlight Assembly)',
      hazardous_chemical: '无(None)',
      material: 'PP+PC',
      voltage: '12伏(12 V)',
      special_features: [],
      accessory_position: '右+左(Right & left)',
      fitment: {
        car_make: 'Mercedes-Benz',
        car_model: 'W221',
        year: '2006-2012',
      },
      custom_attributes: {},
    },
    customs: { hs_code: '' },
    pricing_settings: { min_unit: '件/个 (piece/pieces)', sell_by: '按 件 出售' },
    taobao_price_cny: 1000,
    price_formula: { multiplier: 2.5, shipping_buffer_cny: 300 },
    skus: [
      {
        name: 'Default',
        image: 'HeadLights/BENZ W221/SKUa.jpg',
        price_cny: 1299,
        declared_value_cny: 999,
        stock: 20,
        is_original_box: true,
      },
    ],
    weight_kg: 6.8,
    package_dimensions: { length_cm: 64, width_cm: 34, height_cm: 27 },
    wholesale: { min_quantity: 2, discount_percent: 5 },
    buyers_note_template: '',
    buyers_note_extra: '',
    detail_images: ['HeadLights/BENZ W221/d_01.jpg'],
    app_description: '',
    shipping: {
      total_weight_kg: 7,
      total_dimensions: { length_cm: 66, width_cm: 36, height_cm: 29 },
      shipping_template: 'default',
    },
    other_settings: {
      stock_deduction: '下单后减库存',
      eu_responsible_person: false,
      manufacturer_linked: false,
    },
    notes: '',
    gemini_raw_data: '',
  };
}

test('preflight ignores unselected modules', () => {
  const data = makeProductData();
  data.video_file = '';
  data.buyers_note_template = '';
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['1a', '1b'] });

  const result = validatePreflight(data, plan, '/tmp/test.yaml');

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('preflight fails when selected 1e local video file is missing', () => {
  const data = makeProductData();
  data.video_file = '/tmp/does-not-exist.mp4';
  data.video_selection_mode = 'local';
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['1e'] });

  const result = validatePreflight(data, plan, '/tmp/test.yaml');

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /视频.*不存在/i);
});

test('preflight does not fail media_center video mode for missing local file', () => {
  const data = makeProductData();
  data.video_file = '/tmp/does-not-exist.mp4';
  data.video_selection_mode = 'media_center';
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['1e'] });

  const result = validatePreflight(data, plan, '/tmp/test.yaml');

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings.join('\n'), /媒体中心/i);
});

test('preflight fails when selected 6a template file is missing', () => {
  const data = makeProductData();
  data.buyers_note_template = 'templates/missing-buyers-note.html';
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['6a'] });

  const result = validatePreflight(data, plan, '/Users/aiden/Documents/Antigravity/ecommerce-ops/products/test.yaml');

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /买家须知模板.*不存在/i);
});

test('preflight resolves selected 6a template relative to yaml path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  const yamlDir = path.join(tempRoot, 'products');
  const templateDir = path.join(tempRoot, 'templates');
  fs.mkdirSync(yamlDir, { recursive: true });
  fs.mkdirSync(templateDir, { recursive: true });
  const templatePath = path.join(templateDir, 'buyers-guide.html');
  fs.writeFileSync(templatePath, '<p>ok</p>', 'utf8');

  const data = makeProductData();
  data.buyers_note_template = '../templates/buyers-guide.html';
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['6a'] });

  const result = validatePreflight(data, plan, path.join(yamlDir, 'test.yaml'));

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('preflight fails when selected module 5 has no skus', () => {
  const data = makeProductData();
  data.skus = [];
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['5'] });

  const result = validatePreflight(data, plan, '/tmp/test.yaml');

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /SKU/i);
});

test('preflight warns but does not fail customs module when hs code is empty', () => {
  const data = makeProductData();
  data.customs.hs_code = '';
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['3'] });

  const result = validatePreflight(data, plan, '/tmp/test.yaml');

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings.join('\n'), /海关/i);
});
