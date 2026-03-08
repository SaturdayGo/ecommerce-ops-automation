# Project AGENTS

This workspace is an AliExpress listing automation project.

## Role Split

- Codex / Playwright = Executor
- Gemini CLI = Supervisor

Gemini CLI must remain read-only during runtime supervision.
It must not click, type, navigate, close the browser, or edit source code while supervising a live run.

## Primary Context

Read these files first:

- `.gemini/GEMINI.md`
- `docs/supervisor/gemini-supervisor-agent-template.md`
- `docs/supervisor/state-intervention-schema.md`
- `docs/automation/lessons.md`

## Runtime Contract

Runtime supervision uses:

- `runtime/state.json`
- `runtime/intervention.json`

## High-Value Supervision Targets

1. state progression
2. category lock
3. module 2 stable field commits
4. SKU image recovery policy
5. batch fill policy

## Hard Boundaries

- Do not introduce browser co-control.
- Do not escalate on cosmetic UI jitter.
- Only recommend stopping on logical risk, policy violation, repeated failure, or false success.
