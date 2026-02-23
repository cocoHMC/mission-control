# Mission Control (for OpenClaw)

Self-hosted “mission control” for OpenClaw: Kanban tasks, agents, documents, activity, and node ops — designed to be **tailnet/LAN-only** and **token-safe**.

This repo is meant to be “clone → run → open `/setup` → done”.

## Downloads
- **macOS Desktop App (.dmg):** download the latest release from GitHub Releases (`https://github.com/cocoHMC/mission-control/releases/latest`) and install:
  - Apple Silicon: `Mission-Control-<version>-arm64.dmg`
  - Intel: `Mission-Control-<version>-x64.dmg` (if published)
- **Linux Desktop App:** download the latest release from GitHub Releases and install:
  - AppImage: `Mission-Control-<version>-x64.AppImage`
  - Debian/Ubuntu: `Mission-Control-<version>-x64.deb`
- **Windows Desktop App:** download the latest release from GitHub Releases and install:
  - Installer: `Mission-Control-Setup-<version>-x64.exe`
- **Docker Compose (portable / Windows-friendly):** see the `Docker (Portable / Windows-Friendly)` section below.

Note: the desktop app is not notarized/signed by default. On macOS you may need to allow it in System Settings → Privacy & Security.

## What You Get
- **Task views**: Kanban + Calendar + Asana-style List (inline edits + saved views)
- **Projects** (multi-project grouping with per-project mode/status)
- **Automation safety by project mode** (`manual` blocks schedules/triggers, `paused/archived` blocks automation)
- **Project status updates** (manual check-ins + worker auto-generated daily rollups)
- **Inbox** (human notification queue with read/unread state)
- **Task dependencies** (`blocked-by` graph with start enforcement)
- **Subtasks** with progress counters (`done/total`)
- **Webhook intake** (`POST /api/intake/webhook` turns external events into tasks)
- **Usage command center** (events, top spenders, budgets, alerts)
- **Rules engine triggers** (status/create/due-soon events with conditions + actions)
- **Manual workflow control** (step trace + wait-for-approval + approve/reject/resume endpoints)
- **@mention autocomplete** in comments (notify-only)
- **Auto-done by default**: when a task hits `review`, it automatically becomes `done` unless `requiresReview=true`
- **Deterministic worker** (no LLM polling): only assignment + explicit `@mentions` can wake OpenClaw
- **PocketBase** realtime backend (single binary)
- **Web push notifications** (optional)
- **OpenClaw wiring**: worker delivers notifications via `/tools/invoke` (token-safe delivery rules + circuit breakers), with optional fallback command when `sessions_send` is gateway-blocked

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

## Vault (Credentials)
Mission Control includes a built-in Vault for agent credentials.

How it works (simple mental model):
- **Humans store secrets. Agents use handles.**
- You store a credential once (encrypted at rest).
- Agents and task templates use placeholders like `{{vault:github_pat}}` (a handle, not the secret).
- A trusted runtime layer (Mission Control + the OpenClaw Vault plugin) resolves handles **right before tool execution** and redacts secrets from tool output best-effort.

Risks you should understand:
- Tools ultimately receive the **real secret** after placeholder resolution. If a tool echoes/logs it, it can leak.
- If you mark a credential **revealable** and reveal it in the UI, it can leak via screen share/recording.
- If you lose `MC_VAULT_MASTER_KEY_B64`, you cannot decrypt existing Vault secrets (no recovery). Back it up securely.

More details: `docs/VAULT.md`.

## Quickstart (Recommended)
Run Mission Control on the **same machine as the OpenClaw Gateway**. It’s the smoothest path because Mission Control can:
- run `openclaw` CLI status checks
- open the OpenClaw config editor UI
- manage node pairing commands (copy/paste)

## Install From Scratch (New User Steps)
These are the “do this in order” steps if you’ve never run Mission Control before.

1. Install prerequisites:
   - Node.js 22+
   - Git
   - (Recommended) Tailscale + your Headscale server, if you want tailnet access
   - (Optional) OpenClaw if you want agent delivery/wiring
2. Clone + install:
   ```bash
   git clone https://github.com/cocoHMC/mission-control.git
   cd mission-control
   corepack enable
   corepack prepare pnpm@10.28.2 --activate
   ./scripts/install.sh
   ```
3. Start Mission Control:
   ```bash
   ./scripts/run.sh
   ```
