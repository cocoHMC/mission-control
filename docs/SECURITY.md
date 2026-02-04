# Mission Control - Security

## Network Boundaries
- Bind services to loopback or tailnet IP only.
- No public exposure.
- Use headscale ACLs to limit device access.

## OpenClaw Gateway
- Enable gateway auth token or password.
- Use a dedicated token for Tools Invoke.
- Do not share agent workspaces across agents.
 - If you use the OpenClaw config editor, validate diffs before apply and restart the gateway manually.

## Audits
- `openclaw security audit`
- `openclaw security audit --deep`

## Node Execution
- Use allowlists for exec approvals.
- Treat node hosts as remote code execution surfaces.
- Keep a strict allowlist and review regularly.

## Secret Rotation
- Rotate gateway token, PB admin password, PB service password quarterly.
- Update `.env` on coco and restart services.

## Data Safety
- Back up `pb/pb_data` daily.
- Store backups outside the repo (or encrypt at rest).

## Vaultwarden (Optional)
- Use the Security page to generate the `ops/vaultwarden` stack (Caddy + Vaultwarden).
- Keep the Vaultwarden domain tailnet-only (no public A/AAAA records).
- Enable docker actions by setting `MC_SECURITY_ACTIONS_ENABLED=true`.
- Use one collection per node and prefer read-only collections for automation.
