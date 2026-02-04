/** @type {import('next').NextConfig} */
const path = require('node:path');
const host = process.env.MC_BIND_HOST || '127.0.0.1';
const port = process.env.MC_WEB_PORT || '4010';

function uniq(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

function safeExec(cmd) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execSync } = require('node:child_process');
    return String(execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }) || '').trim();
  } catch {
    return '';
  }
}

function tailscaleOrigins() {
  const origins = [];
  const ipsRaw = safeExec('tailscale ip -4');
  const ips = ipsRaw ? ipsRaw.split(/\s+/).filter(Boolean) : [];
  for (const ip of ips) origins.push(`http://${ip}:${port}`);

  const statusRaw = safeExec('tailscale status --json');
  if (statusRaw) {
    try {
      const status = JSON.parse(statusRaw);
      const dns = status?.Self?.DNSName ? String(status.Self.DNSName).replace(/\.$/, '') : '';
      if (dns) origins.push(`http://${dns}:${port}`, `https://${dns}`);
    } catch {
      // ignore
    }
  }

  return origins;
}

function extraDevOrigins() {
  const raw = process.env.MC_ALLOWED_DEV_ORIGINS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const nextConfig = {
  output: 'standalone',
  // Monorepo: ensure output file tracing can resolve workspace deps.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Dev-only: allow Tailnet origin to fetch HMR assets.
  allowedDevOrigins: uniq([
    'http://127.0.0.1:4010',
    'http://localhost:4010',
    `http://${host}:${port}`,
    ...tailscaleOrigins(),
    ...extraDevOrigins(),
  ]),
};

module.exports = nextConfig;
