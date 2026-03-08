import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';

import { navigateToPublishPage } from '../src/browser';

class FakeLocator {
  constructor(private readonly visible: boolean) {}
  first(): FakeLocator { return this; }
  async isVisible(): Promise<boolean> { return this.visible; }
}

class FakePage {
  public currentUrl = '';
  public readonly gotoCalls: string[] = [];
  public reloadCount = 0;

  constructor(
    private readonly routeMap: Record<string, string>,
    private readonly formReady: boolean,
  ) {}

  async goto(url: string): Promise<void> {
    this.gotoCalls.push(url);
    this.currentUrl = this.routeMap[url] ?? url;
  }

  url(): string {
    return this.currentUrl;
  }

  locator(_selector: string): FakeLocator {
    return new FakeLocator(this.formReady);
  }

  async evaluate<T>(_fn: () => T): Promise<boolean> {
    return this.formReady;
  }

  async waitForTimeout(): Promise<void> {}

  async reload(): Promise<void> {
    this.reloadCount += 1;
  }
}

test('navigateToPublishPage falls back to legacy publish page when m_apps shell is ready', async () => {
  const page = new FakePage(
    {
      'https://csp.aliexpress.com/m_apps/product-publish-v2/pop': 'https://csp.aliexpress.com/m_apps/product-publish-v2/pop?channelId=2202639',
      'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639': 'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639',
    },
    true,
  ) as unknown as Page;

  const state = await navigateToPublishPage(page);

  assert.equal(state, 'publish');
  assert.deepEqual((page as unknown as FakePage).gotoCalls, [
    'https://csp.aliexpress.com/m_apps/product-publish-v2/pop',
    'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639',
  ]);
  assert.equal((page as unknown as FakePage).url(), 'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639');
});

test('navigateToPublishPage stays on legacy publish page when already redirected there', async () => {
  const page = new FakePage(
    {
      'https://csp.aliexpress.com/m_apps/product-publish-v2/pop': 'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639',
    },
    true,
  ) as unknown as Page;

  const state = await navigateToPublishPage(page);

  assert.equal(state, 'publish');
  assert.deepEqual((page as unknown as FakePage).gotoCalls, [
    'https://csp.aliexpress.com/m_apps/product-publish-v2/pop',
  ]);
  assert.equal((page as unknown as FakePage).reloadCount, 0);
});
