import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function writePreflightBlockedYaml(targetPath: string): void {
  fs.writeFileSync(
    targetPath,
    `
category: "汽车及零配件 / 车灯 / 头灯总成"
title: "Test - Preflight Blocked"
image_dir: "HeadLights/BENZ W221"
carousel:
  - "HeadLights/BENZ W221/a_01.jpg"
white_bg_image: "HeadLights/BENZ W221/white.jpg"
marketing_image: "HeadLights/BENZ W221/scene.jpg"
video_file: ""
video_selection_mode: "auto"
attributes:
  brand: "NONE(NONE)"
  origin: "中国大陆(Origin)(Mainland China)"
  product_type: "头灯总成(Headlight Assembly)"
  hazardous_chemical: "无(None)"
  material: "PP+PC"
  voltage: "12伏(12 V)"
  special_features: []
  accessory_position: "右+左(Right & left)"
  fitment:
    car_make: "Mercedes-Benz"
    car_model: "W221"
    year: "2006-2012"
  custom_attributes: {}
customs:
  hs_code: ""
pricing_settings:
  min_unit: "件/个 (piece/pieces)"
  sell_by: "按 件 出售"
taobao_price_cny: 1000
price_formula:
  multiplier: 2.5
  shipping_buffer_cny: 300
skus:
  - name: "Default"
    image: "HeadLights/BENZ W221/SKUa.jpg"
    price_cny: 1299
    declared_value_cny: 999
    stock: 20
    is_original_box: true
weight_kg: 6.8
package_dimensions:
  length_cm: 64
  width_cm: 34
  height_cm: 27
wholesale:
  min_quantity: 2
  discount_percent: 5
buyers_note_template: ""
buyers_note_extra: ""
detail_images:
  - "HeadLights/BENZ W221/d_01.jpg"
app_description: ""
shipping:
  total_weight_kg: 7
  total_dimensions:
    length_cm: 66
    width_cm: 36
    height_cm: 29
  shipping_template: "default"
other_settings:
  stock_deduction: "下单后减库存"
  eu_responsible_person: false
  manufacturer_linked: false
notes: ""
gemini_raw_data: ""
`.trimStart(),
    'utf8',
  );
}

function readOptionalFile(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

test('main blocks invalid selected-module run before browser launch and clears stale handoff pointer', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'main-preflight-blocked-'));
  const tempRuntimeDir = path.join(tempRoot, 'runtime');
  fs.mkdirSync(tempRuntimeDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempRuntimeDir, 'latest-handoff.json'),
    JSON.stringify({ run_id: 'run-stale' }, null, 2) + '\n',
    'utf8',
  );

  const yamlPath = path.join(tempRoot, 'preflight-video-empty.yaml');
  writePreflightBlockedYaml(yamlPath);

  const browserLaunchMarker = path.join(tempRoot, 'browser-launched.marker');
  const repoStatePath = path.join(repoRoot, 'runtime', 'state.json');
  const repoLatestHandoffPath = path.join(repoRoot, 'runtime', 'latest-handoff.json');
  const repoStateBackup = readOptionalFile(repoStatePath);
  const repoLatestHandoffBackup = readOptionalFile(repoLatestHandoffPath);

  try {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(repoRoot, 'src/main.ts'), yamlPath, '--modules=1e'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          AUTOMATION_PROJECT_ROOT: tempRoot,
          AUTOMATION_TEST_BROWSER_LAUNCH_MARKER: browserLaunchMarker,
        },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 1);

    const runtimeStatePath = path.join(tempRoot, 'runtime', 'state.json');
    assert.equal(fs.existsSync(runtimeStatePath), true);

    const state = JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8')) as {
      run_id: string;
      status: string;
      state: { code: string };
      evidence: { log_path: string };
    };
    assert.match(state.run_id, /^run-/);
    assert.equal(state.status, 'blocked');
    assert.equal(state.state.code, 'S0');
    assert.match(state.evidence.log_path, /^runlogs\/.+_modules-1e\.log$/);

    assert.equal(fs.existsSync(path.join(tempRoot, 'runtime', 'latest-handoff.json')), false);
    assert.equal(fs.existsSync(browserLaunchMarker), false);
  } finally {
    if (repoStateBackup === null) {
      fs.rmSync(repoStatePath, { force: true });
    } else {
      fs.mkdirSync(path.dirname(repoStatePath), { recursive: true });
      fs.writeFileSync(repoStatePath, repoStateBackup, 'utf8');
    }

    if (repoLatestHandoffBackup === null) {
      fs.rmSync(repoLatestHandoffPath, { force: true });
    } else {
      fs.mkdirSync(path.dirname(repoLatestHandoffPath), { recursive: true });
      fs.writeFileSync(repoLatestHandoffPath, repoLatestHandoffBackup, 'utf8');
    }
  }
});
