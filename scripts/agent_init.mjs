#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const id = arg('--id');
const name = arg('--name');
const role = arg('--role') || 'Agent';
const workspaceArg = arg('--workspace') || arg('--dir');

if (!id || !name) {
  console.error('Usage: agent_init.mjs --id <id> --name <name> [--role <role>] [--workspace <dir>]');
  process.exit(1);
}

const dataRoot = process.env.MC_DATA_DIR ? path.resolve(process.env.MC_DATA_DIR) : process.cwd();
const templateRoot = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : process.cwd();

const agentDir = (() => {
  if (!workspaceArg) return path.join(dataRoot, 'agents', id);
  const p = workspaceArg.trim();
  if (!p) return path.join(dataRoot, 'agents', id);
  return path.isAbsolute(p) ? p : path.resolve(dataRoot, p);
})();

const memoryDir = path.join(agentDir, 'memory');

if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true });

const soul = `# SOUL — ${name}

**Role:** ${role}

## Personality
Focused specialist. Communicate in short, actionable updates.

## Focus
- Execute assigned tasks
- Keep Mission Control updated
- Escalate blockers quickly
`;

const defaultAgentsManual = `# Mission Control — Agent Operating Manual (short)

Rules:
1) **Never poll** Mission Control with LLM turns. Wait for dispatcher messages.
2) All task state changes must be recorded via Mission Control (UI or \`missionctl\`).
3) If blocked, mark **Blocked** with a concrete reason + next action.
4) Keep worklogs short: 3-6 bullets max per update.
5) Prefer deterministic automation (scripts/shortcuts) over LLM for repetitive operations.
`;

function maybeCopyAgentsManual() {
  const outPath = path.join(agentDir, 'AGENTS.md');
  if (existsSync(outPath)) return;
  try {
    const templatePath = path.join(templateRoot, 'agents', 'AGENTS.md');
    const raw = readFileSync(templatePath, 'utf8');
    writeFileSync(outPath, raw, 'utf8');
    return;
  } catch {
    // ignore
  }
  writeFileSync(outPath, defaultAgentsManual, 'utf8');
}

const working = `# WORKING.md

## Current Task
None

## Status
Idle

## Next Steps
1. Await task assignment
`;

const memory = `# MEMORY.md

## Stable facts & decisions
- (add durable facts here)
`;

maybeCopyAgentsManual();
writeFileSync(path.join(agentDir, 'SOUL.md'), soul, 'utf8');
writeFileSync(path.join(memoryDir, 'WORKING.md'), working, 'utf8');
writeFileSync(path.join(memoryDir, 'MEMORY.md'), memory, 'utf8');

console.log(`[agent_init] created ${agentDir}`);
