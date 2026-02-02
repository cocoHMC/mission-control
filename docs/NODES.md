# Node Onboarding (Headscale + OpenClaw)

## Goal
Pair additional devices (Ubuntu CLI, Ubuntu desktop, Macs) to Coco's OpenClaw gateway via headscale.

## Step-by-step
1) Join headscale tailnet on the node.
2) Install OpenClaw on the node.
3) Start node host:
- `openclaw node install --host <gateway-tailnet-ip> --port 18789 --display-name "<node-name>"`
- `openclaw node restart`
4) On the gateway host:
- `openclaw nodes pending`
- `openclaw nodes approve <requestId>`
5) Lock execution policy:
- `openclaw approvals allowlist add --node <id|name|ip> "/usr/bin/uname"`
- `openclaw config set tools.exec.security allowlist`
- `openclaw config set tools.exec.node "<node-id-or-name>"`

## Notes
- Only pair nodes that are already on the tailnet.
- Keep allowlists strict and audited.
- Use the Mission Control UI Nodes page for the checklist.
- To approve nodes + run health checks from the UI, set `MC_NODE_ACTIONS_ENABLED=true`.
- Allowed health commands are controlled by `MC_NODE_HEALTH_CMDS`.
- If your OpenClaw CLI uses different flags, set `MC_NODE_HEALTH_CMD_TEMPLATE` or `MC_NODE_APPROVE_CMD_TEMPLATE`.
