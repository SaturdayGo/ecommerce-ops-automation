# State And Intervention Schema

## Purpose

This document defines the file contract between the **Executor** and the **Supervisor**.

- Executor: Codex or Playwright flow that performs browser actions
- Supervisor: Gemini CLI running in read-only, evidence-driven mode

The contract is intentionally small.
It exists to make supervision deterministic and machine-readable.

## Design Rules

1. `state.json` is written by the Executor.
2. `intervention.json` is written by the Supervisor.
3. Both files are append-safe through rewrite semantics: write a complete new file each cycle.
4. No free-form prose outside the defined fields.
5. If confidence is low, the supervisor should prefer `observe` over speculative intervention.

## Directory Convention

```text
/Users/aiden/Documents/Antigravity/ecommerce-ops/automation/runtime/
  state.json
  intervention.json
```

## `state.json`

### Purpose

`state.json` captures the executor's current state, the exact business step, and the latest evidence pointers.

### Schema

```json
{
  "version": "1.0",
  "run_id": "string",
  "updated_at": "2026-03-06T14:30:00+08:00",
  "project_root": "/Users/aiden/Documents/Antigravity/ecommerce-ops/automation",
  "mode": "smoke",
  "status": "running",
  "state": {
    "code": "S3",
    "name": "Module2Stable",
    "attempt": 1,
    "retry_budget": 2
  },
  "module": {
    "id": "module2",
    "name": "商品属性",
    "step": "voltage",
    "sequence_index": 6,
    "sequence_total": 8
  },
  "target": {
    "field_label": "电压",
    "expected_value": "12伏(12 V)",
    "control_type": "dropdown",
    "selector_scope": "label-row-local"
  },
  "last_action": {
    "kind": "select_option",
    "description": "Clicked 电压 dropdown and selected 12伏(12 V)",
    "started_at": "2026-03-06T14:29:57+08:00",
    "ended_at": "2026-03-06T14:29:59+08:00",
    "result": "committed"
  },
  "next_expected_action": {
    "kind": "select_option",
    "field_label": "配件位置",
    "expected_value": "右+左(Right & left)"
  },
  "module_outcomes": [
    {
      "id": "1a",
      "name": "类目",
      "status": "auto_ok",
      "evidence": [
        "最近使用 -> 头灯总成"
      ]
    },
    {
      "id": "6c",
      "name": "APP 描述",
      "status": "manual_gate",
      "evidence": [
        "screenshots/app_description_manual_gate_1773114534035.png"
      ]
    }
  ],
  "gates": [
    {
      "name": "committed_value_present",
      "passed": true,
      "evidence": "input aria/text shows committed value"
    },
    {
      "name": "no_regression_within_1s",
      "passed": true,
      "evidence": "field value remained stable"
    }
  ],
  "anomalies": [
    {
      "code": "focus_bounce",
      "severity": "medium",
      "message": "Viewport jumped upward once after voltage commit.",
      "count": 1,
      "first_seen_at": "2026-03-06T14:29:59+08:00"
    }
  ],
  "evidence": {
    "log_path": "runlogs/20260306_module2_position_filled_smoke.log",
    "screenshot_paths": [
      "screenshots/debug_attributes_probe_1772786578185.png"
    ],
    "dom_snapshot_path": null
  }
}
```

### Field Semantics

| Field | Meaning |
|---|---|
| `version` | Contract version |
| `run_id` | Unique ID for one execution |
| `mode` | `smoke` or `full` |
| `status` | `running`, `blocked`, `waiting_human`, `completed`, `failed` |
| `state.code` | State machine code, e.g. `S3` |
| `module.id` | Stable module key |
| `module.step` | Fine-grained step inside the module |
| `target.field_label` | Current field or action target |
| `target.control_type` | `dropdown`, `autocomplete`, `modal`, `button`, `batch-panel`, etc. |
| `module_outcomes` | Per-module terminal truth for the current run: `auto_ok`, `manual_gate`, `detect_only`, `failed`, `skipped`, or `pending` |
| `gates` | Evidence-based pass/fail checkpoints |
| `anomalies` | Observed deviations that may or may not require intervention |
| `evidence` | Paths that Gemini CLI can inspect |

## `intervention.json`

### Purpose

`intervention.json` is the supervisor's output.
It tells the executor whether to keep going, change tactic, escalate, or stop.

### Schema

```json
{
  "version": "1.0",
  "run_id": "string",
  "created_at": "2026-03-06T14:30:02+08:00",
  "decision": "observe",
  "priority": "normal",
  "state": "S3 Module2Stable",
  "problem_class": "focus_bounce",
  "problem": "Voltage committed successfully, but the page bounced upward once before moving on.",
  "root_cause": "Minor viewport correction after dropdown commit; no committed-value regression detected.",
  "instruction_for_codex": "Do not intervene. Continue to 配件位置.",
  "fallback": "If the same bounce causes 2 consecutive misses on 配件位置, switch to nearest-field progression and retry once.",
  "stop_condition": "Stop only if 配件位置 fails twice or the voltage value disappears after commit.",
  "confidence": 0.77,
  "evidence": {
    "log_paths": [
      "runlogs/20260306_module2_position_filled_smoke.log"
    ],
    "screenshot_paths": [
      "screenshots/debug_attributes_probe_1772786578185.png"
    ],
    "state_snapshot": "runtime/state.json"
  }
}
```

### Allowed `decision` Values

| Decision | Meaning |
|---|---|
| `observe` | Accept current variance; no executor change |
| `advise` | Suggest a smaller tactical adjustment |
| `intervene` | Change the immediate execution tactic |
| `escalate` | Repeated failure; stop patching and change strategy |
| `manual_stop` | Unsafe or ambiguous; hand over to human |

