import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveMultiSkuBatchPlan } from '../src/modules';
import type { ProductData } from '../src/types';

function makeProductData(overrides: Partial<ProductData> = {}): ProductData {
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
        name: 'SKU A',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
        price_cny: 1299,
        declared_value_cny: 999,
        stock: 20,
        is_original_box: true,
      },
      {
        name: 'SKU B',
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
      total_weight_kg: 7,
      total_dimensions: { length_cm: 66, width_cm: 36, height_cm: 29 },
      shipping_template: '',
    },
    other_settings: {
      stock_deduction: '',
      eu_responsible_person: false,
      manufacturer_linked: false,
    },
    notes: '',
    gemini_raw_data: '',
    ...overrides,
  };
}

test('deriveMultiSkuBatchPlan omits stock when SKU stock is not uniform', () => {
  const plan = deriveMultiSkuBatchPlan(makeProductData({
    skus: [
      {
        name: 'SKU A',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUa.jpg',
        price_cny: 1299,
        declared_value_cny: 999,
        stock: 20,
        is_original_box: true,
      },
      {
        name: 'SKU B',
        image: 'FAMILY SUV/TOYOTA SIENNA/SKUb.jpg',
        price_cny: 1399,
        declared_value_cny: 1099,
        stock: 18,
        is_original_box: true,
      },
    ],
  }));

  assert.deepEqual(plan, {
    weightKg: '6.8',
    lengthCm: '64',
    widthCm: '34',
    heightCm: '27',
  });
});

test('deriveMultiSkuBatchPlan omits dimensions when any dimension is missing or non-positive', () => {
  const plan = deriveMultiSkuBatchPlan(makeProductData({
    package_dimensions: { length_cm: 64, width_cm: 0, height_cm: 27 },
  }));

  assert.deepEqual(plan, {
    stock: '20',
    weightKg: '6.8',
  });
});

test('deriveMultiSkuBatchPlan never leaks price or declared value into batch plan', () => {
  const plan = deriveMultiSkuBatchPlan(makeProductData());

  assert.equal('priceCny' in plan, false);
  assert.equal('declaredValueCny' in plan, false);
  assert.deepEqual(plan, {
    stock: '20',
    weightKg: '6.8',
    lengthCm: '64',
    widthCm: '34',
    heightCm: '27',
  });
});

test('deriveMultiSkuBatchPlan omits zero-like shared values', () => {
  const plan = deriveMultiSkuBatchPlan(makeProductData({
    weight_kg: 0,
    package_dimensions: { length_cm: 64, width_cm: 34, height_cm: 0 },
  }));

  assert.deepEqual(plan, {
    stock: '20',
  });
});
