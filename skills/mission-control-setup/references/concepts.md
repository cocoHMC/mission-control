# Concepts (Gateway vs Agents vs Nodes)

Use these definitions in user-facing explanations and in troubleshooting.

## Mission Control

Mission Control is the UI + backend for:
- tasks, docs, activity, and assignments
- deterministic notifications
- pairing/operating OpenClaw nodes (optional)

Mission Control is not the model and does not "run an LLM loop". It only wakes OpenClaw when needed (assignment/mention/nudge/escalation).

## OpenClaw Gateway

The Gateway is the local service that:
- receives Tools Invoke calls (`/tools/invoke`)
- routes messages to agent sessions
- controls channels/devices (depending on your OpenClaw setup)
- brokers node execution (if enabled)

Think: "control plane endpoint on your machine".

## OpenClaw Agents

Agents are the named worker identities (example: `main`, `dev`, `ops`) that:
- receive messages via the Gateway
- use tools deterministically (exec, filesystem, etc.)
- keep their own workspace/memory

Mission Control assigns tasks to agents; OpenClaw delivers those assignments/messages.

## OpenClaw Nodes

Nodes are additional machines paired to your Gateway (example: a Linux server, a Mac mini, a desktop PC).

Nodes are useful when:
- you want to run commands on another machine without SSH juggling
- you want a dedicated machine for workloads (build box, GPU box, home server)

Nodes are dangerous if misconfigured because "run command on node" is effectively RCE. Always:
- pair nodes only over tailnet/LAN you trust
- keep allowlists strict
- audit regularly
