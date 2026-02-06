# Tailnet Access (Tailscale / Headscale)

Goal: reach Mission Control from other devices (iPhone, laptop) without exposing it to the public internet.

## Recommended Pattern (Private by Default)

1) Keep Mission Control bound to loopback:
- `http://127.0.0.1:4010`

2) Use Tailscale Serve to expose it to tailnet only:
```bash
tailscale serve --bg 4010
tailscale serve status
```

3) Open from another tailnet device:
- `https://<your-device>.ts.net` (MagicDNS), or
- `http://<tailnet-ip>:4010` (advanced)

Do not use `tailscale funnel` unless you explicitly want public exposure.

## Hosted Tailscale (Most Users)

1) Install Tailscale on each device.
2) Sign in.
3) Ensure the CLI shows "Running":
```bash
tailscale status
```

## Headscale (Self-Hosted Coordination Server)

Headscale is advanced. If the user is not confident, recommend hosted Tailscale.

If the user explicitly wants Headscale, collect:
- headscale URL (must be HTTPS)
- how they'll run it (VPS, home server, Docker)
- whether they want ACLs

Then read: `references/headscale.md`.

Each node then joins headscale with:
```bash
tailscale up --login-server https://YOUR_HEADSCALE_URL --authkey YOUR_AUTHKEY --hostname <device-name>
```

Then use the recommended `tailscale serve` pattern to expose Mission Control.

## iPhone Access (Tailnet)

1) Install Tailscale on iPhone and sign in (or join headscale).
2) Confirm iPhone is connected to the tailnet.
3) Open the Mission Control tailnet URL in Safari.
