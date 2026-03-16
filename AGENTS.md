# Project AGENTS

This workspace is an AliExpress listing automation project.

## Role Split

- Codex / Playwright = Executor
- Gemini CLI = Supervisor

Gemini CLI must remain read-only during runtime supervision.
It must not click, type, navigate, close the browser, or edit source code while supervising a live run.

## Primary Context

Read these files first:

- `docs/agent-index.md`
- `.gemini/GEMINI.md`
- `docs/supervisor/gemini-supervisor-agent-template.md`
- `docs/supervisor/state-intervention-schema.md`
- `docs/automation/lessons.md`

## Canonical Global Context

If the task asks for cross-tool global context, use only these canonical files:

- `/Users/aiden/.codex/AGENTS.md`
- `/Users/aiden/Documents/Antigravity/soul.md`
- `/Users/aiden/Documents/Antigravity/memory.md`
- `/Users/aiden/Documents/Antigravity/reference.md`

Do not fall back to deprecated paths under `/Users/aiden/Documents/Codex` or `/Users/aiden/Downloads`.
Do not silently switch to shadow copies under `/Users/aiden/.claude/` unless the user explicitly asks for them.

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
