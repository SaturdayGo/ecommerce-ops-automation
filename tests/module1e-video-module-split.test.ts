import test from 'node:test';
import assert from 'node:assert/strict';

test('video module exposes the 1e public API', async () => {
  const videoModule = await import('../src/modules/video');

  assert.equal(typeof videoModule.resolveLocalVideoUploadSpec, 'function');
  assert.equal(typeof videoModule.resolveVideoSelectionSpec, 'function');
  assert.equal(typeof videoModule.bootstrapVideoCategoryFromRecent, 'function');
  assert.equal(typeof videoModule.fillVideo, 'function');
});
