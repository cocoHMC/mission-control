# Mission Control — Security notes (v0)

## OpenClaw gateway
- Keep gateway bound to loopback or tailnet-only.
- Use gateway auth token/password; prefer a dedicated token for automation.

## Auditing
- Run: `openclaw security audit`
- Deep: `openclaw security audit --deep`

## Node execution
- Treat nodes as remote code execution surfaces.
- Use allowlists for `system.run`.
- Pairing must be deliberate.

## Secrets
- Do not commit `.env`.
- Prefer storing long-lived secrets in Keychain (macOS) and injecting via launchd.
