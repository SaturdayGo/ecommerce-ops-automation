# Gemini Supervisor Pipeline

This directory contains the necessary context for Gemini CLI to act as a read-only Supervisor for the AliExpress Automation project.

## Files

1. **`gemini-supervisor-agent-template.md`**: The strict persona and system prompt defining how Gemini CLI should behave (as a referee, not an executor).
2. **`state-intervention-schema.md`**: The JSON schemas for the communication channel between Codex (Executor) and Gemini CLI (Supervisor).
3. **`gemini_supervisor.sh`**: A script to perform a single manual evaluation. It reads `../../runtime/state.json`, queries Gemini CLI in headless mode, and outputs to `../../runtime/intervention.json`.

## How It Works

1. Codex runs Playwright. At critical junctions (or upon failures), it writes a snapshot of its state to `runtime/state.json`.
2. A watchdog script (`../../supervisor_watchdog.sh`) detects the update.
3. The watchdog sends the state and the Supervisor Prompt to Gemini CLI in Headless Mode.
4. Gemini CLI parses the evidence and outputs structured instructions to `runtime/intervention.json`.
5. Codex reads `intervention.json` before continuing its execution.

This strict physical separation ensures that two AI agents do not fight for control over the same browser session.