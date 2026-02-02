# Mission Control Agent Ops

Purpose: keep OpenClaw agents fast, deterministic, and cheap.

## Hard Rules
- Never poll Mission Control with the LLM. Wait for dispatch messages.
- Use `scripts/missionctl.mjs` for task updates, messages, docs, status changes.
- Prefer `scripts/shortcuts.sh` and macOS Shortcuts for repetitive or UI tasks.
- Keep memory files small. Long context goes in documents.
- If you need to remember something, write it to a file.

## Default Workspace Layout
- `memory/WORKING.md` current task state
- `memory/MEMORY.md` long-term facts and decisions
- `memory/YYYY-MM-DD.md` daily log

## When You Wake
- Read `memory/WORKING.md`
- Check Mission Control only if asked or dispatched
- Update task status and progress quickly

## Agent IDs
- lead (configured via `MC_LEAD_AGENT_ID`)
- dev
- ops
- writer
- qa

Use `agent:<id>:main` for session keys.

## Bootstrap
- Create a new agent workspace with `node scripts/agent_init.mjs --id <id> --name "<name>" --role "<role>"`.
- Or run `node scripts/missionctl.mjs agent seed --id <id> --name "<name>" --role "<role>"`.
