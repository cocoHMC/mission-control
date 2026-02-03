# Docker deploy (friend mode)

## Prereqs
- Docker Desktop (or Docker Engine + compose)

## Quickstart
1. Copy env:
   - `cp .env.example .env`
   - Fill:
     - `PB_SERVICE_EMAIL` / `PB_SERVICE_PASSWORD`
     - `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` (needed for first-time bootstrap)
     - `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN`
     - `MC_ADMIN_USER` / `MC_ADMIN_PASSWORD`
2. Start PocketBase:
   - `docker compose up -d pb`
3. Bootstrap PocketBase schema (one-time, idempotent):
   - `./scripts/install.sh`
   - `./scripts/bootstrap.sh`
4. Start worker + web:
   - `docker compose up -d --build worker web`
5. Open:
   - UI: http://127.0.0.1:4010/tasks
   - PocketBase admin: http://127.0.0.1:8090/_/

## Notes
- Ports are bound to `127.0.0.1` by default (safe). If you want tailnet/LAN access, change the compose port bindings.
- The worker needs access to your OpenClaw Gateway `/tools/invoke`. If the Gateway is on a different machine, point `OPENCLAW_GATEWAY_URL` at it.
- If you run the **web app in Docker**, OpenClaw CLI/config editor features won’t work unless you mount the OpenClaw binary + config into the container. Recommended: run Mission Control on the same host as the OpenClaw gateway.
