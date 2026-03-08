import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { z } from 'zod';

// ============================================================
// 类型定义 — 对齐 product-data-template.yaml
// ============================================================

export interface Fitment {
    car_make: string;
    car_model: string;
    year: string;
    chassis_code?: string;
    generation?: string;
    facelift_status?: string;
    oem_part_number?: string;
}

export interface CustomAttributes {
    light_sources?: string;
    housing_material?: string;
    housing_color?: string;
    lens_material?: string;
    reflectors_color?: string;
    certification?: string;
    waterproof?: string;
    warranty?: string;
    lhd_rhd?: string;
    turn_signal?: string;
    running_light?: string;
    reverse_light?: string;
    brake_light?: string;
    fog_light?: string;
    dynamic_animation?: string;
    plug_spec?: string;
    canbus_requirement?: string;
    package_type?: string;
    whats_included?: string;
    [key: string]: string | undefined; // 其他自定义属性
}

export interface Attributes {
    brand: string;
    origin: string;
    product_type: string;
    hazardous_chemical: string;
    material: string;
    voltage: string;
    special_features: string[];
    accessory_position: string;
    fitment: Fitment;
    custom_attributes: CustomAttributes;
}

export interface SKU {
    name: string;
    image: string;
    price_cny: number;
    declared_value_cny: number;
    stock: number;
    is_original_box: boolean;
}

export interface ProductData {
    // 模块 1: 基本信息
    category: string;
    title: string;
    image_dir: string;
    carousel: string[];
    white_bg_image: string;
    marketing_image: string;
    video_file: string;
    video_selection_mode?: 'auto' | 'local' | 'media_center';

    // 模块 2: 商品属性
    attributes: Attributes;

    // 模块 3: 海关监管
    customs: { hs_code: string };

    // 模块 4: 价格与库存
    pricing_settings: { min_unit: string; sell_by: string };

    // 模块 5: SKU 变体
    taobao_price_cny: number;
    price_formula: { multiplier: number; shipping_buffer_cny: number };
    skus: SKU[];
    weight_kg: number;
    package_dimensions: { length_cm: number; width_cm: number; height_cm: number };
    wholesale: { min_quantity: number; discount_percent: number };

    // 模块 6: 详情描述
    buyers_note_template: string;
    buyers_note_extra: string;
    detail_images: string[];
    app_description: string;

    // 模块 7: 包装与物流
    shipping: {
        total_weight_kg: number;
        total_dimensions: { length_cm: number; width_cm: number; height_cm: number };
        shipping_template: string;
    };

    // 模块 8: 其它设置
    other_settings: {
        stock_deduction: string;
        eu_responsible_person: boolean;
        manufacturer_linked: boolean;
    };

    notes: string;
    gemini_raw_data: string;
}

const fitmentSchema = z.object({
    car_make: z.string().default(''),
    car_model: z.string().default(''),
    year: z.string().default(''),
    chassis_code: z.string().optional(),
    generation: z.string().optional(),
    facelift_status: z.string().optional(),
    oem_part_number: z.string().optional(),
});

const customAttributesSchema: z.ZodType<CustomAttributes> = z.record(z.string(), z.string()).default({});

const attributesSchema = z.object({
    brand: z.string().default(''),
    origin: z.string().default(''),
    product_type: z.string().default(''),
    hazardous_chemical: z.string().default(''),
    material: z.string().default(''),
    voltage: z.string().default(''),
    special_features: z.array(z.string()).default([]),
    accessory_position: z.string().default(''),
    fitment: fitmentSchema.default({ car_make: '', car_model: '', year: '' }),
    custom_attributes: customAttributesSchema,
});

const skuSchema = z.object({
    name: z.string().default(''),
    image: z.string().default(''),
    price_cny: z.coerce.number().finite(),
    declared_value_cny: z.coerce.number().finite(),
    stock: z.coerce.number().int().nonnegative(),
    is_original_box: z.boolean(),
});

const productDataSchema = z.object({
    category: z.string().default(''),
    title: z.string().default(''),
    image_dir: z.string().default(''),
    carousel: z.array(z.string()).default([]),
    white_bg_image: z.string().default(''),
    marketing_image: z.string().default(''),
    video_file: z.string().default(''),
    video_selection_mode: z.enum(['auto', 'local', 'media_center']).default('auto'),
    attributes: attributesSchema,
    customs: z.object({
        hs_code: z.string().default(''),
    }),
    pricing_settings: z.object({
        min_unit: z.string().default(''),
        sell_by: z.string().default(''),
    }),
    taobao_price_cny: z.coerce.number().finite(),
    price_formula: z.object({
        multiplier: z.coerce.number().finite(),
        shipping_buffer_cny: z.coerce.number().finite(),
    }),
    skus: z.array(skuSchema).default([]),
    weight_kg: z.coerce.number().finite(),
    package_dimensions: z.object({
        length_cm: z.coerce.number().finite(),
        width_cm: z.coerce.number().finite(),
        height_cm: z.coerce.number().finite(),
    }),
    wholesale: z.object({
        min_quantity: z.coerce.number().int().nonnegative(),
        discount_percent: z.coerce.number().finite(),
    }),
    buyers_note_template: z.string().default(''),
    buyers_note_extra: z.string().default(''),
    detail_images: z.array(z.string()).default([]),
    app_description: z.string().default(''),
    shipping: z.object({
        total_weight_kg: z.coerce.number().finite(),
        total_dimensions: z.object({
            length_cm: z.coerce.number().finite(),
            width_cm: z.coerce.number().finite(),
            height_cm: z.coerce.number().finite(),
        }),
        shipping_template: z.string().default(''),
    }),
    other_settings: z.object({
        stock_deduction: z.string().default(''),
        eu_responsible_person: z.boolean(),
        manufacturer_linked: z.boolean(),
    }),
    notes: z.string().default(''),
    gemini_raw_data: z.string().default(''),
});

export function parseProductData(raw: unknown, source: string = 'unknown'): ProductData {
    const parsed = productDataSchema.safeParse(raw);
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
            .join('; ');
        throw new Error(`YAML schema validation failed (${source}): ${details}`);
    }
    return parsed.data as ProductData;
}

/**
 * 从 YAML 文件加载产品数据
 */
export function loadProductData(yamlPath: string): ProductData {
    const absolutePath = path.resolve(yamlPath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`YAML 文件不存在: ${absolutePath}`);
    }
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const raw = yaml.load(content);
    const data = parseProductData(raw, absolutePath);

    // 基本验证
    if (!data.title) {
        console.warn('⚠️  标题为空');
    }
    if (!data.attributes?.fitment?.car_make) {
        console.warn('⚠️  车型品牌未填');
    }
    if (!data.skus || data.skus.length === 0) {
        console.warn('⚠️  SKU 列表为空');
    }

    return data;
}
