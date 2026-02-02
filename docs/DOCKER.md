# Docker deploy (friend mode)

## Prereqs
- Docker Desktop (or Docker Engine + compose)

## Quickstart
1. Copy env:
   - `cp .env.example .env`
   - Fill:
     - `PB_SERVICE_EMAIL` / `PB_SERVICE_PASSWORD`
     - `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN`
     - `MC_ADMIN_USER` / `MC_ADMIN_PASSWORD`
2. Build + start:
   - `docker compose up -d --build`
3. Open:
   - UI: http://127.0.0.1:4010/tasks
   - PocketBase admin: http://127.0.0.1:8090/_/

## Notes
- Ports are bound to `127.0.0.1` by default (safe). If you want tailnet/LAN access, change the compose port bindings.
- The worker needs access to your OpenClaw Gateway `/tools/invoke`. If the Gateway is on a different machine, point `OPENCLAW_GATEWAY_URL` at it.
