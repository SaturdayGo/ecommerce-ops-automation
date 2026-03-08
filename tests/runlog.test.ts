import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createRunlogMirror } from '../src/runlog';

test('createRunlogMirror writes console output to a real log file', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runlog-mirror-'));
  const handle = createRunlogMirror(tempRoot, 'run-test', 'smoke');

  console.log('alpha %s', 'one');
  console.error('beta');

  await handle.close();

  const raw = fs.readFileSync(handle.absolutePath, 'utf8');
  assert.match(handle.relativePath, /^runlogs\/run-test_smoke\.log$/);
  assert.match(raw, /alpha one/);
  assert.match(raw, /beta/);
});
