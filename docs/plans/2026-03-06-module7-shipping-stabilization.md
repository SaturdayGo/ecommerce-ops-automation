# Module 7 Shipping Stabilization Plan

> Route: `using-superpowers -> writing-plans -> test-driven-development -> systematic-debugging -> verification-before-completion`

**Goal:** Make module 7 reliably fill the shipping section's total weight and total dimensions (`长/宽/高`) using the real packaging/logistics DOM, without touching unrelated module 5 table fields.

**Scope:**
- In scope:
  - `包装与物流` section anchor reset
  - total weight field in module 7
  - total dimensions fields in module 7
  - optional debug probe behind `DEBUG_SHIPPING=1`
- Out of scope:
  - `是否原箱`
  - `物流属性`
  - 运费模板 if empty in YAML

## Task 1: Capture real DOM evidence

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`

Add a shipping-only debug probe gated by `DEBUG_SHIPPING=1` that logs:
- visible placeholders containing `重量/长/宽/高`
- nearby section text markers around `包装与物流`
- counts of candidate inputs inside the nearest shipping section container

Run:
```bash
printf '\n' | DEBUG_SHIPPING=1 npm run full -- ../products/test-next-modules.yaml --auto-close
```

Expected:
- log exposes the real module 7 container
- weight and dimension candidates are distinguishable from module 5 table fields

## Task 2: Reproduce with a local fixture

**Files:**
- Create: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/tests/module7-shipping.test.ts`

Build a small static fixture where:
- a `包装与物流` heading anchors the section
- weight input and 3 dimension inputs are inside the same module 7 container
- unrelated module 5 fields also exist elsewhere on page

Assert:
- `fillShipping()` writes only the module 7 values
- module 5 placeholders remain untouched

## Task 3: Harden locators

**Files:**
- Modify: `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/src/modules.ts`

Implementation rules:
- find the nearest shipping section container first
- scope all module 7 selectors to that container
- prefer localized placeholders/text labels (`重量/长/宽/高`)
- if direct placeholders fail, use a row-level traversal from the nearest visible labels
- never scan globally once the section container is known

## Task 4: Verify and capture lesson

Run:
```bash
node --import tsx --test tests/module7-shipping.test.ts
npm test
npm run typecheck
printf '\n' | DEBUG_SHIPPING=1 npm run full -- ../products/test-next-modules.yaml --auto-close
```

Completion gate:
- module 7 logs actual `总重量` and `尺寸` fill success
- screenshot or log confirms module 7 fields changed
- module 5 values are not overwritten

After pass:
- append one lesson entry to `/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/docs/automation/lessons.md`
