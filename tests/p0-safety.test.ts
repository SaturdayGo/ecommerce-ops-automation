import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveListingTitle,
  resolveSkuCustomName,
  deriveMultiSkuBatchPlan,
} from '../src/modules';
import { parseProductData } from '../src/types';

function makeProductData() {
  return {
    category: '',
    title: 'Real YAML Title',
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
      material: 'PP+PC',
      voltage: '12V',
      special_features: [],
      accessory_position: '',
      fitment: {
        car_make: 'Toyota',
        car_model: 'Sienna',
        year: '2021-2025',
      },
      custom_attributes: {
        light_sources: '',
        housing_material: '',
        housing_color: '',
        lens_material: '',
        reflectors_color: '',
        certification: '',
        waterproof: '',
        warranty: '',
        lhd_rhd: '',
        turn_signal: '',
        running_light: '',
        reverse_light: '',
        brake_light: '',
        fog_light: '',
        dynamic_animation: '',
        plug_spec: '',
        canbus_requirement: '',
        package_type: '',
        whats_included: '',
      },
    },
    customs: { hs_code: '' },
    pricing_settings: { min_unit: '双', sell_by: '双' },
    taobao_price_cny: 0,
    price_formula: { multiplier: 2.5, shipping_buffer_cny: 300 },
    skus: [
      {
        name: 'Smoky Black',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
        price_cny: 1299,
        declared_value_cny: 999,
        stock: 20,
        is_original_box: true,
      },
      {
        name: 'Red Clear',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUb.jpg',
        price_cny: 1399,
        declared_value_cny: 1099,
        stock: 20,
        is_original_box: true,
      },
    ],
    weight_kg: 6.8,
    package_dimensions: { length_cm: 64, width_cm: 34, height_cm: 27 },
    wholesale: { min_quantity: 2, discount_percent: 5 },
    buyers_note_template: '',
    buyers_note_extra: '',
    detail_images: [],
    app_description: '',
    shipping: {
      total_weight_kg: 7,
      total_dimensions: { length_cm: 66, width_cm: 36, height_cm: 29 },
      shipping_template: '',
    },
    other_settings: {
      stock_deduction: '下单后减库存',
      eu_responsible_person: true,
      manufacturer_linked: true,
    },
    notes: '',
    gemini_raw_data: '',
  };
}

test('resolveListingTitle uses YAML title directly', () => {
  const data = makeProductData();
  assert.equal(resolveListingTitle(data), 'Real YAML Title');
});

test('resolveSkuCustomName prefers SKU name and falls back to image basename', () => {
  assert.equal(
    resolveSkuCustomName({
      name: 'Crystal Smoke',
      image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
    }),
    'Crystal Smoke',
  );

  assert.equal(
    resolveSkuCustomName({
      name: '   ',
      image: 'FAMILY SUV/TOYOTA SIENNA/SKUb.jpg',
    }),
    'SKUb',
  );
});

test('deriveMultiSkuBatchPlan only emits shared fields', () => {
  const plan = deriveMultiSkuBatchPlan(makeProductData());

  assert.deepEqual(plan, {
    stock: '20',
    weightKg: '6.8',
    lengthCm: '64',
    widthCm: '34',
    heightCm: '27',
  });
});

test('parseProductData rejects schema-invalid payloads', () => {
  const invalid = makeProductData();
  invalid.skus = 'bad-shape' as never;

  assert.throws(() => parseProductData(invalid, 'unit-test'), /skus/i);
});
