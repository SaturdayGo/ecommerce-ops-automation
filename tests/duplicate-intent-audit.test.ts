import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const SCRIPT_PATH = path.resolve('/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/scripts/duplicate-intent-audit.ts');

async function loadAuditModule() {
  return await import(SCRIPT_PATH);
}

test('extractFunctionCatalogFromSource collects function declarations and arrow functions', async () => {
  const audit = await loadAuditModule();

  const records = audit.extractFunctionCatalogFromSource(
    [
      'export async function findNearestFieldContainer(scope: string) {',
      '  return scope.trim();',
      '}',
      '',
      'const resolveClosestFieldShell = (scope: string) => {',
      '  return scope.toLowerCase();',
      '};',
    ].join('\n'),
    '/repo/src/example.ts',
  );

  assert.deepEqual(
    records.map((record: { name: string; line: number }) => ({ name: record.name, line: record.line })),
    [
      { name: 'findNearestFieldContainer', line: 1 },
      { name: 'resolveClosestFieldShell', line: 5 },
    ],
  );
});

test('findDuplicateIntentGroups clusters semantic candidates instead of only exact names', async () => {
  const audit = await loadAuditModule();

  const records = [
    {
      filePath: '/repo/src/a.ts',
      line: 1,
      name: 'findNearestFieldContainer',
      kind: 'function',
      source: 'function findNearestFieldContainer(labelNode) { return labelNode.closest("[data-field-container]"); }',
    },
    {
      filePath: '/repo/src/b.ts',
      line: 12,
      name: 'resolveClosestFieldShell',
      kind: 'function',
      source: 'function resolveClosestFieldShell(labelNode) { return labelNode.closest("[data-field-container]"); }',
    },
    {
      filePath: '/repo/src/c.ts',
      line: 20,
      name: 'openShippingTab',
      kind: 'function',
      source: 'function openShippingTab(page) { return page.getByText("包装与物流"); }',
    },
  ];

  const groups = audit.findDuplicateIntentGroups(records);

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].records.map((record: { name: string }) => record.name).sort(),
    ['findNearestFieldContainer', 'resolveClosestFieldShell'],
  );
  assert.ok(groups[0].sharedTokens.includes('field'));
  assert.ok(groups[0].sharedTokens.includes('container'));
});

test('renderDuplicateIntentReport includes candidate groups with file references', async () => {
  const audit = await loadAuditModule();

  const report = audit.renderDuplicateIntentReport({
    scannedRoot: '/repo/src',
    scannedFileCount: 3,
    recordCount: 3,
    groups: [
      {
        intentKey: 'container field label',
        sharedTokens: ['container', 'field', 'label'],
        records: [
          {
            filePath: '/repo/src/a.ts',
            line: 1,
            name: 'findNearestFieldContainer',
            kind: 'function',
            source: 'function findNearestFieldContainer() {}',
          },
          {
            filePath: '/repo/src/b.ts',
            line: 12,
            name: 'resolveClosestFieldShell',
            kind: 'function',
            source: 'function resolveClosestFieldShell() {}',
          },
        ],
      },
    ],
  });

  assert.match(report, /^# Duplicate-Intent Audit Report/m);
  assert.match(report, /Scanned root: `\/repo\/src`/);
  assert.match(report, /Candidate groups: `1`/);
  assert.match(report, /findNearestFieldContainer/);
  assert.match(report, /\/repo\/src\/b\.ts:12/);
});
