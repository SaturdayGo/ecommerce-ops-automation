import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';

import { ensureAutomationPageVisible } from '../src/browser';

class FakePage {
  public bringToFrontCalls = 0;
  public focusCalls = 0;

  async bringToFront(): Promise<void> {
    this.bringToFrontCalls += 1;
  }

  async evaluate<T>(_fn: () => T): Promise<void> {
    this.focusCalls += 1;
  }
}

test('ensureAutomationPageVisible passes when front Chrome tab matches AliExpress publish page', async () => {
  const page = new FakePage() as unknown as Page;
  let activationCalls = 0;

  await ensureAutomationPageVisible(page, {
    attempts: 2,
    waitMs: 0,
    deps: {
      activateChrome: async () => {
        activationCalls += 1;
      },
      getFrontChromeWindow: async () => ({
        title: '商品发布',
        url: 'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639',
      }),
    },
  });

  assert.equal((page as unknown as FakePage).bringToFrontCalls >= 1, true);
  assert.equal((page as unknown as FakePage).focusCalls >= 1, true);
  assert.equal(activationCalls >= 1, true);
});

test('ensureAutomationPageVisible fails when front Chrome tab is unrelated', async () => {
  const page = new FakePage() as unknown as Page;

  await assert.rejects(
    ensureAutomationPageVisible(page, {
      attempts: 2,
      waitMs: 0,
      deps: {
        activateChrome: async () => {},
        getFrontChromeWindow: async () => ({
          title: 'Jazz At The Cove - YouTube',
          url: 'https://www.youtube.com/watch?v=demo',
        }),
      },
    }),
    /Automation page not visible in front Chrome window/,
  );
});
