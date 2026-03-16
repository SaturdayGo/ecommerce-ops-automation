# 2026-03-15 Preflight Hardening Design

## Goal

Add a module-aware preflight layer that blocks obviously invalid runs before launching the browser.

Scope is intentionally narrow:

1. Validate only the modules selected for the current run.
2. Validate only browser-external facts and minimal payload presence.
3. Do not duplicate DOM/runtime checks that already belong inside module implementations.

## Non-Goals

1. No business-quality validation.
2. No selector or page-shape inference.
3. No attempt to predict platform drift.

## Why

Current `S0 Preflight` only proves:

- YAML exists
- YAML parses
- schema shape is valid

It does **not** prove the selected run has enough data to be worth opening Chrome.

That wastes:

- browser time
- visible supervision time
- model context and tokens

## Rules

Preflight evaluates only the selected modules in the current execution plan.

### Hard Fail

Abort before browser launch when:

1. `1a` selected and `category` is empty
2. `1b` selected and `title` is empty
3. `1c` selected and `carousel` has no non-empty entries
4. `1d` selected and both `white_bg_image` and `marketing_image` are empty
5. `1e` selected and `video_file` is empty
6. `1e` selected with `video_selection_mode=local` and local file is missing
7. `5` selected and `skus` is empty
8. `6a` selected and `buyers_note_template` is empty
9. `6a` selected and `buyers_note_template` resolves to a missing local file
10. `6b` selected and `detail_images` has no non-empty entries
11. `4` selected and either `pricing_settings.min_unit` or `pricing_settings.sell_by` is empty
12. `7` selected and shipping total weight or any total dimension is non-positive

### Soft Warn Only

Warn but do not block when:

1. `1e` selected in `media_center` mode
2. `3` selected with empty `customs.hs_code`
3. `6c` selected with empty `app_description`
4. `8` selected with flags that imply manual handoff

These are real module-level outcomes, but not preflight blockers.

## Output Contract

Preflight returns:

- `ok: boolean`
- `errors: string[]`
- `warnings: string[]`
- `gates: Array<{ name, passed, evidence }>`

`errors.length > 0` means do not launch browser.

## Integration Point

Run after:

1. YAML load
2. execution plan resolution

Run before:

1. `launchBrowser()`
2. `S0 Preflight` checkpoint success emission

If preflight fails:

- write runtime state as `blocked`
- include failed gates
- exit with non-zero error

## Path Resolution Rules

Only these fields use local file resolution:

1. `buyers_note_template`
2. `video_file` when selection mode is `local`

Image-library fields such as:

- `carousel`
- `white_bg_image`
- `marketing_image`
- `detail_images`

remain semantic library identifiers and must **not** be checked as local filesystem paths.

## Testing Strategy

1. Unit tests for selected-module gating
2. Unit tests for local file existence checks
3. Main-flow integration test proving browser launch is skipped on preflight failure
