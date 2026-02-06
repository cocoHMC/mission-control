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
- Treat `MC_VAULT_MASTER_KEY_B64` as a root secret. Back it up securely; if you lose it, Vault credentials cannot be decrypted.
- Update `.env` on coco and restart services.

## Data Safety
- Back up `pb/pb_data` daily.
- Store backups outside the repo (or encrypt at rest).
