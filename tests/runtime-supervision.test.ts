import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createRunId,
  getRuntimePaths,
  normalizeSupervisorIntervention,
  readFreshIntervention,
  shouldPauseForSupervisor,
  upsertModuleOutcome,
  writeRuntimeState,
} from '../src/runtime-supervision';

test('createRunId returns a non-empty run id', () => {
  const runId = createRunId();
  assert.equal(typeof runId, 'string');
  assert.match(runId, /^run-/);
  assert.ok(runId.length > 8);
});

test('writeRuntimeState writes runtime/state.json', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-supervision-'));
  const paths = getRuntimePaths(tempRoot);

  writeRuntimeState({
    version: '1.0',
    run_id: 'run-test',
    updated_at: '2026-03-06T18:00:00+08:00',
    project_root: tempRoot,
    mode: 'smoke',
    status: 'running',
    state: { code: 'S0', name: 'Preflight', attempt: 1, retry_budget: 2 },
    module: { id: 'system', name: '系统', step: 'bootstrap', sequence_index: 0, sequence_total: 0 },
    target: { field_label: 'none', expected_value: 'none', control_type: 'system', selector_scope: 'global' },
    last_action: { kind: 'init', description: 'boot', started_at: '2026-03-06T18:00:00+08:00', ended_at: '2026-03-06T18:00:00+08:00', result: 'ok' },
    next_expected_action: { kind: 'navigate', field_label: 'publish', expected_value: 'open' },
    module_outcomes: [
      {
        id: '1a',
        name: '类目',
        status: 'auto_ok',
        evidence: ['recent_category_selected'],
      },
      {
        id: '6c',
        name: 'APP 描述',
        status: 'manual_gate',
        evidence: ['app_description_manual_gate'],
      },
    ],
    gates: [],
    anomalies: [],
    evidence: { log_path: '', screenshot_paths: [], dom_snapshot_path: null },
  }, paths);

  const raw = fs.readFileSync(paths.statePath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.run_id, 'run-test');
  assert.equal(parsed.state.code, 'S0');
  assert.deepEqual(parsed.module_outcomes, [
    {
      id: '1a',
      name: '类目',
      status: 'auto_ok',
      evidence: ['recent_category_selected'],
    },
    {
      id: '6c',
      name: 'APP 描述',
      status: 'manual_gate',
      evidence: ['app_description_manual_gate'],
    },
  ]);
});

test('readFreshIntervention ignores stale and mismatched interventions', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-supervision-'));
  const paths = getRuntimePaths(tempRoot);
  fs.mkdirSync(path.dirname(paths.interventionPath), { recursive: true });

  fs.writeFileSync(paths.interventionPath, JSON.stringify({
    version: '1.0',
    run_id: 'run-other',
    created_at: '2026-03-06T18:00:00+08:00',
    decision: 'intervene',
    priority: 'high',
    state: 'S2 CategoryLocked',
    problem_class: 'selector_miss',
    problem: 'x',
    root_cause: 'y',
    instruction_for_codex: 'z',
    fallback: 'f',
    stop_condition: 's',
    confidence: 0.9,
    evidence: { log_paths: [], screenshot_paths: [], state_snapshot: 'runtime/state.json' },
  }));
  assert.equal(readFreshIntervention('run-test', '2026-03-06T18:00:01+08:00', paths), null);

  fs.writeFileSync(paths.interventionPath, JSON.stringify({
    version: '1.0',
    run_id: 'run-test',
    created_at: '2026-03-06T18:00:00+08:00',
    decision: 'intervene',
    priority: 'high',
    state: 'S2 CategoryLocked',
    problem_class: 'selector_miss',
    problem: 'x',
    root_cause: 'y',
    instruction_for_codex: 'z',
    fallback: 'f',
    stop_condition: 's',
    confidence: 0.9,
    evidence: { log_paths: [], screenshot_paths: [], state_snapshot: 'runtime/state.json' },
  }));
  assert.equal(readFreshIntervention('run-test', '2026-03-06T18:00:01+08:00', paths), null);
});

