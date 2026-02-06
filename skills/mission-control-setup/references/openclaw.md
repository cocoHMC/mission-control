# OpenClaw Wiring (Gateway, Token, Nodes)

## Goal

Connect Mission Control to your OpenClaw Gateway so Mission Control can deliver deterministic "Tools Invoke" notifications without polling.

## 1) Install + Configure OpenClaw

If OpenClaw is not installed, install it using OpenClaw's official docs, then run:
```bash
openclaw onboard
```

This sets up:
- OpenClaw config under `~/.openclaw/`
- your gateway settings
- your agent workspace

## 2) Start the Gateway

Run as a service (recommended):
```bash
openclaw gateway install
openclaw gateway start
openclaw gateway status
```

Or run in the foreground:
```bash
openclaw gateway run
```

## 3) Get the Tools Invoke Token (Do Not Paste It Into Chat)

Preferred: OpenClaw UI -> Overview -> copy:
- Gateway URL
- Tools Invoke token

CLI alternative (prints the token to your terminal):
```bash
openclaw config get gateway.auth.token
```

## 4) Connect Mission Control

In Mission Control:
- open `/setup` (first run) or Settings -> OpenClaw Integration
- paste the Gateway URL + Tools Invoke token
- click "Test connection"
- save

If Mission Control and OpenClaw Gateway are on the same machine, the URL is usually:
- `http://127.0.0.1:18789`

## 5) Pair Nodes (Optional)

Only do this after tailnet access is working.

On the node machine:
1) Join the tailnet (Tailscale or Headscale)
2) Install OpenClaw
3) Pair the node to the gateway host:
```bash
openclaw node install --host <gateway-tailnet-ip-or-dns> --port 18789 --display-name "<node-name>"
openclaw node restart
```

On the gateway host:
```bash
openclaw nodes pending
openclaw nodes approve <requestId>
openclaw nodes list
```

Lock down execution (do this immediately):
```bash
openclaw approvals allowlist add --node <id|name|ip> "/usr/bin/uname"
openclaw config set tools.exec.security allowlist
openclaw config set tools.exec.node "<node-id-or-name>"
```

## 6) If Node Actions Don't Work in Mission Control

Mission Control can run CLI helpers only when it runs on the same host as OpenClaw and the `openclaw` binary is on PATH.

Checklist:
- `openclaw --version` works in the same environment Mission Control is running
- OpenClaw gateway is running: `openclaw gateway status`
- allowlists are configured (see above)
