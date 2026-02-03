# Mission Control (for OpenClaw)

Self-hosted “mission control” for OpenClaw: Kanban tasks, agents, documents, activity, and node ops — designed to be **tailnet/LAN-only** and **token-safe**.

## What You Get
- **Kanban tasks** (Inbox → Assigned → In Progress → Review → Done, plus Blocked)
- **Subtasks** with progress counters (`done/total`)
- **@mention autocomplete** in comments (notify-only)
- **Auto-done by default**: when a task hits `review`, it automatically becomes `done` unless `requiresReview=true`
- **Deterministic worker** (no LLM polling): only assignment + explicit `@mentions` can wake OpenClaw
- **PocketBase** realtime backend (single binary)
- **Web push notifications** (optional)
- **OpenClaw wiring**: worker delivers notifications via `/tools/invoke` (token-safe delivery rules + circuit breakers)

## Why “Review” Exists If Auto-Done Is Default
`review` is the “waiting for approval” stage. Mission Control supports **two policies per task**:
- `requiresReview=false` (default): `review` is treated like “finalization” and auto-advances to `done` for fast operational tasks (e.g. “send an email”, “restart service”).
- `requiresReview=true`: `review` is a true human gate (e.g. publish content, run a risky command, merge code).

This keeps everyday tasks moving while still allowing “human sign-off” tasks when you need it.

## Architecture (Token-Safe)
- **Web (Next.js)**: UI + deterministic APIs
- **PocketBase**: realtime database
- **Worker (Node TS)**: notifications, lease enforcement, standups, node snapshots — **no LLM**
- **OpenClaw**: only wakes when needed (assignment/mention/nudge/escalation). Everything else stays in the UI.

## Quickstart (Recommended: Same Host As OpenClaw)
This is the smoothest path because the UI can run `openclaw` CLI commands (status, node ops) and read the gateway config file.

### Prereqs
- Node.js 22+
- pnpm (via Corepack)
- Git
- OpenClaw installed and a gateway running (or set `OPENCLAW_GATEWAY_DISABLED=true` while you set up)
- PocketBase binary placed at `pb/pocketbase`

### Platform Notes
- **macOS/Linux**: supported out of the box (scripts are Bash).
- **Windows**:
  - Recommended: **WSL2** (Ubuntu) and run everything inside WSL, *or*
  - Use **Docker Desktop** (see Docker section below).
  - The `scripts/*.sh` helpers are not designed for PowerShell/CMD.

### 1) Install
```bash
git clone <your-private-repo-url>
cd mission-control
./scripts/install.sh
```

### 2) Configure `.env`
```bash
cp .env.example .env
```

Minimum required values:
- `MC_ADMIN_USER`, `MC_ADMIN_PASSWORD` (Basic Auth for the UI)
- `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`
- `PB_SERVICE_EMAIL`, `PB_SERVICE_PASSWORD`
- `OPENCLAW_GATEWAY_URL` (usually `http://127.0.0.1:18789`)
- `OPENCLAW_GATEWAY_TOKEN` (Tools Invoke token)

Optional quality-of-life:
- `MC_GATEWAY_HOST_HINT` (your tailnet IP/hostname; used only to prefill copyable node install commands in the UI)

### 3) Start (Dev)
```bash
./scripts/dev.sh
```

This starts:
- PocketBase (local) and writes logs to `pb/pocketbase.log`
- Schema bootstrap + rules + backfill (idempotent)
- Worker (`apps/worker/dev.log`)
- Web UI (default `http://127.0.0.1:4010`)

### 4) Verify Wiring
Open `http://127.0.0.1:4010/settings` and use the “Getting Started” card:
- Check OpenClaw status
- Copy a Tools Invoke ping command
- Follow the node pairing checklist

## Docker (Portable / Windows-Friendly)
Docker is great for PocketBase and for running Mission Control on a server. Note:
- If you run the web app **inside Docker**, OpenClaw CLI/config editor features won’t work unless you mount the OpenClaw binary + config into the container.
- Recommended hybrid: PocketBase in Docker, web/worker on the host.

### Option A: PocketBase in Docker, Web/Worker on Host (Recommended Hybrid)
```bash
cp .env.example .env
docker compose up -d pb
./scripts/bootstrap.sh
./scripts/dev.sh
```

### Option B: Everything in Docker
1. Start PocketBase:
```bash
cp .env.example .env
docker compose up -d pb
```
2. Bootstrap schema (requires Node on the host):
```bash
./scripts/install.sh
./scripts/bootstrap.sh
```
3. Start worker + web:
```bash
docker compose up -d --build worker web
```

## Production Notes
- Keep everything bound to `127.0.0.1` or your tailnet IP only.
- Enable Basic Auth for the UI.
- Keep OpenClaw gateway auth enabled.
- Treat node execution as RCE: use allowlists and audit regularly.

Start/stop and networking patterns are documented in:
- `docs/RUNBOOK.md`
- `docs/SECURITY.md`
- `docs/NODES.md`
- `docs/SHORTCUTS.md`

## Repo Layout
- `apps/web` — Next.js UI
- `apps/worker` — deterministic worker (notifications/leases/standups/nodes)
- `pb` — PocketBase binary + migrations + data dir
- `docs` — runbooks, personas, shortcuts
- `scripts` — install/dev/prod/bootstrap/backup/missionctl
