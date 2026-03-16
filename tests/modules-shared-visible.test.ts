import test from 'node:test';
import assert from 'node:assert/strict';

import { pickNthVisible } from '../src/modules/shared';

type FakeItem = {
  id: string;
  isVisible: () => Promise<boolean>;
};

type FakeLocator = {
  count: () => Promise<number>;
  nth: (index: number) => FakeItem;
  evaluateAll?: (fn: unknown, visibleIndex: number) => Promise<number | null>;
};

test('pickNthVisible uses a single DOM pass to resolve the nth visible match when available', async () => {
  let evaluateAllCalls = 0;
  let isVisibleCalls = 0;

  const items: FakeItem[] = [
    { id: 'hidden-0', isVisible: async () => { isVisibleCalls++; return false; } },
    { id: 'visible-1', isVisible: async () => { isVisibleCalls++; return true; } },
    { id: 'hidden-2', isVisible: async () => { isVisibleCalls++; return false; } },
    { id: 'visible-3', isVisible: async () => { isVisibleCalls++; return true; } },
  ];

  const locator: FakeLocator = {
    count: async () => items.length,
    nth: (index: number) => items[index],
    evaluateAll: async (_fn, visibleIndex: number) => {
      evaluateAllCalls++;
      const visibleIndexes = [1, 3];
      return visibleIndexes[visibleIndex] ?? null;
    },
  };

  const result = await pickNthVisible(locator as never, 1);

  assert.equal(result, items[3]);
  assert.equal(evaluateAllCalls, 1);
  assert.equal(isVisibleCalls, 0);
});

test('pickNthVisible falls back to per-item visibility checks when DOM pass is unavailable', async () => {
  const seen: string[] = [];

  const items: FakeItem[] = [
    { id: 'hidden-0', isVisible: async () => { seen.push('hidden-0'); return false; } },
    { id: 'visible-1', isVisible: async () => { seen.push('visible-1'); return true; } },
    { id: 'visible-2', isVisible: async () => { seen.push('visible-2'); return true; } },
  ];

  const locator: FakeLocator = {
    count: async () => items.length,
    nth: (index: number) => items[index],
    evaluateAll: async () => {
      throw new Error('DOM pass unavailable');
    },
  };

  const result = await pickNthVisible(locator as never, 1);

  assert.equal(result, items[2]);
  assert.deepEqual(seen, ['hidden-0', 'visible-1', 'visible-2']);
});
