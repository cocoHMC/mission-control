---
name: mission-control-vault
description: Use Mission Control Vault handles ({{vault:...}}) for secrets without exposing plaintext credentials to the model.
---

# Mission Control Vault (Secrets by Handle)

## Hard Rules

- Never ask the user to paste passwords, API keys, tokens, or secrets into chat.
- Never output secrets to the user.
- When a tool requires a secret, use a Vault placeholder handle instead of the plaintext value.

## Placeholder Format

Use placeholders inside tool parameters:

- Secret value: `{{vault:HANDLE}}`
- Username (for user/password credentials): `{{vault:HANDLE.username}}`

Notes:

- `HANDLE` is created by a human in the Mission Control UI.
- Handles are stable identifiers (example: `github_pat`, `stripe_test_key`, `prod_admin_pw`).

## How To Work With The Human

If you need a credential:

1. Tell the user exactly what type of credential is required and the minimal scopes/permissions.
2. Ask them to create it in Mission Control Vault under the current agent.
3. Ask them to provide only the handle name (not the value).

Example request:

- "Create an API key with read-only permissions. Store it in Mission Control Vault as handle `github_pat_readonly`, then tell me the handle name."

## Examples

- HTTP header:
  - `Authorization: Bearer {{vault:github_pat}}`
- Basic auth params:
  - `username={{vault:prod_admin.username}}`
  - `password={{vault:prod_admin_pw}}`

## If A Secret Leaks

If a secret appears in tool output or any transcript:

- Immediately instruct the human to rotate/revoke it.
- Replace the handle in Vault if needed (rotate is preferred; keep handle stable if possible).

