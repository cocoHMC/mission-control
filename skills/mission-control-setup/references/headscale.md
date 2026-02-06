# Headscale (Self-Hosted Tailscale Control Server)

Headscale is optional and more operational work than hosted Tailscale. If the user is not confident, recommend hosted Tailscale.

## Requirements (Collect Up Front)

- A server that is reachable by all devices that will join (VPS or always-on home server).
- A DNS name (recommended): `headscale.yourdomain.com`.
- HTTPS (Tailscale clients expect an `https://` login server).

## Minimal Deployment (Docker + Reverse Proxy for HTTPS)

Recommended shape:
- `headscale` container listens on an internal port (example: `8080`)
- a reverse proxy (example: Caddy) terminates TLS and forwards to headscale
- you keep headscale/admin UI off the public internet unless you know what you're doing

### Files (Templates)

`docker-compose.yml` (example):
```yaml
services:
  headscale:
    image: headscale/headscale:latest
    command: headscale serve
    volumes:
      - ./config:/etc/headscale
      - ./data:/var/lib/headscale
    restart: unless-stopped

  caddy:
    image: caddy:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

volumes:
  caddy_data: {}
  caddy_config: {}
```

`config/config.yaml` (minimum-ish example; adjust to your environment):
```yaml
server_url: "https://headscale.yourdomain.com"
listen_addr: "0.0.0.0:8080"
grpc_listen_addr: "0.0.0.0:50443"

noise:
  private_key_path: "/var/lib/headscale/noise_private.key"

database:
  type: sqlite
  sqlite:
    path: "/var/lib/headscale/db.sqlite"

log:
  level: info
```

`Caddyfile`:
```caddyfile
headscale.yourdomain.com {
  reverse_proxy headscale:8080
}
```

### Bring It Up

```bash
docker compose up -d
docker compose logs -f headscale
```

## Create a User + Join Key

Exact CLI verbs can vary by headscale version. Use `--help` if a command differs:
```bash
docker compose exec headscale headscale --help
docker compose exec headscale headscale users --help
docker compose exec headscale headscale preauthkeys --help
```

Typical flow:
```bash
docker compose exec headscale headscale users create <user>
docker compose exec headscale headscale preauthkeys create --user <user> --reusable --expiration 24h
```

## Join Each Machine (macOS/Linux/WSL)

```bash
tailscale up --login-server https://headscale.yourdomain.com --authkey <YOUR_AUTHKEY> --hostname <device-name>
```

Then expose Mission Control to tailnet only using:
```bash
tailscale serve --bg 4010
```

## Security Notes

- Use ACLs (headscale policy) to restrict which devices can reach the gateway host.
- Keep Mission Control bound to loopback and use `tailscale serve`.
- Keep OpenClaw Gateway auth enabled and rotate tokens periodically.
