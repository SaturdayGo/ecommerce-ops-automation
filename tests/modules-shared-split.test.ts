import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const MODULES_PATH = '/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts';

test('modules.ts imports shared helpers instead of redefining them locally', () => {
  const source = fs.readFileSync(MODULES_PATH, 'utf8');

  assert.match(source, /from '\.\/modules\/shared'/);

  const localDefinitions = [
    'function escapeRegex(',
    'function normalizeCategoryPath(',
    'function buildCategoryRecentPattern(',
    'function dedupeNonEmpty(',
    'async function waitForRecentButtonVisible(',
    'async function recentSelectCategoryPath(',
    'function getMainScrollContainer(',
    'type ScrollMainContentOptions = {',
    'async function scrollMainContent(',
    'async function pickNthVisible(',
    'async function safeClick(',
  ];

  for (const signature of localDefinitions) {
    assert.equal(
      source.includes(signature),
      false,
      `expected modules.ts to stop redefining shared helper: ${signature}`,
    );
  }
});