4. Open the setup wizard:
   1. Go to `http://127.0.0.1:4010/setup`
   2. Set your Mission Control login (Basic Auth) and copy the password
   3. (Optional) OpenClaw: in OpenClaw UI “Overview”, copy the Gateway URL + Tools Invoke token, click **Test connection**, then **Save + Bootstrap**
5. After setup:
   - Mission Control will restart itself automatically (when started via `./scripts/run.sh`).
6. Use it:
   1. Open `http://127.0.0.1:4010/` and log in
   2. Create a task, add subtasks, assign to `main`

For tailnet access, `/setup` shows a **Tailscale status card** + the exact `tailscale serve --bg 4010` command and a copyable URL once Tailscale is running.

## One-Liner (For Codex / Terminal Agents)
If you’re using an AI coding agent that can run shell commands, paste this block as-is on macOS/Linux/WSL (it assumes Node.js 22+ and Git are already installed):

```bash
set -euo pipefail
git clone https://github.com/cocoHMC/mission-control.git
cd mission-control
corepack enable
corepack prepare pnpm@10.28.2 --activate
./scripts/install.sh
./scripts/run.sh
echo
echo "Open setup: http://127.0.0.1:4010/setup"
```

## AI Setup Skill (Codex / Claude Code)
If you want an AI agent to guide and verify the full setup (Mission Control + Tailscale/Headscale + OpenClaw wiring + nodes + notifications):
- Skill: `skills/mission-control-setup/SKILL.md`
- Install into Codex:
  - `./scripts/install_codex_skill.sh`

## macOS Desktop App (.dmg)
If you want Mission Control as a real macOS app (not just a browser tab), we ship an Electron desktop wrapper that:
- starts PocketBase + worker + web automatically
- opens `/setup` on first launch
- auto-restarts after setup
- includes an in-app update UI and a menu item (**Release-based**)

### Build The DMG (Apple Silicon)
```bash
pnpm -C apps/desktop dist:mac
```

Build output:
- `apps/desktop/dist/Mission-Control-<version>-arm64.dmg`

### Updates
The desktop app checks for updates via **GitHub Releases** (not raw `main` commits).
When you publish a new release, users will see an update available in the app menu and Settings → Desktop Updates.
If you keep a fork private, end-users may need a GitHub token to download release assets (Settings → Desktop Updates → “Private GitHub Updates”).

### Releasing Desktop Apps (CI)
Pushing to `main` triggers GitHub Actions to:
- create a new version tag `v<major>.<minor>.<patch>` (auto-increments patch), and
- build + upload desktop installers for macOS/Linux/Windows to the corresponding GitHub Release.

If you need to run it manually: push a `v*` tag (or dispatch `release-desktop.yml` against a `v*` tag ref).

### Prereqs
- Node.js 22+
- pnpm (via Corepack)
- Git
- OpenClaw installed + gateway running (optional; you can run Mission Control without OpenClaw and connect later)
- `curl` + `unzip` (for PocketBase auto-download on macOS/Linux)

### Platform Notes
- **macOS/Linux**: supported out of the box (scripts are Bash).
- **Windows**:
  - Recommended: **WSL2** (Ubuntu) and run everything inside WSL, *or*
  - Use **Docker Desktop** (see Docker section below).
  - The `scripts/*.sh` helpers are not designed for PowerShell/CMD.

### Installing Prereqs (Plain English)
- **Node.js**: install Node.js 22+ (includes `corepack`). If you don’t know what to pick, install the latest Node 22 “LTS” from Nodejs.org.
- **Git**: install Git so you can `git clone` this repo.
- **Tailscale** (recommended): install Tailscale and join your tailnet (or your Headscale server). Mission Control can stay loopback-only and still be reachable over tailnet via `tailscale serve`.
- **OpenClaw** (optional): install OpenClaw and run the gateway if you want Mission Control to wake your agent via Tools Invoke.

### 1) Clone
```bash
git clone https://github.com/cocoHMC/mission-control.git
cd mission-control
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

### 2) Install
```bash
./scripts/install.sh
```

### 3) Start Dev
```bash
./scripts/run.sh
```

Then open:
- `http://127.0.0.1:4010/setup`

The setup page will:
- set up Mission Control login (Basic Auth)
- bootstrap PocketBase schema and auth
- optionally connect OpenClaw (Tools Invoke delivery) and test the connection
- show Tailscale status + copyable Tailnet URLs (when Tailscale is running)

After applying setup, Mission Control restarts itself automatically (when started via `./scripts/run.sh`).

### Optional: CLI Setup (No Browser)
```bash
cd mission-control
node scripts/setup.mjs
```

