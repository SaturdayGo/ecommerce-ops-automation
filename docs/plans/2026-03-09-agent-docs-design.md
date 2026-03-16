# Agent-Facing Documentation Design

**Goal:** Make the AliExpress automation repository easier for full-text LLM agents to identify, navigate, and operate without guessing.

**Approach:** Split human-facing overview from agent-facing retrieval. `README.md` becomes the front door. `docs/agent-index.md` becomes the canonical semantic index for project identity, read order, commands, evidence paths, and hard boundaries. `AGENTS.md` stays focused on runtime behavior and points back to the index.

## Problems To Fix

1. `README.md` contains useful detail but lacks explicit retrieval anchors.
2. The repo has no single file that answers "what is this project, what should I read first, and where is the evidence?"
3. Existing README content contains stale branch information.

## Target Outcomes

1. A first-pass agent can identify the project in under one minute.
2. A retrieval-style agent can answer:
   - What does this project automate?
   - What does it not automate?
   - Which files are source of truth?
   - How do I run smoke, full, login, and module-scoped flows?
   - Where do logs, screenshots, and runtime state live?
3. Runtime supervision rules remain in `AGENTS.md` instead of being duplicated everywhere.

## Planned Files

- Modify: `README.md`
- Modify: `AGENTS.md`
- Create: `docs/agent-index.md`

## Information Architecture

### `README.md`

Purpose:
- Human-readable overview
- Quick start
- Document map
- Stable terminology

Required sections:
- One-sentence identity
- Quick answers
- Read this first
- Module status
- Commands
- Evidence and runtime artifacts
- Source-of-truth docs

### `docs/agent-index.md`

Purpose:
- Retrieval-first semantic index for full-text LLM agents
- Explicit keywords and canonical terminology
- Read order and command discovery
- Hard boundaries and known limits

Required sections:
- Project identity
- Canonical terms
- Related search phrases
- What this project automates
- What this project does not automate
- Recommended read order
- Execution entry points
- Runtime evidence paths
- Source-of-truth files
- Known limits

### `AGENTS.md`

Purpose:
- Runtime guardrails
- Role split
- Live supervision boundaries

Required change:
- Point readers to `docs/agent-index.md` before supervisor-specific docs.

## Verification Questions

The revised docs should let an LLM answer these without scanning the whole repo:

1. Is this AliExpress listing automation or a generic browser bot?
2. Does it use YAML input?
3. Does it use Playwright against the real seller page?
4. Which modules are stable versus unfinished?
5. What command runs login only?
6. What command runs a smoke flow?
7. Where are logs and screenshots stored?
8. What is the runtime supervision contract?
9. Can Gemini co-control the browser?
10. Which file should be read first for an overview?
