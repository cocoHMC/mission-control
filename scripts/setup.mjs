#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineVal] = arg.slice(2).split('=', 2);
    if (inlineVal !== undefined) {
      values.set(key, inlineVal);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      values.set(key, next);
      i++;
      continue;
    }
    flags.add(key);
  }
  return { flags, values };
}

function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function formatEnvValue(value) {
  if (value === '') return '';
  const safe = /^[A-Za-z0-9_./:@-]+$/.test(value);
  if (safe) return value;
  // Escape backslashes and quotes for a simple double-quoted .env value.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

async function askText(rl, label, { defaultValue = '', required = false } = {}) {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  while (true) {
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    const value = answer || defaultValue;
    if (!required || value) return value;
    process.stdout.write('  This value is required.\n');
  }
}

async function askYesNo(rl, label, { defaultYes = true } = {}) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  while (true) {
    const answer = (await rl.question(`${label} ${hint}: `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    if (['y', 'yes'].includes(answer)) return true;
    if (['n', 'no'].includes(answer)) return false;
    process.stdout.write('  Please answer y or n.\n');
  }
}

async function replaceEnvFile(examplePath, outPath, replacements) {
  const raw = await fs.readFile(examplePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!replacements.has(key)) return line;
    return `${key}=${formatEnvValue(String(replacements.get(key)))}`;
  });

  // Append any replacement keys that weren't present in the template.
  const existingKeys = new Set();
  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (match) existingKeys.add(match[1]);
  }
  for (const [key, val] of replacements.entries()) {
    if (existingKeys.has(key)) continue;
    out.push(`${key}=${formatEnvValue(String(val))}`);
  }

  await fs.writeFile(outPath, out.join('\n'), 'utf8');
}

