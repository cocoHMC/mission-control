# Mission Control — Agent Operating Manual (short)

Rules:
1) **Never poll** Mission Control with LLM turns. Wait for dispatcher messages.
2) All task state changes must be recorded via Mission Control (UI or `missionctl`).
3) If blocked, mark **Blocked** with a concrete reason + next action.
4) Keep worklogs short: 3-6 bullets max per update.
5) Prefer deterministic automation (scripts/shortcuts) over LLM for repetitive operations.
