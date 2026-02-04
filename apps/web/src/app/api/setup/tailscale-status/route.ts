import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAdminAuthConfigured, isLoopbackHost } from '@/app/api/setup/_shared';
import { requireAdminAuth } from '@/lib/adminAuth';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

function stripTrailingDot(value: string) {
  const v = String(value || '').trim();
  if (!v) return '';
  return v.endsWith('.') ? v.slice(0, -1) : v;
}

function extraPathEntries() {
  if (process.platform === 'darwin') return ['/usr/local/bin', '/opt/homebrew/bin'];
  if (process.platform === 'linux') return ['/usr/local/bin', '/usr/bin'];
  return [];
}

async function resolveTailscaleBin() {
  // Prefer whatever is on PATH, but GUI-launched apps on macOS often have a minimal PATH.
  // We fall back to common install locations.
  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    candidates.push(
      '/usr/local/bin/tailscale',
      '/opt/homebrew/bin/tailscale',
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
    );
  } else if (process.platform === 'linux') {
    candidates.push('/usr/bin/tailscale', '/usr/local/bin/tailscale');
  }
  candidates.push('tailscale');

  for (const c of candidates) {
    if (c === 'tailscale') return c;
    try {
      await access(c, fsConstants.X_OK);
      return c;
    } catch {
      // keep looking
    }
  }
  return 'tailscale';
}

async function runTailscale(args: string[]) {
  const bin = await resolveTailscaleBin();
  const env: NodeJS.ProcessEnv = { ...process.env };
  const extra = extraPathEntries();
  env.PATH = [env.PATH || '', ...extra].filter(Boolean).join(':');
  try {
    const res = await execFileAsync(bin, args, { timeout: 2_500, env });
    return { ok: true as const, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } catch (err: any) {
    const code = err?.code;
    const stdout = err?.stdout ?? '';
    const stderr = err?.stderr ?? '';
    const message = err?.message ?? String(err);
    return { ok: false as const, code, stdout, stderr, message };
  }
}

export async function GET(req: NextRequest) {
  // Before setup is completed, only allow localhost to avoid exposing environment metadata.
  // After setup is completed, require admin auth and allow checking from tailnet devices.
  if (isAdminAuthConfigured()) {
    const auth = requireAdminAuth(req);
    if (auth) return auth;
  } else {
    const host = req.headers.get('host') || '';
    const hostname = host.split(':')[0] || '';
    if (!isLoopbackHost(hostname)) {
      return NextResponse.json({ error: 'Tailscale status is only available from localhost during setup.' }, { status: 403 });
    }
  }

  const version = await runTailscale(['--version']);
  const installed = version.ok;

  if (!installed) {
    return NextResponse.json({
      installed: false,
      running: false,
      backendState: null,
      self: null,
      serve: null,
      error: 'tailscale CLI not found. Install Tailscale first.',
    });
  }

  const status = await runTailscale(['status', '--json']);
  if (!status.ok) {
    const msg = (status.stderr || status.stdout || status.message || '').trim();
    return NextResponse.json({
      installed: true,
      running: false,
      backendState: null,
      self: null,
      serve: null,
      error: msg || 'Failed to query tailscale status. Is Tailscale running?',
    });
  }

  let parsed: any = null;
  try {
    parsed = status.stdout ? JSON.parse(status.stdout) : null;
  } catch {
    parsed = null;
  }

  const backendState = parsed?.BackendState ? String(parsed.BackendState) : null;
  const self = parsed?.Self || null;
  const tailscaleIps = Array.isArray(self?.TailscaleIPs) ? self.TailscaleIPs.map(String) : [];
  const dnsName = stripTrailingDot(self?.DNSName ? String(self.DNSName) : '');
  const hostName = self?.HostName ? String(self.HostName) : '';
  const online = typeof self?.Online === 'boolean' ? self.Online : null;

  const serveStatus = await runTailscale(['serve', 'status', '--json']);
  let serve: any = null;
  if (serveStatus.ok) {
    try {
      serve = serveStatus.stdout ? JSON.parse(serveStatus.stdout) : null;
    } catch {
      serve = null;
    }
  }

  return NextResponse.json({
    installed: true,
    running: true,
    backendState,
    self: { hostName: hostName || null, dnsName: dnsName || null, tailscaleIps, online },
    serve: serveStatus.ok ? { configured: true, raw: serve } : { configured: false, error: (serveStatus.stderr || serveStatus.stdout || serveStatus.message || '').trim() },
  });
}
