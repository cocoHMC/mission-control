# Mission Control — Runbook (v0)

## Services
- PocketBase (DB + realtime): `http://127.0.0.1:8090/_/`
- Web UI (Next.js): `http://127.0.0.1:4010/`
- Worker (dispatcher/enforcement): runs as a Node service

## Current OpenClaw gateway (discovered)
- Dashboard: http://127.0.0.1:18789/
- Bind: loopback
- Port: 18789
- Auth: token

## Dev setup
1. `cd ~/mission-control`
2. `cp .env.example .env` and fill values
3. Start PocketBase
4. Start worker
5. Start web

## Commands (WIP)
- Install deps: `pnpm install`
- Web dev: `pnpm -C apps/web dev --port 4010`
- Worker dev: `pnpm -C apps/worker dev`

## Troubleshooting
- If Next.js build fails due to native deps: run `pnpm approve-builds` at repo root.
