import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  formatHudPayload,
  getHudEvaluateSource,
  getHudVisualTone,
  getRuntimeObservabilityConfig,
  recordRuntimeEvent,
} from '../src/runtime-observability';

test('getRuntimeObservabilityConfig is disabled by default', () => {
  const config = getRuntimeObservabilityConfig('/tmp/project/browser-video/run-test_smoke', {});
  assert.equal(config.enabled, false);
  assert.match(config.eventsPath, /events\.json$/);
  assert.equal(config.warnAfterMs, 3000);
  assert.equal(config.alertAfterMs, 8000);
});

test('getRuntimeObservabilityConfig reuses browser-video artifact root when enabled', () => {
  const config = getRuntimeObservabilityConfig('/tmp/project/artifacts/browser-video/run-test_smoke', {
    RECORD_BROWSER_VIDEO: '1',
  });
  assert.equal(config.enabled, true);
  assert.equal(config.eventsPath, '/tmp/project/artifacts/browser-video/run-test_smoke/events.json');
});

test('recordRuntimeEvent appends ordered JSON events', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-observability-'));
  const config = getRuntimeObservabilityConfig(tempRoot, { RECORD_BROWSER_VIDEO: '1' });

  recordRuntimeEvent(config, {
    ts: '2026-03-06T14:00:00.000Z',
    state: 'S2',
    module: '商品属性',
    field: '电压',
    action: 'fill_attributes',
    status: 'running',
    details: 'waiting_commit_stable',
  });
  recordRuntimeEvent(config, {
    ts: '2026-03-06T14:00:02.000Z',
    state: 'S2',
    module: '商品属性',
    field: '配件位置',
    action: 'fill_attributes',
    status: 'running',
    details: 'committed',
  });

  const events = JSON.parse(fs.readFileSync(config.eventsPath, 'utf8'));
  assert.equal(events.length, 2);
  assert.equal(events[0].field, '电压');
  assert.equal(events[1].field, '配件位置');
  assert.equal(events[0].status_label, '进行中');
  assert.equal(events[0].duration_ms, 2000);
  assert.equal(events[0].tone, 'normal');
  assert.equal(events[1].status_label, '进行中');
});

test('formatHudPayload humanizes common runtime actions', () => {
  const payload = formatHudPayload({
    state: { code: 'S3', name: 'Module2Stable' },
    module: { name: '商品属性' },
    target: { field_label: '电压' },
    last_action: { kind: 'fill_attributes', description: 'Module 2 attribute flow completed.' },
    status: 'running',
  });

  assert.equal(payload.stateLabel, 'S3 / Module2Stable');
  assert.equal(payload.moduleLabel, '商品属性');
  assert.equal(payload.fieldLabel, '电压');
  assert.equal(payload.actionLabel, '商品属性已提交稳定');
  assert.equal(payload.statusLabel, '进行中');
});

test('formatHudPayload preserves explicit Chinese action labels', () => {
  const payload = formatHudPayload({
    state: { code: 'S3', name: 'Module2Stable' },
    module: { name: '商品属性' },
    target: { field_label: '商品属性' },
    last_action: { kind: 'module2_running', description: '等待商品属性提交稳定' },
    status: 'running',
  });

  assert.equal(payload.actionLabel, '等待商品属性提交稳定');
});

test('getHudVisualTone escalates from normal to warn to alert', () => {
  assert.equal(getHudVisualTone(1500, 3000, 8000), 'normal');
  assert.equal(getHudVisualTone(4500, 3000, 8000), 'warn');
  assert.equal(getHudVisualTone(9000, 3000, 8000), 'alert');
});

test('getHudEvaluateSource stays browser-safe and does not depend on tsx helpers', () => {
  const source = getHudEvaluateSource();
  assert.match(source, /__codex_runtime_hud__/);
  assert.doesNotMatch(source, /__name/);
  assert.match(source, /setInterval/);
});

test('recordRuntimeEvent marks long waits with warn and alert tones', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-observability-tone-'));
  const config = getRuntimeObservabilityConfig(tempRoot, { RECORD_BROWSER_VIDEO: '1' });

  recordRuntimeEvent(config, {
    ts: '2026-03-06T14:00:00.000Z',
    state: 'S2',
    module: '商品属性',
    field: '商品属性',
    action: 'module2_running',
    status: 'running',
    details: '等待商品属性提交稳定',
  });
  recordRuntimeEvent(config, {
    ts: '2026-03-06T14:00:04.000Z',
    state: 'S2',
    module: '商品属性',
    field: '商品属性',
    action: 'module2_running',
    status: 'running',
    details: '等待商品属性提交稳定',
  });
  recordRuntimeEvent(config, {
    ts: '2026-03-06T14:00:13.500Z',
    state: 'S3',
    module: '商品属性',
    field: '商品属性',
    action: 'fill_attributes',
    status: 'running',
    details: 'Module 2 attribute flow completed.',
  });

  const events = JSON.parse(fs.readFileSync(config.eventsPath, 'utf8'));
  assert.equal(events[0].duration_ms, 4000);
  assert.equal(events[0].tone, 'warn');
  assert.equal(events[1].duration_ms, 9500);
  assert.equal(events[1].tone, 'alert');
  assert.equal(events[2].tone, 'normal');
});
