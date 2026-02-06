# Verification + Troubleshooting Checklist

Run checks in this order. Stop when you find the failing layer.

## 1) Mission Control + PocketBase Running

From the Mission Control host:
```bash
curl -fsS http://127.0.0.1:4010/api/health >/dev/null && echo "web ok"
curl -fsS http://127.0.0.1:8090/api/health >/dev/null && echo "pb ok"
```

If you started via repo scripts:
```bash
./scripts/healthcheck.sh
```

## 2) Tailscale Status (If Using Tailnet)

```bash
tailscale status
tailscale serve status
```

If remote devices can't reach Mission Control:
- confirm you used `tailscale serve` (not raw LAN binding)
- confirm the remote device is connected to the same tailnet

## 3) OpenClaw Gateway Health (If Using OpenClaw)

```bash
openclaw gateway status
curl -fsS http://127.0.0.1:18789/api/health >/dev/null && echo "openclaw health ok"
```

Tools Invoke (requires token in Mission Control `.env`):
```bash
node scripts/openclaw_ping.mjs
```

## 4) Node Pairing (Optional)

On gateway host:
```bash
openclaw nodes list
openclaw nodes pending
```

If node actions fail:
- confirm the node is on the tailnet
- confirm allowlists are configured
- run `openclaw security audit --deep`

## 5) Notifications

Desktop notifications:
- Settings -> Notifications -> Enable -> send test

Web push:
- Settings -> Notifications -> Configure push keys (admin)
- restart Mission Control
- enable notifications on the device -> send test
