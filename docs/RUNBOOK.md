# Mission Control - Runbook

## Services
- PocketBase: http://127.0.0.1:8090/_/
- Web UI: http://127.0.0.1:4010/
- Worker: `apps/worker` (no HTTP endpoint)

## Quick Start (Dev)
1) `scripts/install.sh`
2) Edit `.env`
3) `scripts/dev.sh`

## Environment Notes
- On this MacBook, OpenClaw is not installed. Set `OPENCLAW_GATEWAY_DISABLED=true`.
- On coco, set `OPENCLAW_GATEWAY_DISABLED=false` and provide the gateway token.
- Lead agent name/id are configured via `MC_LEAD_AGENT_ID` and `MC_LEAD_AGENT_NAME`.
- UI realtime uses PocketBase token from `/api/pb-token` (Basic Auth required).
- Node approvals/health require `MC_NODE_ACTIONS_ENABLED=true`.
- If OpenClaw CLI syntax differs, override with `MC_NODE_HEALTH_CMD_TEMPLATE` and `MC_NODE_APPROVE_CMD_TEMPLATE`.

## Production (Coco Mac mini)
1) Copy repo to coco
2) Update `.env` with real tokens
3) Run `scripts/install.sh`
4) Start services with launchd or a supervisor

Suggested services:
- PocketBase: `pb/pocketbase serve --dir pb/pb_data --migrationsDir pb/pb_migrations`
- Web: `pnpm -C apps/web start -p $MC_WEB_PORT`
- Worker: `pnpm -C apps/worker dev` or a compiled `start`

## Headscale Access
- Default: bind to loopback and access via tailnet on coco.
- Alternative: set `MC_BIND_HOST` to coco's tailnet IP and firewall to tailnet only.

## Data bootstrap
- `node scripts/pb_bootstrap.mjs`
- `node scripts/pb_set_rules.mjs`

## Healthchecks
- `scripts/healthcheck.sh`

## Backups
- `scripts/backup.sh`

## Common Issues
- If Next.js native deps fail: run `pnpm approve-builds`.
- If worker cannot deliver notifications: check `OPENCLAW_GATEWAY_URL` and token.
- If node list is empty: confirm node pairing on coco.
- If node actions fail: verify `OPENCLAW_CLI` is in PATH and allowlisted commands are set.
