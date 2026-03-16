import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

import { screenshot } from '../src/browser';

let browser: Browser;
let page: Page;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent('<main><h1>Screenshot Test</h1></main>');
});

test.afterEach(async () => {
  await page.close();
});

test.after(async () => {
  await browser.close();
});

test('screenshot returns the created image path', async () => {
  const filePath = await screenshot(page, 'unit_test_capture');

  assert.equal(typeof filePath, 'string');
  assert.ok(path.isAbsolute(filePath));
  assert.equal(path.extname(filePath), '.png');
  assert.match(path.basename(filePath), /^unit_test_capture_\d+\.png$/);
  assert.ok(fs.existsSync(filePath));

  fs.rmSync(filePath, { force: true });
});

test('screenshot falls back to CDP capture when Playwright screenshot times out', async () => {
  const originalScreenshot = page.screenshot.bind(page);
  (page as Page & { screenshot: typeof originalScreenshot }).screenshot = async () => {
    const error = new Error('page.screenshot: Timeout 30000ms exceeded.\nCall log:\n  - taking page screenshot\n  - waiting for fonts to load...');
    error.name = 'TimeoutError';
    throw error;
  };

  try {
    const filePath = await screenshot(page, 'unit_test_capture_timeout');
    assert.ok(fs.existsSync(filePath));
    fs.rmSync(filePath, { force: true });
  } finally {
    (page as Page & { screenshot: typeof originalScreenshot }).screenshot = originalScreenshot;
  }
});
