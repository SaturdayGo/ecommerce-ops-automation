import test from 'node:test';
import assert from 'node:assert/strict';

import { appendProjectArtifactPath } from '../src/runtime-evidence';

test('appendProjectArtifactPath stores screenshot paths relative to project root', () => {
  const projectRoot = '/tmp/ecommerce-ops';
  const current = ['screenshots/before_fill_1.png'];

  const next = appendProjectArtifactPath(
    current,
    '/tmp/ecommerce-ops/screenshots/after_fill_2.png',
    projectRoot,
  );

  assert.deepEqual(next, [
    'screenshots/before_fill_1.png',
    'screenshots/after_fill_2.png',
  ]);
});

test('appendProjectArtifactPath ignores duplicates and empty paths', () => {
  const projectRoot = '/tmp/ecommerce-ops';
  const current = ['screenshots/before_fill_1.png'];

  assert.deepEqual(
    appendProjectArtifactPath(current, '/tmp/ecommerce-ops/screenshots/before_fill_1.png', projectRoot),
    current,
  );
  assert.deepEqual(appendProjectArtifactPath(current, '', projectRoot), current);
});
