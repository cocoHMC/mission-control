# macOS Shortcuts Registry

Use Shortcuts to avoid LLM tokens for repetitive tasks.

## Rules
- If a Shortcut exists for a task, run it instead of reasoning through steps.
- Use `scripts/shortcuts.sh list` to see installed shortcuts.
- Use `scripts/shortcuts.sh run "Shortcut Name"` to run.

## Starter Shortcuts (create manually)
1) MissionControl: Open Dashboard
- Action: Open URL
- URL: http://127.0.0.1:4010

2) MissionControl: Capture Quick Note
- Actions: Ask for Input -> Append to File
- File: ~/mission-control/memory/quick-notes.md

3) MissionControl: Daily Folder Prep
- Actions: Get Current Date -> Format Date -> Create Folder
- Folder: ~/mission-control/memory/daily/YYYY-MM-DD

## Notes
- Shortcuts should be idempotent when possible.
- Keep names stable. Agents refer to these names verbatim.
