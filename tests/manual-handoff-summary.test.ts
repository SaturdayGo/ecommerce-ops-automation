import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RuntimeStateSnapshot } from '../src/runtime-supervision';
import {
  buildManualHandoffSummary,
  clearLatestManualHandoff,
  renderManualHandoffMarkdown,
  syncLatestManualHandoff,
  writeManualHandoffArtifacts,
} from '../src/manual-handoff-summary';

function createSnapshot(projectRoot: string, outcomes: RuntimeStateSnapshot['module_outcomes']): RuntimeStateSnapshot {
  return {
    version: '1.0',
    run_id: 'run-test',
    updated_at: '2026-03-14T18:00:00+08:00',
    project_root: projectRoot,
    mode: 'modules-6c-8',
    status: 'waiting_human',
    state: { code: 'S5', name: 'Verify', attempt: 1, retry_budget: 2 },
    module: { id: 'verify', name: '人工检查', step: 'after_fill', sequence_index: 5, sequence_total: 6 },
    target: { field_label: '人工检查', expected_value: 'confirm', control_type: 'human_gate', selector_scope: 'global' },
    last_action: {
      kind: 'screenshot_after_fill',
      description: 'Automation completed and is waiting for human verification.',
      started_at: '2026-03-14T18:00:00+08:00',
      ended_at: '2026-03-14T18:00:00+08:00',
      result: 'ok',
    },
    next_expected_action: { kind: 'human_confirm', field_label: 'Enter', expected_value: 'continue' },
    module_outcomes: outcomes,
    gates: [],
    anomalies: [],
    evidence: {
      log_path: 'runlogs/example.log',
      screenshot_paths: [
        'screenshots/app_description_manual_gate_1.png',
        'screenshots/other_settings_manual_gate_1.png',
      ],
      dom_snapshot_path: null,
    },
  };
}

test('buildManualHandoffSummary returns summary for manual and detect-only outcomes', () => {
  const snapshot = createSnapshot('/tmp/ecommerce-ops', [
    { id: '6c', name: 'APP 描述', status: 'manual_gate', evidence: ['app_description_manual_gate'] },
    { id: '8', name: '其它设置', status: 'manual_gate', evidence: ['other_settings_manual_gate'] },
    { id: '3', name: '海关信息', status: 'detect_only', evidence: ['customs_manual_gate_or_default'] },
    { id: '5', name: 'SKU 与销售属性', status: 'auto_ok', evidence: ['sku_done'] },
  ]);

  const summary = buildManualHandoffSummary(snapshot);
  assert.ok(summary);
  assert.equal(summary?.status, 'needs_human_handoff');
  assert.equal(summary?.items.length, 3);
  assert.deepEqual(
    summary?.items.map((item) => [item.module_id, item.status]),
    [
      ['6c', 'manual_gate'],
      ['8', 'manual_gate'],
      ['3', 'detect_only'],
    ],
  );
  assert.equal(summary?.items[0]?.next_action, '在当前页面手动填写 APP 描述后继续检查');
  assert.deepEqual(summary?.items[0]?.evidence, ['screenshots/app_description_manual_gate_1.png']);
  assert.deepEqual(summary?.items[1]?.evidence, ['screenshots/other_settings_manual_gate_1.png']);
});

test('buildManualHandoffSummary returns null when no manual outcomes exist', () => {
  const snapshot = createSnapshot('/tmp/ecommerce-ops', [
    { id: '1a', name: '类目', status: 'auto_ok', evidence: ['category_locked'] },
    { id: '5', name: 'SKU 与销售属性', status: 'auto_ok', evidence: ['sku_done'] },
  ]);

  assert.equal(buildManualHandoffSummary(snapshot), null);
});

test('renderManualHandoffMarkdown includes human actions and evidence', () => {
  const snapshot = createSnapshot('/tmp/ecommerce-ops', [
    { id: '6c', name: 'APP 描述', status: 'manual_gate', evidence: ['screenshots/app_description_manual_gate_1.png'] },
  ]);

  const summary = buildManualHandoffSummary(snapshot);
  assert.ok(summary);

  const markdown = renderManualHandoffMarkdown(summary!);
  assert.match(markdown, /Manual Handoff Summary/);
  assert.match(markdown, /6c APP 描述/);
  assert.match(markdown, /在当前页面手动填写 APP 描述后继续检查/);
  assert.match(markdown, /screenshots\/app_description_manual_gate_1\.png/);
});

