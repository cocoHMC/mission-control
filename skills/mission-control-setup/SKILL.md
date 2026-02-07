---
name: mission-control-setup
description: "End-to-end onboarding for Mission Control + OpenClaw: install, first-run setup, Tailscale/Headscale tailnet access, node pairing, notifications (desktop + web push/PWA), and deterministic health checks/troubleshooting."
---

# Mission Control Setup

Use this skill when a user wants Mission Control "to just work" across devices:
- install Mission Control (desktop app, source, or Docker Compose)
- keep it private (loopback or tailnet-only)
- wire OpenClaw Tools Invoke (token-safe delivery)
- pair nodes (optional) with strict allowlists
- enable notifications (macOS desktop + web push/PWA on iPhone)
- verify end-to-end and fix common breakages

## Safety Rules (Do Not Skip)

- Default to **loopback-only** (`127.0.0.1`) and **tailnet access via `tailscale serve`**.
- Never enable public exposure (do not use `tailscale funnel`) unless the user explicitly requests it and understands the risk.
- Treat node execution as **remote code execution**. Before enabling node actions:
  - require the user to confirm they understand the risk
  - enforce strict allowlists
  - prefer tailnet ACLs
- Treat secrets as secrets:
  - don't paste tokens/passwords back into chat
  - don't write secrets into logs
  - store them in `.env` (Mission Control) or OpenClaw config only

## First Questions (Keep It Short)

Ask only what you need to choose the path:
1) Install method: **macOS desktop app**, **Docker Compose**, or **source (git + pnpm)**?
2) Remote access: **none**, **Tailscale hosted**, or **Headscale (self-host)**?
3) OpenClaw: already installed on the gateway host? (yes/no)
4) Devices to use: only this machine, or also **iPhone**, other Macs, Linux nodes?
5) Notifications desired: **macOS desktop**, **web push (PWA)**, or both?

## Workflow (Follow In Order)

1) Read: `references/concepts.md` (use the terms consistently: gateway/agent/node).
2) Install/run Mission Control: `references/mission-control.md`.
3) Tailnet access (optional but recommended): `references/tailnet.md`.
4) OpenClaw wiring (optional but recommended): `references/openclaw.md`.
5) Notifications: `references/notifications.md`.
6) Verification + fixes: `references/verification.md`.

If a step fails, do not guess. Use the verification checklist to isolate which layer is broken:
- Mission Control process
- PocketBase
- Tailscale/Headscale
- OpenClaw gateway
- OpenClaw node pairing / allowlists
- Notifications (desktop vs web push)
