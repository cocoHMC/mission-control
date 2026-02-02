# Mission Control (OpenClaw)

Self-hosted, tailnet-only task + agent + node orchestration for OpenClaw. Built for push-based, token-efficient workflows.

## Highlights
- Kanban task board with lease enforcement
- Agent roster, activity feed, and documents
- Node inventory and onboarding checklist
- Optional node approvals + health checks (CLI gated)
- Deterministic worker (no LLM polling)
- PocketBase realtime backend

## What "Documents" Are
Documents are long-form artifacts (Markdown) tied to tasks—deliverables, research notes, protocols, or runbooks.
They keep outputs out of chat threads and make work auditable and shareable across agents.

## Repo Layout
- `apps/web` — Next.js UI (Tailwind + shadcn-style components)
- `apps/worker` — dispatcher/lease/standup worker
- `pb` — PocketBase binary + migrations
- `docs` — runbooks and ops docs
- `scripts` — install/dev/prod/backup/shortcuts

## Start
1) `scripts/install.sh`
2) Edit `.env`
3) `scripts/dev.sh`

See `docs/RUNBOOK.md` for production and headscale deployment details.