Important: run it from the repo root (otherwise Node won’t find `scripts/setup.mjs`).

### Alternative: Manual `.env` Setup
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
- `MC_INTAKE_WEBHOOK_KEY` (enables secure webhook intake at `/api/intake/webhook`)
- `MC_USAGE_COLLECT_ENABLED`, `MC_USAGE_COLLECT_MINUTES` (capture usage snapshots into `usage_events`)
- `MC_USAGE_MODEL_PRICES_JSON` (JSON map for estimated USD/token pricing)
- `MC_PROJECT_BUDGET_CHECK_MINUTES`, `MC_PROJECT_BUDGET_ALERT_COOLDOWN_MS` (project budget alerts in Inbox)
- `MC_BUDGET_PAUSE_AUTOMATIONS` (auto-pause project workflow schedules at hard budget limit)

### Webhook Intake
Use this to turn external events (forms, alerts, CRM updates, ticketing webhooks) into inbox tasks.

Example:
```bash
curl -X POST "http://127.0.0.1:4010/api/intake/webhook" \
  -H "content-type: application/json" \
  -H "x-mc-intake-key: $MC_INTAKE_WEBHOOK_KEY" \
  -d '{
    "title": "Investigate production alert",
    "description": "CPU > 90% on api-2",
    "projectId": "PROJECT_ID",
    "priority": "p1",
    "labels": ["alert","ops"],
    "source": "pagerduty",
    "externalId": "incident-1234"
  }'
```

When you run `./scripts/dev.sh`, it starts:
- PocketBase (local) and writes logs to `pb/pocketbase.log`
- Schema bootstrap + rules + backfill (idempotent)
- Worker (logs are written under `apps/worker/` but are gitignored)
- Web UI (default `http://127.0.0.1:4010`)

#### Development Notes (Testing)
Local dev (hot reload):
```bash
cd mission-control
./scripts/install.sh   # first time only
./scripts/dev.sh
```

Then open:
- `http://127.0.0.1:<MC_WEB_PORT>/` (default: `4010`)
- If it says setup is required: `http://127.0.0.1:<MC_WEB_PORT>/setup`
- Calendar view: `http://127.0.0.1:<MC_WEB_PORT>/tasks?view=calendar`

Stop with `Ctrl+C`.

Notes:
- `./scripts/dev.sh` will reuse PocketBase if it is already running at `PB_URL`.
- If the web port is busy, override it: `MC_WEB_PORT=4010 ./scripts/dev.sh`
- Worker log: `apps/worker/dev.log`
- PocketBase log (when started by the script): `pb/pocketbase.log`
- If Next dev gets stuck with a lock file, stop it and remove the lock:
  - `lsof -iTCP:<MC_WEB_PORT> -sTCP:LISTEN` (find the process)
  - `kill <pid>`
  - `rm -f apps/web/.next-dev/dev/lock` (if it exists)

### 4) Verify Wiring
Open `http://127.0.0.1:4010/settings` and use the “Getting Started” card:
- Check OpenClaw status
- Copy a Tools Invoke ping command
- Follow the node pairing checklist
- Open `http://127.0.0.1:4010/openclaw/status` for Queue SLO telemetry (queue depth + pending notification backlog)
  - includes delivery DLQ counters (notifications dropped after max retries)

CLI checks:
- `MC_HEALTHCHECK_PING=true ./scripts/healthcheck.sh`
  - validates PocketBase + web health
  - runs a `sessions_send` ping via `/tools/invoke`
- `MC_HEALTHCHECK_PING=true MC_HEALTHCHECK_OPENCLAW_TEST=true ./scripts/healthcheck.sh`
  - includes `/api/openclaw/test` validation (requires Basic Auth env)
  - verifies token access + delivery permission probe (`sessions_send` dry-run)

## Docker (Portable / Windows-Friendly)
Docker is great for PocketBase and for running Mission Control on a server. Note:
- If you run the web app **inside Docker**, OpenClaw CLI/config editor features won’t work unless you mount the OpenClaw binary + config into the container.
- Recommended hybrid: PocketBase in Docker, web/worker on the host.

### Option 0: Pull Prebuilt Images (Fastest)
This is the “no build” path (good for servers and Windows with Docker Desktop).

```bash
cp .env.example .env
docker compose -f docker-compose.ghcr.yml up -d
```

Then open:
- `http://127.0.0.1:4010/setup`

Notes:
- The GHCR images are currently published for `linux/amd64` (x86_64). If you’re on `linux/arm64`, use Option B (build locally).

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
