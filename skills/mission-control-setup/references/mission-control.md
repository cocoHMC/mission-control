# Install + Run Mission Control

Pick one install path and stick to it for first setup. After it works locally, add tailnet access, OpenClaw wiring, nodes, and notifications.

## Option A: macOS Desktop App (Easiest)

1) Download the latest `.dmg` from GitHub Releases.
2) Install the app.
3) Open Mission Control. It should open the Setup Wizard automatically.
4) In the Setup Wizard:
   - set the Mission Control login (Basic Auth)
   - optionally connect OpenClaw (gateway URL + Tools Invoke token)

If macOS blocks the app:
- System Settings -> Privacy & Security -> allow the app to run.

## Option B: Source (macOS/Linux/WSL)

Prereqs:
- Node.js 22+
- Git

Commands:
```bash
set -euo pipefail
git clone https://github.com/cocoHMC/mission-control.git
cd mission-control
corepack enable
corepack prepare pnpm@10.28.2 --activate
./scripts/install.sh
./scripts/run.sh
```

Then open:
- `http://127.0.0.1:4010/setup`

## Option C: Docker Compose (Portable)

If you want "no build" images:
```bash
git clone https://github.com/cocoHMC/mission-control.git
cd mission-control
cp .env.example .env
docker compose -f docker-compose.ghcr.yml up -d
```

Then open:
- `http://127.0.0.1:4010/setup`

Notes:
- OpenClaw CLI/config-editor features won't work inside Docker unless you mount the OpenClaw binary + config into the container.
- Recommended: run Mission Control on the same host as the OpenClaw gateway.
