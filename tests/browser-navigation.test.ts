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
  private reloadUrl: string | null = null;

  constructor(
    private readonly routeMap: Record<string, string>,
    private readonly formReady: boolean,
    private readonly loginFormVisible: boolean = false,
  ) {}

  async goto(url: string): Promise<void> {
    this.gotoCalls.push(url);
    this.currentUrl = this.routeMap[url] ?? url;
    this.reloadUrl = this.routeMap['__reload__'] ?? null;
  }

  url(): string {
    return this.currentUrl;
  }

  locator(selector: string): FakeLocator {
    if (selector.includes('input[type="password"]')) {
      return new FakeLocator(this.loginFormVisible);
    }
    return new FakeLocator(this.formReady);
  }

  async evaluate<T>(_fn: () => T): Promise<boolean> {
    return this.formReady;
  }

  async waitForTimeout(): Promise<void> {}

  async reload(): Promise<void> {
    this.reloadCount += 1;
    if (this.reloadUrl) {
      this.currentUrl = this.reloadUrl;
    }
  }
}

async function withAcceleratedClock<T>(action: () => Promise<T>): Promise<T> {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => {
    now += 1000;
    return now;
  };
  try {
    return await action();
  } finally {
    Date.now = originalNow;
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

  const state = await withAcceleratedClock(() => navigateToPublishPage(page));

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

  const state = await withAcceleratedClock(() => navigateToPublishPage(page));

  assert.equal(state, 'publish');
  assert.deepEqual((page as unknown as FakePage).gotoCalls, [
    'https://csp.aliexpress.com/m_apps/product-publish-v2/pop',
  ]);
  assert.equal((page as unknown as FakePage).reloadCount, 0);
});

test('navigateToPublishPage returns login when fallback redirects to seller login page', async () => {
  const page = new FakePage(
    {
      'https://csp.aliexpress.com/m_apps/product-publish-v2/pop': 'https://csp.aliexpress.com/m_apps/product-publish-v2/pop?channelId=2202639',
      'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639': 'https://login.aliexpress.com/user/seller/login?bizSegment=CSP&_lang=zh_CN',
      '__reload__': 'https://login.aliexpress.com/user/seller/login?bizSegment=CSP&_lang=zh_CN',
    },
    false,
    true,
  ) as unknown as Page;

  const state = await withAcceleratedClock(() => navigateToPublishPage(page));

  assert.equal(state, 'login');
  assert.equal((page as unknown as FakePage).url(), 'https://login.aliexpress.com/user/seller/login?bizSegment=CSP&_lang=zh_CN');
});

test('navigateToPublishPage treats login host with csp return_url as login immediately', async () => {
  const page = new FakePage(
    {
      'https://csp.aliexpress.com/m_apps/product-publish-v2/pop': 'https://login.aliexpress.com/user/seller/login?bizSegment=CSP&return_url=https%3A%2F%2Fcsp.aliexpress.com%2Fm_apps%2Fproduct-publish-v2%2Fpop',
    },
    false,
    true,
  ) as unknown as Page;

  const state = await withAcceleratedClock(() => navigateToPublishPage(page));

  assert.equal(state, 'login');
  assert.deepEqual((page as unknown as FakePage).gotoCalls, [
    'https://csp.aliexpress.com/m_apps/product-publish-v2/pop',
  ]);
  assert.equal((page as unknown as FakePage).reloadCount, 0);
});

test('navigateToPublishPage does not treat unresolved csp shell as publish-ready', async () => {
  const page = new FakePage(
    {
      'https://csp.aliexpress.com/m_apps/product-publish-v2/pop': 'https://csp.aliexpress.com/m_apps/product-publish-v2/pop?channelId=2202639',
      'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639': 'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639',
      '__reload__': 'https://csp.aliexpress.com/ait/cn_pop/item_product/product_publish?channelId=2202639',
    },
    false,
    false,
  ) as unknown as Page;

  await assert.rejects(
    () => withAcceleratedClock(() => navigateToPublishPage(page)),
    /发布页未就绪|页面加载超时/,
  );
});
