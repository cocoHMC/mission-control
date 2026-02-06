# Mission Control Vault

Mission Control Vault is a credential store designed for autonomous OpenClaw agents.

Core design rule:

- **Humans store secrets. Agents use handles.**
- The OpenClaw model should only ever see strings like `{{vault:github_pat}}`, not the secret value.
- A trusted runtime layer (Mission Control + an OpenClaw plugin) resolves handles **right before tool execution** and redacts secrets from persisted tool output.

## What This Protects (And What It Doesn’t)

Protects against:

- Accidental plaintext storage in PocketBase
- Accidental exposure via Mission Control list endpoints (Vault items are returned without ciphertext blobs)
- Many routine transcript/log leaks (tool result redaction hook)
- Model context leakage (model sees placeholders, not secrets)

Does not protect against:

- A tool that prints/echoes secrets in a transformed way (redaction is best-effort string replacement)
- A fully compromised Mission Control host (master key lives on the host)
- Secrets you mark `revealable` and then reveal on screen

## Setup

### 1) Vault Master Key

Vault encryption requires `MC_VAULT_MASTER_KEY_B64`:

- **32 bytes**, base64 encoded
- Generate:

```bash
openssl rand -base64 32
```

New installs created via `/setup` will generate this automatically.

### 2) Add Credentials (Per Agent)

UI:

1. Go to `Agents` -> select an agent -> `Manage credentials`.
2. Create a credential with:
   - **Handle**: stable id (example `github_pat`)
   - **Type**: API key, user/pass, refresh token, or generic secret
   - **Exposure**:
     - `inject-only` (recommended)
     - `revealable` (dangerous, allows UI reveal)

### 3) Generate a Vault Access Token

In the same page (`Tokens` tab), generate a token.

- Tokens are shown once.
- Tokens are stored hashed in PocketBase.
- Tokens are used by the OpenClaw Vault plugin to call Mission Control resolve endpoints.

## OpenClaw Plugin

The repo ships a plugin at:

- `openclaw-plugins/mission-control-vault`

### Install (link for dev)

```bash
openclaw plugins install -l /Users/coco/mission-control/openclaw-plugins/mission-control-vault
```

### Enable + Configure

Enable:

```bash
openclaw plugins enable mission-control-vault
```

Configure plugin under `plugins.entries.mission-control-vault.config` (via OpenClaw config tooling or the Mission Control OpenClaw config editor).

Example (multi-agent gateway):

```json5
{
  "plugins": {
    "entries": {
      "mission-control-vault": {
        "enabled": true,
        "config": {
          "missionControlUrl": "http://127.0.0.1:4010",
          "agentTokens": {
            "main": "mcva_... (token from Mission Control)",
            "other-agent": "mcva_... (token from Mission Control)"
          }
        }
      }
    }
  }
}
```

Restart the OpenClaw gateway after config changes.

## How Agents Should Use Vault Handles

Use placeholders inside tool params:

- Secret value: `{{vault:HANDLE}}`
- Username (for user/pass items): `{{vault:HANDLE.username}}`

Examples:

- HTTP header:
  - `Authorization: Bearer {{vault:github_pat}}`
- CLI args:
  - `--password={{vault:prod_admin_pw}}`

## Operational Guidance

- Use least-privilege scopes and separate tokens per agent.
- Prefer `inject-only` credentials.
- Rotate secrets regularly (use the rotate action, don’t edit handles).
- Treat Vault access tokens like passwords; rotate if leaked.

