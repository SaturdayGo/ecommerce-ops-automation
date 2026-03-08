import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExecutionPlan,
  parseRequestedModules,
  requiresVideoCategoryBootstrap,
  type ModuleId,
} from '../src/execution-plan';

test('parseRequestedModules supports --modules=1e,6b and preserves order', () => {
  const parsed = parseRequestedModules(['../products/test.yaml', '--modules=1e,6b']);
  assert.deepEqual(parsed, ['1e', '6b']);
});

test('parseRequestedModules supports split --module value and aliases', () => {
  const parsed = parseRequestedModules(['../products/test.yaml', '--module', 'video']);
  assert.deepEqual(parsed, ['1e']);
});

test('buildExecutionPlan uses smoke defaults when no explicit module selection exists', () => {
  const plan = buildExecutionPlan({ smoke: true, requestedModules: null });
  assert.deepEqual(plan.moduleIds, ['1b', '1a', '1c', '1d', '1e', '2', '5']);
  assert.equal(plan.modeLabel, 'smoke');
});

test('buildExecutionPlan lets explicit module selection override smoke defaults', () => {
  const requestedModules: ModuleId[] = ['1e'];
  const plan = buildExecutionPlan({ smoke: true, requestedModules });
  assert.deepEqual(plan.moduleIds, ['1e']);
  assert.equal(plan.modeLabel, 'modules-1e');
});

test('requiresVideoCategoryBootstrap is true for 1e-only plan', () => {
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['1e'] });
  assert.equal(requiresVideoCategoryBootstrap(plan), true);
});

test('requiresVideoCategoryBootstrap is false when 1a is explicitly included', () => {
  const plan = buildExecutionPlan({ smoke: false, requestedModules: ['1a', '1e'] });
  assert.equal(requiresVideoCategoryBootstrap(plan), false);
});
