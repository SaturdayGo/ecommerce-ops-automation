import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  extractVideoFrames,
  getBrowserVideoArtifactsConfig,
  persistRecordedVideo,
  writeBrowserVideoManifest,
} from '../src/browser-video';

test('getBrowserVideoArtifactsConfig is disabled by default', () => {
  const config = getBrowserVideoArtifactsConfig('/tmp/project', 'run-test', 'smoke', {});
  assert.equal(config.enabled, false);
  assert.equal(config.extractFrames, false);
});

test('getBrowserVideoArtifactsConfig builds deterministic artifact paths when enabled', () => {
  const config = getBrowserVideoArtifactsConfig('/tmp/project', 'run-test', 'smoke', {
    RECORD_BROWSER_VIDEO: '1',
    EXTRACT_VIDEO_FRAMES: '1',
    VIDEO_FRAME_FPS: '0.5',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.extractFrames, true);
  assert.match(config.videoPath, /artifacts\/browser-video\/run-test_smoke\/browser-run\.webm$/);
  assert.match(config.framesDir, /artifacts\/browser-video\/run-test_smoke\/frames$/);
  assert.equal(config.frameFps, '0.5');
});

test('extractVideoFrames uses provided ffmpeg executable and returns generated frame paths', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-video-'));
  const videoPath = path.join(tempRoot, 'browser-run.webm');
  const framesDir = path.join(tempRoot, 'frames');
  const ffmpegStub = path.join(tempRoot, 'ffmpeg-stub.js');

  fs.writeFileSync(videoPath, 'fake-video');
  fs.writeFileSync(
    ffmpegStub,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const outPattern = process.argv[process.argv.length - 1];
const outFile = outPattern.replace('%04d', '0001');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, 'frame');
`,
    'utf8',
  );
  fs.chmodSync(ffmpegStub, 0o755);

  const framePaths = extractVideoFrames(videoPath, framesDir, ffmpegStub, '1');

  assert.equal(framePaths.length, 1);
  assert.equal(fs.existsSync(framePaths[0]), true);
  assert.match(framePaths[0], /frame-0001\.jpg$/);
});

test('persistRecordedVideo saves Playwright video handle into deterministic path', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-video-persist-'));
  const targetPath = path.join(tempRoot, 'nested', 'browser-run.webm');
  let calledWith = '';

  const fakeVideo = {
    async saveAs(candidatePath: string) {
      calledWith = candidatePath;
      fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
      fs.writeFileSync(candidatePath, 'video-data');
    },
  };

  const savedPath = await persistRecordedVideo(fakeVideo, targetPath);

  assert.equal(savedPath, targetPath);
  assert.equal(calledWith, targetPath);
  assert.equal(fs.readFileSync(targetPath, 'utf8'), 'video-data');
});

test('canonicalizeRecordedVideo picks emitted webm and moves it to deterministic path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-video-canonicalize-'));
  const emittedDir = path.join(tempRoot, 'artifacts');
  const emittedPath = path.join(emittedDir, 'random-id.webm');
  const targetPath = path.join(emittedDir, 'browser-run.webm');

  fs.mkdirSync(emittedDir, { recursive: true });
  fs.writeFileSync(emittedPath, 'raw-video');

  const { canonicalizeRecordedVideo } = require('../src/browser-video');
  const savedPath = canonicalizeRecordedVideo(emittedDir, targetPath);

  assert.equal(savedPath, targetPath);
  assert.equal(fs.existsSync(targetPath), true);
  assert.equal(fs.readFileSync(targetPath, 'utf8'), 'raw-video');
  assert.equal(fs.existsSync(emittedPath), false);
});

test('writeBrowserVideoManifest writes video and frame evidence', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-video-manifest-'));
  const config = getBrowserVideoArtifactsConfig(tempRoot, 'run-test', 'smoke', {
    RECORD_BROWSER_VIDEO: '1',
  });

  writeBrowserVideoManifest(config, {
    runId: 'run-test',
    mode: 'smoke',
    videoPath: config.videoPath,
    eventsPath: path.join(config.artifactRoot, 'events.json'),
    framePaths: [path.join(config.framesDir, 'frame-0001.jpg')],
  });

  const manifest = JSON.parse(fs.readFileSync(config.manifestPath, 'utf8'));
  assert.equal(manifest.run_id, 'run-test');
  assert.equal(manifest.mode, 'smoke');
  assert.equal(manifest.video_path, config.videoPath);
  assert.equal(manifest.events_path, path.join(config.artifactRoot, 'events.json'));
  assert.equal(manifest.frame_paths.length, 1);
});