test('readFreshIntervention accepts fresh matching intervention', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-supervision-'));
  const paths = getRuntimePaths(tempRoot);
  fs.mkdirSync(path.dirname(paths.interventionPath), { recursive: true });

  fs.writeFileSync(paths.interventionPath, JSON.stringify({
    version: '1.0',
    run_id: 'run-test',
    created_at: '2026-03-06T18:00:02+08:00',
    decision: 'advise',
    priority: 'normal',
    state: 'S3 Module2Stable',
    problem_class: 'focus_bounce',
    problem: 'x',
    root_cause: 'y',
    instruction_for_codex: 'z',
    fallback: 'f',
    stop_condition: 's',
    confidence: 0.75,
    evidence: { log_paths: [], screenshot_paths: [], state_snapshot: 'runtime/state.json' },
  }));

  const intervention = readFreshIntervention('run-test', '2026-03-06T18:00:01+08:00', paths);
  assert.equal(intervention?.decision, 'advise');
  assert.equal(intervention?.problem_class, 'focus_bounce');
});

test('normalizeSupervisorIntervention unwraps Gemini CLI response wrapper', () => {
  const normalized = normalizeSupervisorIntervention(
    {
      session_id: 'sess-1',
      response: `\`\`\`json
{
  "version": "1.0",
  "run_id": "run-test",
  "created_at": "2026-03-06T18:00:02+08:00",
  "decision": "observe",
  "priority": "low",
  "state": "S6 Done",
  "problem_class": "unknown",
  "problem": "ok",
  "root_cause": "n/a",
  "instruction_for_codex": "continue",
  "fallback": "n/a",
  "stop_condition": "n/a",
  "confidence": 1,
  "evidence": {
    "log_paths": [],
    "screenshot_paths": [],
    "state_snapshot": "runtime/state.json"
  }
}
\`\`\``,
    },
    {
      runId: 'run-test',
      fallbackState: 'S6 Done',
      stateSnapshotPath: 'runtime/state.json',
      nowIso: '2026-03-06T18:00:03+08:00',
    },
  );

  assert.equal(normalized?.version, '1.0');
  assert.equal(normalized?.run_id, 'run-test');
  assert.equal(normalized?.decision, 'observe');
});

test('normalizeSupervisorIntervention maps alternate supervisor schema to canonical format', () => {
  const normalized = normalizeSupervisorIntervention(
    {
      action: 'proceed',
      reason: 'Run completed successfully.',
      target_state: 'S6',
      confidence: 1,
      suggested_fix: null,
      requires_human: false,
    },
    {
      runId: 'run-test',
      fallbackState: 'S6 Done',
      stateSnapshotPath: 'runtime/state.json',
      nowIso: '2026-03-06T18:00:03+08:00',
    },
  );

  assert.equal(normalized?.version, '1.0');
  assert.equal(normalized?.run_id, 'run-test');
  assert.equal(normalized?.decision, 'observe');
  assert.equal(normalized?.problem_class, 'unknown');
  assert.equal(normalized?.problem, 'Run completed successfully.');
});

test('shouldPauseForSupervisor only pauses on escalate or manual_stop', () => {
  assert.equal(shouldPauseForSupervisor(null), false);
  assert.equal(shouldPauseForSupervisor({ decision: 'observe' } as never), false);
  assert.equal(shouldPauseForSupervisor({ decision: 'advise' } as never), false);
  assert.equal(shouldPauseForSupervisor({ decision: 'intervene' } as never), false);
  assert.equal(shouldPauseForSupervisor({ decision: 'escalate' } as never), true);
  assert.equal(shouldPauseForSupervisor({ decision: 'manual_stop' } as never), true);
});

test('upsertModuleOutcome replaces existing module outcome in place order', () => {
  const outcomes = [
    { id: '1a', name: '类目', status: 'pending', evidence: [] },
    { id: '6c', name: 'APP 描述', status: 'pending', evidence: [] },
  ] as const;

  const updated = upsertModuleOutcome([...outcomes], {
    id: '6c',
    name: 'APP 描述',
    status: 'manual_gate',
    evidence: ['app_description_manual_gate'],
  });

  assert.deepEqual(updated, [
    { id: '1a', name: '类目', status: 'pending', evidence: [] },
    { id: '6c', name: 'APP 描述', status: 'manual_gate', evidence: ['app_description_manual_gate'] },
  ]);
});
