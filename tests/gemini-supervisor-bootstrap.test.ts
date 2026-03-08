import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/aiden/Documents/Antigravity/ecommerce-ops/automation';
const projectAgentsPath = path.join(projectRoot, 'AGENTS.md');
const geminiMdPath = path.join(projectRoot, '.gemini', 'GEMINI.md');
const settingsPath = path.join(projectRoot, '.gemini', 'settings.json');
const statePath = path.join(projectRoot, 'runtime', 'state.json');
const interventionPath = path.join(projectRoot, 'runtime', 'intervention.json');
const interventionRawPath = path.join(projectRoot, 'runtime', 'intervention.raw.json');

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('Gemini supervisor bootstrap files exist', () => {
  for (const filePath of [projectAgentsPath, geminiMdPath, settingsPath, statePath, interventionPath, interventionRawPath]) {
    assert.equal(fs.existsSync(filePath), true, `missing bootstrap file: ${filePath}`);
  }
});

test('Gemini settings load AGENTS.md and GEMINI.md context', () => {
  const settings = readJson(settingsPath);

  assert.deepEqual(settings.context?.fileName, ['AGENTS.md', 'GEMINI.md']);
  assert.equal(typeof settings.general?.defaultApprovalMode, 'string');
  assert.equal(settings.experimental?.plan, true);
});

test('runtime state template follows supervision contract', () => {
  const state = readJson(statePath);

  assert.equal(state.version, '1.0');
  assert.equal(typeof state.run_id, 'string');
  assert.equal(state.project_root, projectRoot);
  assert.equal(typeof state.state?.code, 'string');
  assert.equal(typeof state.state?.name, 'string');
  assert.equal(typeof state.module?.id, 'string');
  assert.equal(typeof state.target?.field_label, 'string');
  assert.equal(Array.isArray(state.gates), true);
  assert.equal(Array.isArray(state.anomalies), true);
  assert.equal(typeof state.evidence?.log_path, 'string');
});

test('runtime intervention template follows supervision contract', () => {
  const intervention = readJson(interventionPath);

  assert.equal(intervention.version, '1.0');
  assert.equal(typeof intervention.run_id, 'string');
  assert.ok(['observe', 'advise', 'intervene', 'escalate', 'manual_stop'].includes(intervention.decision));
  assert.ok(['low', 'normal', 'high', 'critical'].includes(intervention.priority));
  assert.ok(
    [
      'loading_shell',
      'selector_miss',
      'control_type_mismatch',
      'unstable_commit',
      'focus_bounce',
      'portal_drift',
      'recovery_policy_violation',
      'batch_policy_violation',
      'human_action_required',
      'unknown',
    ].includes(intervention.problem_class),
  );
  assert.equal(typeof intervention.instruction_for_codex, 'string');
  assert.equal(typeof intervention.fallback, 'string');
  assert.equal(typeof intervention.stop_condition, 'string');
  assert.equal(typeof intervention.confidence, 'number');
});
