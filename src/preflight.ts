import fs from 'fs';
import path from 'path';

import type { ExecutionPlan, ModuleId } from './execution-plan';
import { shouldRunModule } from './execution-plan';
import { resolveLocalVideoUploadSpec } from './modules/video';
import type { ProductData } from './types';

export interface PreflightGate {
  name: string;
  passed: boolean;
  evidence: string;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  gates: PreflightGate[];
}

function hasNonEmpty(values: Array<string | undefined | null>): boolean {
  return values.some((value) => typeof value === 'string' && value.trim().length > 0);
}

function addGate(gates: PreflightGate[], name: string, passed: boolean, evidence: string): void {
  gates.push({ name, passed, evidence });
}

function fail(result: PreflightResult, gateName: string, message: string, evidence: string): void {
  result.errors.push(message);
  addGate(result.gates, gateName, false, evidence);
}

function warn(result: PreflightResult, gateName: string, message: string, evidence: string): void {
  result.warnings.push(message);
  addGate(result.gates, gateName, true, evidence);
}

function pass(result: PreflightResult, gateName: string, evidence: string): void {
  addGate(result.gates, gateName, true, evidence);
}

function resolveBuyersNoteTemplatePath(templatePath: string, yamlPath: string): string | null {
  const trimmed = (templatePath || '').trim();
  if (!trimmed) return null;

  const repoRoot = path.resolve(__dirname, '..');
  const legacyRoot = path.resolve(repoRoot, '..');
  const yamlDir = path.dirname(path.resolve(yamlPath));
  const candidates = path.isAbsolute(trimmed)
    ? [trimmed]
    : [
        path.resolve(yamlDir, trimmed),
        path.resolve(repoRoot, trimmed),
        path.resolve(legacyRoot, trimmed),
        path.resolve(process.cwd(), trimmed),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

export function validatePreflight(
  data: ProductData,
  plan: ExecutionPlan,
  yamlPath: string,
): PreflightResult {
  const result: PreflightResult = {
    ok: true,
    errors: [],
    warnings: [],
    gates: [],
  };

  const requireField = (moduleId: ModuleId, gateName: string, value: string | undefined, message: string) => {
    if (!shouldRunModule(plan, moduleId)) return;
    if ((value || '').trim()) {
      pass(result, gateName, value!.trim());
      return;
    }
    fail(result, gateName, message, 'empty');
  };

  requireField('1a', 'category_present', data.category, '类目为空，无法执行模块 1a');
  requireField('1b', 'title_present', data.title, '标题为空，无法执行模块 1b');

  if (shouldRunModule(plan, '1c')) {
    const count = (data.carousel || []).filter((item) => (item || '').trim()).length;
    if (count > 0) {
      pass(result, 'carousel_present', `${count} image(s)`);
    } else {
      fail(result, 'carousel_present', '轮播图为空，无法执行模块 1c', '0 image(s)');
    }
  }

  if (shouldRunModule(plan, '1d')) {
    const images = [data.white_bg_image, data.marketing_image].filter((item) => (item || '').trim());
    if (images.length > 0) {
      pass(result, 'marketing_images_present', images.join(', '));
    } else {
      fail(result, 'marketing_images_present', '营销图为空，无法执行模块 1d', 'no white/marketing image');
    }
  }

  if (shouldRunModule(plan, '1e')) {
    const videoFile = (data.video_file || '').trim();
    if (!videoFile) {
      fail(result, 'video_file_present', '视频文件为空，无法执行模块 1e', 'empty');
    } else {
      pass(result, 'video_file_present', videoFile);
      if ((data.video_selection_mode || 'auto') === 'local') {
        const localSpec = resolveLocalVideoUploadSpec(videoFile);
        if (!localSpec) {
          fail(result, 'video_local_exists', `视频本地文件不存在，无法执行模块 1e: ${videoFile}`, videoFile);
        } else {
          pass(result, 'video_local_exists', localSpec.absolutePath);
        }
      } else if ((data.video_selection_mode || 'auto') === 'media_center') {
        warn(result, 'video_media_center_mode', '视频模块使用媒体中心模式，需依赖平台媒体库内容', videoFile);
      }
    }
  }

  if (shouldRunModule(plan, '3')) {
    if ((data.customs?.hs_code || '').trim()) {
      pass(result, 'customs_hs_present', data.customs.hs_code.trim());
    } else {
      warn(result, 'customs_hs_present', '海关编码为空；模块 3 预计走默认值/人工门禁', 'empty');
    }
  }

  if (shouldRunModule(plan, '4')) {
    const minUnit = (data.pricing_settings?.min_unit || '').trim();
    const sellBy = (data.pricing_settings?.sell_by || '').trim();
    if (!minUnit) {
      fail(result, 'pricing_min_unit_present', '最小计量单元为空，无法执行模块 4', 'empty');
    } else {
      pass(result, 'pricing_min_unit_present', minUnit);
    }
    if (!sellBy) {
      fail(result, 'pricing_sell_by_present', '销售方式为空，无法执行模块 4', 'empty');
    } else {
      pass(result, 'pricing_sell_by_present', sellBy);
    }
  }

  if (shouldRunModule(plan, '5')) {
    const skuCount = data.skus?.length || 0;
    if (skuCount > 0) {
      pass(result, 'sku_present', `${skuCount} sku(s)`);
    } else {
      fail(result, 'sku_present', 'SKU 为空，无法执行模块 5', '0 sku(s)');
    }
  }

  if (shouldRunModule(plan, '6a')) {
    const templatePath = (data.buyers_note_template || '').trim();
    if (!templatePath) {
      fail(result, 'buyers_note_template_present', '买家须知模板为空，无法执行模块 6a', 'empty');
    } else {
      const resolvedPath = resolveBuyersNoteTemplatePath(templatePath, yamlPath);
      if (!resolvedPath) {
        fail(result, 'buyers_note_template_exists', `买家须知模板不存在，无法执行模块 6a: ${templatePath}`, templatePath);
      } else {
        pass(result, 'buyers_note_template_exists', resolvedPath);
      }
    }
  }

  if (shouldRunModule(plan, '6b')) {
    const count = (data.detail_images || []).filter((item) => (item || '').trim()).length;
    if (count > 0) {
      pass(result, 'detail_images_present', `${count} image(s)`);
    } else {
      fail(result, 'detail_images_present', '详情图为空，无法执行模块 6b', '0 image(s)');
    }
  }

  if (shouldRunModule(plan, '6c')) {
    if ((data.app_description || '').trim()) {
      pass(result, 'app_description_present', `${data.app_description.trim().length} chars`);
    } else {
      warn(result, 'app_description_present', 'APP 描述为空；模块 6c 预计直接进入人工门禁', 'empty');
    }
  }

  if (shouldRunModule(plan, '7')) {
    const weight = Number(data.shipping?.total_weight_kg || 0);
    const dims = data.shipping?.total_dimensions;
    const dimValues = [dims?.length_cm || 0, dims?.width_cm || 0, dims?.height_cm || 0].map(Number);
    if (!(weight > 0)) {
      fail(result, 'shipping_weight_positive', '物流总重量必须大于 0，无法执行模块 7', String(weight));
    } else {
      pass(result, 'shipping_weight_positive', String(weight));
    }
    if (dimValues.every((value) => value > 0)) {
      pass(result, 'shipping_dimensions_positive', dimValues.join('x'));
    } else {
      fail(result, 'shipping_dimensions_positive', '物流总尺寸必须全部大于 0，无法执行模块 7', dimValues.join('x'));
    }
  }

  if (shouldRunModule(plan, '8')) {
    warn(result, 'other_settings_manual_gate', '模块 8 当前为人工门禁；预检不阻止执行', 'manual_gate');
  }

  result.ok = result.errors.length === 0;
  return result;
}
