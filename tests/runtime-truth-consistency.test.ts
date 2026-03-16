import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RuntimeStateSnapshot } from '../src/runtime-supervision';
import { syncLatestManualHandoff } from '../src/manual-handoff-summary';

function createSnapshot(
  projectRoot: string,
  outcomes: RuntimeStateSnapshot['module_outcomes'],
  screenshotPaths: string[] = [],
): RuntimeStateSnapshot {
  return {
    version: '1.0',
    run_id: 'run-truth',
    updated_at: '2026-03-15T18:00:00+08:00',
    project_root: projectRoot,
    mode: 'modules-3-6c-8',
    status: 'waiting_human',
    state: { code: 'S5', name: 'Verify', attempt: 1, retry_budget: 2 },
    module: { id: 'verify', name: '人工检查', step: 'after_fill', sequence_index: 5, sequence_total: 6 },
    target: { field_label: '人工检查', expected_value: 'confirm', control_type: 'human_gate', selector_scope: 'global' },
    last_action: {
      kind: 'screenshot_after_fill',
      description: 'Automation completed and is waiting for human verification.',
      started_at: '2026-03-15T18:00:00+08:00',
      ended_at: '2026-03-15T18:00:00+08:00',
      result: 'ok',
    },
    next_expected_action: { kind: 'human_confirm', field_label: 'Enter', expected_value: 'continue' },
    module_outcomes: outcomes,
    gates: [],
    anomalies: [],
    evidence: {
      log_path: 'runlogs/example.log',
      screenshot_paths: screenshotPaths,
      dom_snapshot_path: null,
    },
  };
}

test('truth layer keeps module_outcomes, handoff artifact, and latest pointer aligned', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-layer-'));
  const snapshot = createSnapshot(
    projectRoot,
    [
      { id: '3', name: '海关信息', status: 'detect_only', evidence: ['customs_manual_gate_or_default'] },
      { id: '6c', name: 'APP 描述', status: 'manual_gate', evidence: ['app_description_manual_gate'] },
      { id: '8', name: '其它设置', status: 'manual_gate', evidence: ['other_settings_manual_gate'] },
      { id: '5', name: 'SKU 与销售属性', status: 'auto_ok', evidence: ['sku_done'] },
    ],
    [
      'screenshots/app_description_manual_gate_1.png',
      'screenshots/other_settings_manual_gate_1.png',
      'screenshots/customs_manual_gate_or_default_1.png',
    ],
  );

  const artifacts = syncLatestManualHandoff(snapshot, projectRoot);
  assert.ok(artifacts);

  const latest = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'runtime', 'latest-handoff.json'), 'utf8'),
  ) as { run_id: string; json_path: string };
  const summary = JSON.parse(
    fs.readFileSync(path.join(projectRoot, latest.json_path), 'utf8'),
  ) as {
    run_id: string;
    items: Array<{ module_id: string; status: string; evidence: string[] }>;
  };

  assert.equal(summary.run_id, snapshot.run_id);
  assert.deepEqual(
    summary.items.map((item) => [item.module_id, item.status]),
    [
      ['3', 'detect_only'],
      ['6c', 'manual_gate'],
      ['8', 'manual_gate'],
    ],
  );
  assert.equal(summary.items.some((item) => item.module_id === '5'), false);
  assert.deepEqual(summary.items[1]?.evidence, ['screenshots/app_description_manual_gate_1.png']);
  assert.deepEqual(summary.items[2]?.evidence, ['screenshots/other_settings_manual_gate_1.png']);
});

test('truth layer removes latest pointer when no manual outcomes remain', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-layer-'));
  const runtimeDir = path.join(projectRoot, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, 'latest-handoff.json'), '{"run_id":"run-stale"}\n', 'utf8');

  const snapshot = createSnapshot(projectRoot, [
    { id: '1a', name: '类目', status: 'auto_ok', evidence: ['category_locked'] },
    { id: '5', name: 'SKU 与销售属性', status: 'auto_ok', evidence: ['sku_done'] },
  ]);

  const artifacts = syncLatestManualHandoff(snapshot, projectRoot);

  assert.equal(artifacts, null);
  assert.equal(fs.existsSync(path.join(runtimeDir, 'latest-handoff.json')), false);
});