async function run(cmd, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function probe(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, { timeoutMs = 12_000, intervalMs = 350 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(url)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envPath = path.join(rootDir, '.env');
  const envExamplePath = path.join(rootDir, '.env.example');

  const { flags, values } = parseArgs(process.argv.slice(2));
  const force = flags.has('force');
  const skipInstall = flags.has('skip-install');
  const skipBootstrap = flags.has('skip-bootstrap');

  try {
    await fs.access(envExamplePath);
  } catch {
    throw new Error(`Missing ${path.relative(process.cwd(), envExamplePath)} (run from repo root).`);
  }

  const envExists = await fs
    .access(envPath)
    .then(() => true)
    .catch(() => false);
  if (envExists && !force) {
    process.stdout.write('.env already exists.\n');
    process.stdout.write('Re-run with --force to overwrite it.\n');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write('\nMission Control setup (single-owner)\n');
    process.stdout.write('This will create a local .env and bootstrap PocketBase.\n\n');

    const mcUser = await askText(rl, 'Mission Control username (Basic Auth)', {
      defaultValue: values.get('mc-user') || 'admin',
      required: true,
    });
    const mcPassword = randomSecret(18);

    const pbAdminEmail = await askText(rl, 'PocketBase admin email', {
      defaultValue: values.get('pb-admin-email') || 'admin@example.com',
      required: true,
    });
    const pbAdminPassword = randomSecret(18);

    const pbServiceEmail = await askText(rl, 'PocketBase service email', {
      defaultValue: values.get('pb-service-email') || 'service@example.com',
      required: true,
    });
    const pbServicePassword = randomSecret(18);

    const leadAgentId = await askText(rl, 'Lead OpenClaw agent id', {
      defaultValue: values.get('lead-agent-id') || 'main',
      required: true,
    });
    const leadAgentName = await askText(rl, 'Lead agent display name', {
      defaultValue: values.get('lead-agent-name') || 'Coco (Main)',
      required: true,
    });

    const connectOpenClaw = await askYesNo(rl, 'Connect to OpenClaw now?', { defaultYes: true });
    let gatewayUrl = 'http://127.0.0.1:18789';
    let gatewayToken = '';
    let gatewayDisabled = false;
    if (connectOpenClaw) {
      gatewayUrl = await askText(rl, 'OpenClaw gateway URL', {
        defaultValue: values.get('openclaw-url') || gatewayUrl,
        required: true,
      });
      gatewayToken = await askText(rl, 'OpenClaw Tools Invoke token', {
        defaultValue: values.get('openclaw-token') || '',
        required: true,
      });
    } else {
      gatewayDisabled = true;
    }

    const gatewayHostHint = await askText(rl, 'Gateway tailnet host/IP hint (optional, for copy buttons)', {
      defaultValue: values.get('gateway-host-hint') || '',
      required: false,
    });

    const replacements = new Map();
    replacements.set('MC_ADMIN_USER', mcUser);
    replacements.set('MC_ADMIN_PASSWORD', mcPassword);
    replacements.set('PB_ADMIN_EMAIL', pbAdminEmail);
    replacements.set('PB_ADMIN_PASSWORD', pbAdminPassword);
    replacements.set('PB_SERVICE_EMAIL', pbServiceEmail);
    replacements.set('PB_SERVICE_PASSWORD', pbServicePassword);
    replacements.set('MC_LEAD_AGENT_ID', leadAgentId);
    replacements.set('MC_LEAD_AGENT', leadAgentId);
    replacements.set('MC_LEAD_AGENT_NAME', leadAgentName);
    replacements.set('NEXT_PUBLIC_MC_LEAD_AGENT_ID', leadAgentId);
    replacements.set('NEXT_PUBLIC_MC_LEAD_AGENT_NAME', leadAgentName);
    replacements.set('OPENCLAW_GATEWAY_URL', gatewayUrl);
    replacements.set('OPENCLAW_GATEWAY_TOKEN', gatewayToken);
    replacements.set('OPENCLAW_GATEWAY_DISABLED', gatewayDisabled ? 'true' : 'false');
    replacements.set('MC_GATEWAY_HOST_HINT', gatewayHostHint);

    await replaceEnvFile(envExamplePath, envPath, replacements);
    process.stdout.write(`\nWrote .env -> ${path.relative(process.cwd(), envPath)}\n`);

    if (!skipInstall) {
      const hasNodeModules = await fs
        .access(path.join(rootDir, 'node_modules'))
        .then(() => true)
        .catch(() => false);
      if (!hasNodeModules) {
        process.stdout.write('\nInstalling dependencies (pnpm install)...\n');
        await run('pnpm', ['install'], { cwd: rootDir });
      }
    }

    if (!skipBootstrap) {
      const pbUrl = (await fs.readFile(envPath, 'utf8'))
        .split(/\r?\n/)
        .find((l) => l.startsWith('PB_URL='))
        ?.slice('PB_URL='.length)
        ?.replace(/^"|"$/g, '') || 'http://127.0.0.1:8090';

      const healthUrl = new URL('/api/health', pbUrl).toString();
      const pbRunning = await probe(healthUrl);
      let pbProc = null;

      if (!pbRunning) {
        const pbBin = process.platform === 'win32' ? path.join(rootDir, 'pb', 'pocketbase.exe') : path.join(rootDir, 'pb', 'pocketbase');
        const pbBinExists = await fs
          .access(pbBin)
          .then(() => true)
          .catch(() => false);
        if (!pbBinExists) {
          process.stdout.write('\nPocketBase is not running and no local binary was found.\n');
          process.stdout.write('Start PocketBase (or run it in Docker), then re-run:\n');
          process.stdout.write('  node scripts/setup.mjs --skip-install\n\n');
          process.exit(1);
        }

        process.stdout.write('\nStarting PocketBase temporarily to bootstrap schema...\n');
        pbProc = spawn(pbBin, ['serve', '--dev', '--dir', path.join(rootDir, 'pb', 'pb_data')], {
          cwd: rootDir,
          stdio: 'ignore',
        });
        const ok = await waitFor(healthUrl, { timeoutMs: 12_000 });
        if (!ok) {
          try {
            pbProc.kill();
          } catch {
            // ignore
          }
          throw new Error(`PocketBase did not start in time at ${pbUrl}`);
        }
      }

      const pbBin = process.platform === 'win32' ? path.join(rootDir, 'pb', 'pocketbase.exe') : path.join(rootDir, 'pb', 'pocketbase');
      const pbBinExists = await fs
        .access(pbBin)
        .then(() => true)
        .catch(() => false);

      if (!pbBinExists) {
        process.stdout.write('\nPocketBase binary not found at pb/pocketbase.\n');
        process.stdout.write(`Create the first PocketBase admin manually at ${pbUrl}/_/ and then re-run setup.\n\n`);
        process.exit(1);
      }

      process.stdout.write('\nCreating/upserting PocketBase superuser...\n');
      await run(pbBin, ['superuser', 'upsert', pbAdminEmail, pbAdminPassword, '--dir', path.join(rootDir, 'pb', 'pb_data')], {
        cwd: rootDir,
      });

      process.stdout.write('\nBootstrapping PocketBase schema/rules/backfills...\n');
      await run('node', ['scripts/pb_bootstrap.mjs'], { cwd: rootDir });
      try {
        await run('node', ['scripts/pb_set_rules.mjs'], { cwd: rootDir });
      } catch {
        // ignore
      }
      try {
        await run('node', ['scripts/pb_backfill_vnext.mjs'], { cwd: rootDir });
      } catch {
        // ignore
      }

      if (pbProc) {
        try {
          pbProc.kill();
        } catch {
          // ignore
        }
      }
    }

    process.stdout.write('\nSetup complete.\n\n');
    process.stdout.write('Login credentials (Basic Auth):\n');
    process.stdout.write(`  username: ${mcUser}\n`);
    process.stdout.write(`  password: ${mcPassword}\n\n`);
    process.stdout.write('Next steps:\n');
    process.stdout.write('  1) Start dev: ./scripts/dev.sh\n');
    process.stdout.write('  2) Open UI:  http://127.0.0.1:4010/settings\n');
    process.stdout.write('  3) Create a task and assign it to the lead agent.\n\n');
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('\nSetup failed:', err?.message || err);
  process.exit(1);
});
