#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const id = arg('--id');
const name = arg('--name');
const role = arg('--role') || 'Agent';

if (!id || !name) {
  console.error('Usage: agent_init.mjs --id <id> --name <name> [--role <role>]');
  process.exit(1);
}

const root = process.cwd();
const agentDir = join(root, 'agents', id);
const memoryDir = join(agentDir, 'memory');

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

writeFileSync(join(agentDir, 'SOUL.md'), soul, 'utf8');
writeFileSync(join(memoryDir, 'WORKING.md'), working, 'utf8');
writeFileSync(join(memoryDir, 'MEMORY.md'), memory, 'utf8');

console.log(`[agent_init] created ${agentDir}`);