test('writeManualHandoffArtifacts writes history artifacts and latest pointer', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-handoff-'));
  const snapshot = createSnapshot(projectRoot, [
    { id: '6c', name: 'APP 描述', status: 'manual_gate', evidence: ['screenshots/app_description_manual_gate_1.png'] },
    { id: '8', name: '其它设置', status: 'manual_gate', evidence: ['screenshots/other_settings_manual_gate_1.png'] },
  ]);

  const summary = buildManualHandoffSummary(snapshot);
  assert.ok(summary);

  const artifacts = writeManualHandoffArtifacts(summary!, projectRoot);
  assert.equal(fs.existsSync(path.join(projectRoot, artifacts.json_path)), true);
  assert.equal(fs.existsSync(path.join(projectRoot, artifacts.markdown_path)), true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'runtime', 'latest-handoff.json')), true);

  const latest = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'runtime', 'latest-handoff.json'), 'utf8'),
  ) as { run_id: string; json_path: string; markdown_path: string };
  assert.equal(latest.run_id, 'run-test');
  assert.equal(latest.json_path, artifacts.json_path);
  assert.equal(latest.markdown_path, artifacts.markdown_path);
});

test('clearLatestManualHandoff removes stale latest pointer', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-handoff-'));
  const runtimeDir = path.join(projectRoot, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const latestPath = path.join(runtimeDir, 'latest-handoff.json');
  fs.writeFileSync(latestPath, '{"stale":true}\n', 'utf8');

  clearLatestManualHandoff(projectRoot);

  assert.equal(fs.existsSync(latestPath), false);
});

test('syncLatestManualHandoff clears stale latest pointer when run has not produced a handoff yet', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-handoff-'));
  const runtimeDir = path.join(projectRoot, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const latestPath = path.join(runtimeDir, 'latest-handoff.json');
  fs.writeFileSync(latestPath, '{"run_id":"run-stale"}\n', 'utf8');

  const artifacts = syncLatestManualHandoff(null, projectRoot);

  assert.equal(artifacts, null);
  assert.equal(fs.existsSync(latestPath), false);
});

test('syncLatestManualHandoff clears stale latest pointer when snapshot has no manual outcomes', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-handoff-'));
  const runtimeDir = path.join(projectRoot, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const latestPath = path.join(runtimeDir, 'latest-handoff.json');
  fs.writeFileSync(latestPath, '{"run_id":"run-stale"}\n', 'utf8');
  const snapshot = createSnapshot(projectRoot, [
    { id: '1a', name: '类目', status: 'auto_ok', evidence: ['category_locked'] },
    { id: '5', name: 'SKU 与销售属性', status: 'auto_ok', evidence: ['sku_done'] },
  ]);

  const artifacts = syncLatestManualHandoff(snapshot, projectRoot);

  assert.equal(artifacts, null);
  assert.equal(fs.existsSync(latestPath), false);
});

test('syncLatestManualHandoff writes fresh latest pointer when manual outcomes exist', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-handoff-'));
  const runtimeDir = path.join(projectRoot, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, 'latest-handoff.json'), '{"run_id":"run-stale"}\n', 'utf8');
  const snapshot = createSnapshot(projectRoot, [
    { id: '6c', name: 'APP 描述', status: 'manual_gate', evidence: ['screenshots/app_description_manual_gate_1.png'] },
  ]);

  const artifacts = syncLatestManualHandoff(snapshot, projectRoot);

  assert.ok(artifacts);
  assert.equal(fs.existsSync(path.join(projectRoot, artifacts!.json_path)), true);
  const latest = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'runtime', 'latest-handoff.json'), 'utf8'),
  ) as { run_id: string; json_path: string; markdown_path: string };
  assert.equal(latest.run_id, 'run-test');
  assert.equal(latest.json_path, artifacts!.json_path);
  assert.equal(latest.markdown_path, artifacts!.markdown_path);
});