### Allowed `priority` Values

| Priority | Meaning |
|---|---|
| `low` | Cosmetic or likely benign |
| `normal` | Needs attention soon |
| `high` | Must be handled before next critical step |
| `critical` | Immediate stop or manual handoff |

### Allowed `problem_class` Values

Use a closed set. Do not invent ad-hoc categories during runs.

```text
loading_shell
selector_miss
control_type_mismatch
unstable_commit
focus_bounce
portal_drift
recovery_policy_violation
batch_policy_violation
human_action_required
unknown
```

## Executor Consumption Rules

Codex should read `intervention.json` only at controlled checkpoints:

1. before entering a new state
2. after a failed attempt
3. after a claimed success on a critical field
4. after any modal interruption

Codex should ignore stale interventions where:

- `run_id` does not match current run
- `created_at` predates the latest `state.json`
- `decision` is `observe` and no new anomaly has occurred

## Supervisor Decision Matrix

| Observation | decision | rationale |
|---|---|---|
| One retry succeeded | `observe` | No need to create noise |
| Small scroll correction, state still valid | `observe` | Cosmetic only |
| Same field misses twice | `intervene` | Real drift emerged |
| Claimed hit loses value within 1 second | `intervene` | False success |
| Wrong control type detected | `intervene` | Logic bug, not selector drift |
| Entered batch fill then fell back to row fill | `escalate` | Policy violation |
| Ambiguous destructive path ahead | `manual_stop` | Human decision required |

## Example Pair: SKU Image Recovery

### `state.json`

```json
{
  "version": "1.0",
  "run_id": "run-20260306-002",
  "updated_at": "2026-03-06T15:02:11+08:00",
  "project_root": "/Users/aiden/Documents/Antigravity/ecommerce-ops/automation",
  "mode": "smoke",
  "status": "running",
  "state": {
    "code": "S4",
    "name": "SkuImagesDone",
    "attempt": 1,
    "retry_budget": 2
  },
  "module": {
    "id": "module5",
    "name": "销售属性与 SKU 图片",
    "step": "sku_image_upload",
    "sequence_index": 2,
    "sequence_total": 3
  },
  "target": {
    "field_label": "SKUb.jpg",
    "expected_value": "uploaded",
    "control_type": "modal",
    "selector_scope": "sku-row-local"
  },
  "last_action": {
    "kind": "modal_open",
    "description": "Opened media library for SKUb.jpg",
    "started_at": "2026-03-06T15:02:03+08:00",
    "ended_at": "2026-03-06T15:02:08+08:00",
    "result": "interrupted"
  },
  "next_expected_action": {
    "kind": "modal_reopen",
    "field_label": "SKUb.jpg",
    "expected_value": "retry_once"
  },
  "gates": [
    {
      "name": "recovery_policy_entered",
      "passed": true,
      "evidence": "executor marked modal interruption and retry path"
    }
  ],
  "anomalies": [
    {
      "code": "recovery_policy_violation",
      "severity": "medium",
      "message": "Initial modal was closed before upload completed.",
      "count": 1,
      "first_seen_at": "2026-03-06T15:02:08+08:00"
    }
  ],
  "evidence": {
    "log_path": "runlogs/20260306_sku2_modal_cancel_recovery_smoke.log",
    "screenshot_paths": [
      "screenshots/after_fill_1772782013653.png"
    ],
    "dom_snapshot_path": null
  }
}
```

### `intervention.json`

```json
{
  "version": "1.0",
  "run_id": "run-20260306-002",
  "created_at": "2026-03-06T15:02:12+08:00",
  "decision": "observe",
  "priority": "normal",
  "state": "S4 SkuImagesDone",
  "problem_class": "recovery_policy_violation",
  "problem": "SKU image modal was interrupted once.",
  "root_cause": "The interruption already entered the designated reopen-once recovery path.",
  "instruction_for_codex": "Do not stop the module. Allow the single reopen retry to finish.",
  "fallback": "If the retry also fails, continue remaining SKUs and mark this SKU for module-tail replay.",
  "stop_condition": "Only escalate if the same SKU blocks the workflow twice.",
  "confidence": 0.83,
  "evidence": {
    "log_paths": [
      "runlogs/20260306_sku2_modal_cancel_recovery_smoke.log"
    ],
    "screenshot_paths": [
      "screenshots/after_fill_1772782013653.png"
    ],
    "state_snapshot": "runtime/state.json"
  }
}
```

## Minimal Executor Pseudocode

```ts
writeState(state);
const intervention = readInterventionIfFresh();
if (intervention) {
  applyIntervention(intervention);
}
performNextStep();
writeState(nextState);
```

## Minimal Supervisor Pseudocode

```ts
const state = readState();
const evidence = loadEvidence(state);
const decision = classify(state, evidence);
writeIntervention(decision);
```

## Validation Rules

Reject the file if:

- `version` is missing
- `run_id` is missing
- `state.json` has no `state.code`
- `intervention.json` has no `decision`
- `confidence` is not within `0.0` to `1.0`
- `problem_class` is outside the allowed closed set

## Recommended First Integration

The first working version should be intentionally small:

1. Executor writes `runtime/state.json` at state boundaries
2. Supervisor reads `state.json` and latest log
3. Supervisor writes `runtime/intervention.json`
4. Executor checks intervention before the next critical action

Do not start with browser co-control.
Do not start with experimental Gemini subagents.
Do not start with autonomous code editing.
