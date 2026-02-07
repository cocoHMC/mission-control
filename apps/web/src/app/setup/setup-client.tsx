'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';

type StatusResponse = {
  configured: boolean;
  setupAllowed: boolean;
  hostname: string;
  defaults: {
    mcAdminUser: string;
    leadAgentId: string;
    leadAgentName: string;
    pbUrl: string;
    pbServiceEmail: string;
    openclawGatewayUrl: string;
    gatewayHostHint: string;
    gatewayPortHint: string;
  };
};

type ApplyResponse =
  | { ok: true; envPath: string; restartRequired: boolean; restartMode?: 'auto' | 'manual'; next: string[] }
  | { error: string };

type TailscaleStatus =
  | {
      installed: true;
      running: true;
      backendState: string | null;
      self: { hostName: string | null; dnsName: string | null; tailscaleIps: string[]; online: boolean | null } | null;
      serve: { configured: boolean; error?: string; raw?: unknown } | null;
      error?: undefined;
    }
  | {
      installed: boolean;
      running: boolean;
      backendState: null;
      self: null;
      serve: null;
      error?: string;
    };

function generatePassword(bytes = 18) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  // base64url-ish
  return btoa(String.fromCharCode(...Array.from(arr)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function SetupClient() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ApplyResponse | null>(null);
  const [openclawTest, setOpenclawTest] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [testingOpenclaw, setTestingOpenclaw] = React.useState(false);
  const [discoveringOpenclaw, setDiscoveringOpenclaw] = React.useState(false);
  const [openclawDiscoverStatus, setOpenclawDiscoverStatus] = React.useState<string | null>(null);
  const [tailscale, setTailscale] = React.useState<TailscaleStatus | null>(null);
  const [loadingTailscale, setLoadingTailscale] = React.useState(false);
  const [restartSeconds, setRestartSeconds] = React.useState<number | null>(null);

  const [form, setForm] = React.useState({
    mcAdminUser: 'admin',
    mcAdminPassword: '',
    leadAgentId: 'main',
    leadAgentName: 'Coco (Main)',
    // PocketBase is normally local (started by scripts/run.sh). Values below are
    // used for first-run bootstrap; we keep them in "Advanced" for most users.
    pbUrl: 'http://127.0.0.1:8090',
    pbServiceEmail: 'service@local.mc',
    connectOpenClaw: true,
    openclawGatewayUrl: 'http://127.0.0.1:18789',
    openclawGatewayToken: '',
    gatewayHostHint: '',
    gatewayPortHint: '18789',
  });

  const pbAdminEmail = React.useMemo(() => {
    const raw = (form.mcAdminUser || '').trim();
    if (!raw) return 'admin@local.mc';
    if (raw.includes('@')) return raw;
    const safe = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return `${safe || 'admin'}@local.mc`;
  }, [form.mcAdminUser]);

  const tailscalePrimaryIp = React.useMemo(() => {
    const ips = tailscale?.self?.tailscaleIps || [];
    return ips.find((ip) => ip.includes('.')) || ips[0] || '';
  }, [tailscale]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/setup/status', { cache: 'no-store' });
        const json = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(json);
        setForm((prev) => ({
          ...prev,
          mcAdminUser: json.defaults.mcAdminUser || prev.mcAdminUser,
          leadAgentId: json.defaults.leadAgentId || prev.leadAgentId,
          leadAgentName: json.defaults.leadAgentName || prev.leadAgentName,
          pbUrl: json.defaults.pbUrl || prev.pbUrl,
          pbServiceEmail: json.defaults.pbServiceEmail || prev.pbServiceEmail,
          openclawGatewayUrl: json.defaults.openclawGatewayUrl || prev.openclawGatewayUrl,
          gatewayHostHint: json.defaults.gatewayHostHint || prev.gatewayHostHint,
          gatewayPortHint: json.defaults.gatewayPortHint || prev.gatewayPortHint,
        }));
        // Pre-fill secrets with generated values only if they are empty.
        setForm((prev) => ({
          ...prev,
          mcAdminPassword: prev.mcAdminPassword || generatePassword(18),
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message || 'Failed to load setup status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTailscale = React.useCallback(async () => {
    setLoadingTailscale(true);
    try {
      const res = await fetch('/api/setup/tailscale-status', { cache: 'no-store' });
      const json = (await res.json()) as TailscaleStatus;
      setTailscale(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTailscale({
        installed: true,
        running: false,
        backendState: null,
        self: null,
        serve: null,
        error: message || 'Failed to check tailscale status',
      });
    } finally {
      setLoadingTailscale(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshTailscale();
  }, [refreshTailscale]);

  React.useEffect(() => {
    if (!result || !('ok' in result) || !result.ok) return;
    if (result.restartMode !== 'auto') return;

    const startedAt = Date.now();
    setRestartSeconds(0);
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRestartSeconds(elapsed);

      // Once the process restarts, /api/setup/status will report configured=true.
      // That route is not behind Basic Auth so we can poll safely here.
      try {
        const res = await fetch('/api/setup/status', { cache: 'no-store' });
        const json = (await res.json()) as StatusResponse;
        if (json?.configured) {
          window.location.href = '/';
          return;
        }
      } catch {
        // During restart, the server may be down briefly. Keep polling.
      }

      if (elapsed >= 45) return; // give up; user can restart manually
      setTimeout(() => void tick(), 1000);
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [result]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setResult(null);
    setRestartSeconds(null);
    try {
      const payload = {
        ...form,
        pbAdminEmail,
        // Default simplicity: reuse the Mission Control password for PocketBase
        // admin + service so users don't manage multiple passwords.
        pbAdminPassword: form.mcAdminPassword,
        pbServicePassword: form.mcAdminPassword,
      };
      const res = await fetch('/api/setup/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApplyResponse;
      if (!res.ok) throw new Error('error' in json ? json.error : `Setup failed (${res.status})`);
      setResult(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Setup failed');
    } finally {
      setSaving(false);
    }
  }

  async function testOpenClaw() {
    setTestingOpenclaw(true);
    setOpenclawTest(null);
    try {
      const res = await fetch('/api/setup/test-openclaw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gatewayUrl: form.openclawGatewayUrl, token: form.openclawGatewayToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error || 'Failed';
        setOpenclawTest({
          ok: false,
          message: `${msg}\nYou must install OpenClaw, run "openclaw gateway" (start the gateway), then go to the Overview page to copy the URL + Tools Invoke token.`,
        });
        return;
      }
      const count = typeof json?.sessionCount === 'number' ? json.sessionCount : null;
      setOpenclawTest({
        ok: true,
        message: count !== null ? `Success (sessions: ${count})` : 'Success',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setOpenclawTest({
        ok: false,
        message: `${message || 'Failed'}\nYou must install OpenClaw, run "openclaw gateway" (start the gateway), then go to the Overview page to copy the URL + Tools Invoke token.`,
      });
    } finally {
      setTestingOpenclaw(false);
    }
  }

  async function discoverOpenClawLocal() {
    setDiscoveringOpenclaw(true);
    setOpenclawDiscoverStatus(null);
    try {
      const res = await fetch('/api/setup/openclaw-local', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to discover local OpenClaw config.');

      const discoveredToken = String(json?.token || '');
      const discoveredUrl = String(json?.url || '');
      const discoveredPort = json?.gateway?.port ? String(json.gateway.port) : '';
      const discoveredBind = json?.gateway?.bind ? String(json.gateway.bind) : '';

      const bindLower = discoveredBind.trim().toLowerCase();
      const isTailnetBind = bindLower === 'tailnet' || bindLower === 'tailscale';

      let suggestedUrl = discoveredUrl;
      if (isTailnetBind && tailscalePrimaryIp) {
        const port = discoveredPort || (() => {
          try {
            const u = new URL(discoveredUrl);
            return u.port || '';
          } catch {
            return '';
          }
        })();
        suggestedUrl = `http://${tailscalePrimaryIp}:${port || '18789'}`;
      }

      setForm((prev) => {
        let nextUrl = prev.openclawGatewayUrl;
        if (isTailnetBind) {
          if (suggestedUrl) nextUrl = suggestedUrl;
        } else {
          try {
            const u = new URL(prev.openclawGatewayUrl);
            const host = (u.hostname || '').toLowerCase();
            const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
            // If the user is pointing at loopback, safely update the port.
            if (loopback && suggestedUrl) nextUrl = suggestedUrl;
          } catch {
            if (suggestedUrl) nextUrl = suggestedUrl;
          }
        }
        return {
          ...prev,
          openclawGatewayUrl: nextUrl,
          openclawGatewayToken: discoveredToken || prev.openclawGatewayToken,
          connectOpenClaw: true,
        };
      });

      setOpenclawDiscoverStatus(
        `Loaded from local OpenClaw config${discoveredPort ? ` (port ${discoveredPort})` : ''}${discoveredBind ? `, bind=${discoveredBind}` : ''}${suggestedUrl && suggestedUrl !== discoveredUrl ? ` (using ${suggestedUrl})` : ''}.`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setOpenclawDiscoverStatus(message || 'Failed to discover local OpenClaw config.');
    } finally {
      setDiscoveringOpenclaw(false);
    }
  }

  if (loading) {
    return (
      <div className="mc-viewport overflow-auto mc-scroll">
        <div className="mx-auto max-w-3xl p-8">
          <div className="text-sm text-muted">Loading setup…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-viewport overflow-auto mc-scroll">
      <div className="mx-auto max-w-3xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Mission Control</div>
          <div className="mt-2 text-3xl font-semibold headline">First-run Setup</div>
          <div className="mt-2 text-sm text-muted">
            This configures Basic Auth, bootstraps PocketBase, and (optionally) connects to OpenClaw. Mission Control
            will restart automatically after applying.
          </div>
        </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">
          host: {status?.hostname || 'unknown'}
        </Badge>
        <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">tailnet-only recommended</Badge>
      </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Setup Assistant (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted">
            <div>
              If you&apos;re using an AI coding agent with terminal access (Codex, Claude Code, etc), install the
              Mission Control setup skill and ask it to wire everything end-to-end (Tailscale/Headscale, OpenClaw,
              nodes, notifications).
            </div>
            <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                What are “Gateway”, “Agents”, and “Nodes”?
              </summary>
              <div className="mt-2 space-y-2 text-xs text-muted">
                <div>
                  <span className="font-semibold text-[var(--foreground)]">Gateway:</span> the OpenClaw service running
                  on your main machine. Mission Control talks to it via <span className="font-mono">/tools/invoke</span>{' '}
                  using a token.
                </div>
                <div>
                  <span className="font-semibold text-[var(--foreground)]">Agents:</span> named worker identities (for
                  example <span className="font-mono">main</span>, <span className="font-mono">dev</span>) that receive
                  assignments/messages through the gateway.
                </div>
                <div>
                  <span className="font-semibold text-[var(--foreground)]">Nodes:</span> additional machines paired to
                  your gateway (optional). Node execution is powerful but risky; keep allowlists strict.
                </div>
              </div>
            </details>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="font-semibold text-[var(--foreground)]">Codex: install the skill</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono">./scripts/install_codex_skill.sh</span>
                <CopyButton value="./scripts/install_codex_skill.sh" label="Copy cmd" />
              </div>
              <div className="mt-2">
                Skill file: <span className="font-mono">skills/mission-control-setup/SKILL.md</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">Step-by-step</summary>
                <div className="mt-2 space-y-2 text-xs text-muted">
                  <div className="font-semibold text-[var(--foreground)]">1) Install a terminal-enabled AI</div>
                  <div>Use any AI that can run shell commands on your machine (Codex, Claude Code, etc).</div>

                  <div className="font-semibold text-[var(--foreground)]">2) Download this repo (if needed)</div>
                  <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] text-[var(--foreground)]">
                    {[
                      'git clone https://github.com/cocoHMC/mission-control.git',
                      'cd mission-control',
                      './scripts/install_codex_skill.sh',
                    ].join('\n')}
                  </div>

                  <div className="font-semibold text-[var(--foreground)]">3) Restart Codex and use the skill</div>
                  <div>
                    If Codex is already open, restart it so it reloads skills. Then ask your AI to use the{' '}
                    <span className="font-mono">mission-control-setup</span> skill.
                  </div>
                  <div>
                    Codex skills folder: <span className="font-mono">$CODEX_HOME/skills</span> (defaults to{' '}
                    <span className="font-mono">~/.codex/skills</span>).
                  </div>
                </div>
              </details>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="font-semibold text-[var(--foreground)]">Universal prompt</div>
              <div className="mt-2">
                Paste this into your AI (it will ask a few short questions, then run the setup):
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CopyButton
                  value={[
                    'Use the "mission-control-setup" skill.',
                    'Goal: make Mission Control fully operational across devices.',
                    '',
                    'Do:',
                    '- install/run Mission Control (desktop app / source / Docker)',
                    '- configure tailnet access safely (prefer tailscale serve; do NOT use funnel unless I explicitly ask)',
                    '- connect OpenClaw gateway URL + Tools Invoke token and verify delivery',
                    '- (optional) pair nodes with strict allowlists',
                    '- enable notifications (desktop + web push/PWA on iPhone) and send tests',
                    '',
                    'When done, verify with:',
                    '- ./scripts/healthcheck.sh',
                    '- node scripts/openclaw_ping.mjs (if OpenClaw is enabled)',
                  ].join('\n')}
                  label="Copy prompt"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tailscale (Recommended)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={refreshTailscale} disabled={loadingTailscale}>
                {loadingTailscale ? 'Checking…' : 'Check status'}
              </Button>
              {tailscale ? (
                <Badge
                  className={
                    !tailscale.installed || !tailscale.running
                      ? 'border-none bg-red-600 text-white'
                      : tailscale.backendState === 'Running'
                        ? 'border-none bg-emerald-600 text-white'
                        : 'border-none bg-amber-500 text-black'
                  }
                >
                  {!tailscale.installed ? 'not installed' : !tailscale.running ? 'not running' : tailscale.backendState || 'unknown'}
                </Badge>
              ) : null}
            </div>

            {tailscale?.self?.tailscaleIps?.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[var(--foreground)]">Tailnet IPs</div>
                  <div className="font-mono text-xs text-muted">{tailscale.self.tailscaleIps.join(', ')}</div>
                  <CopyButton value={tailscale.self.tailscaleIps.join(', ')} label="Copy IPs" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[var(--foreground)]">MagicDNS</div>
                  <div className="font-mono text-xs text-muted">{tailscale.self.dnsName || '—'}</div>
                  {tailscale.self.dnsName ? <CopyButton value={tailscale.self.dnsName} label="Copy name" /> : null}
                </div>
              </div>
            ) : null}

            {tailscale?.self && (tailscale.self.dnsName || tailscalePrimaryIp) ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                <div className="font-semibold text-[var(--foreground)]">Remote Access (Tailnet)</div>
                <div className="mt-2">
                  Recommended: keep Mission Control bound to <span className="font-mono">127.0.0.1</span> and use{' '}
                  <span className="font-mono">tailscale serve</span>.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono">tailscale serve --bg 4010</span>
                  <CopyButton value="tailscale serve --bg 4010" label="Copy cmd" />
                </div>
                {tailscale.self.dnsName ? (
                  <>
                    <div className="mt-2">
                      Then open from any device on your tailnet:{' '}
                      <span className="font-mono">https://{tailscale.self.dnsName}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CopyButton value={`https://${tailscale.self.dnsName}`} label="Copy URL" />
                    </div>
                  </>
                ) : null}
                {tailscalePrimaryIp ? (
                  <div className="mt-3">
                    Advanced: bind Mission Control to your tailnet IP, then open{' '}
                    <span className="font-mono">http://{tailscalePrimaryIp}:4010</span>.
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CopyButton value={`http://${tailscalePrimaryIp}:4010`} label="Copy IP URL" />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tailscale?.error ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                {tailscale.error}
              </pre>
            ) : null}

            <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                How to connect (Tailscale or Headscale) + enable safe remote access
              </summary>
              <div className="mt-2 space-y-3 text-xs text-muted">
                <div className="font-semibold text-[var(--foreground)]">1) Install + start Tailscale</div>
                <div>
                  macOS/Windows: install Tailscale and open the app. Linux: install Tailscale then start the daemon with{' '}
                  <span className="font-mono">sudo systemctl enable --now tailscaled</span>.
                </div>

                <div className="font-semibold text-[var(--foreground)]">2) Join your tailnet</div>
                <div>
                  Hosted Tailscale: sign in and run <span className="font-mono">tailscale up</span>.
                </div>
                <div>
                  Headscale: create an auth key in your headscale server, then run:
                  <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] text-[var(--foreground)]">
                    tailscale up --login-server https://YOUR_HEADSCALE_URL --authkey YOUR_AUTHKEY --hostname mission-control
                  </div>
                </div>

                <div className="font-semibold text-[var(--foreground)]">3) Expose Mission Control to tailnet only (recommended)</div>
                <div>
                  Keep Mission Control bound to loopback, then run:
                  <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] text-[var(--foreground)]">
                    tailscale serve --bg 4010
                  </div>
                  Verify with: <span className="font-mono">tailscale serve status</span>.
                </div>
                <div>
                  Do not use <span className="font-mono">tailscale funnel</span> unless you explicitly want public internet exposure.
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mission Control Login (Basic Auth)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={form.mcAdminUser}
              onChange={(e) => setForm((p) => ({ ...p, mcAdminUser: e.target.value }))}
              placeholder="Username"
            />
            <div className="flex items-center gap-2">
              <Input
                value={form.mcAdminPassword}
                onChange={(e) => setForm((p) => ({ ...p, mcAdminPassword: e.target.value }))}
                placeholder="Password"
                type="password"
              />
              <Button type="button" size="sm" variant="secondary" onClick={() => setForm((p) => ({ ...p, mcAdminPassword: generatePassword(18) }))}>
                Generate
              </Button>
              <CopyButton value={form.mcAdminPassword} label="Copy" />
            </div>
            <div className="text-xs text-muted">
              You&apos;ll use this username/password when opening the UI.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Agent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={form.leadAgentId}
              onChange={(e) => setForm((p) => ({ ...p, leadAgentId: e.target.value }))}
              placeholder="Lead agent id (OpenClaw) e.g. main"
            />
            <Input
              value={form.leadAgentName}
              onChange={(e) => setForm((p) => ({ ...p, leadAgentName: e.target.value }))}
              placeholder="Display name"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PocketBase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted">
              PocketBase runs locally and stores all tasks/agents/documents. It is normally started by{' '}
              <span className="font-mono">./scripts/run.sh</span> at <span className="font-mono">{form.pbUrl}</span>.
            </div>
            <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                Advanced PocketBase settings (most people can ignore this)
              </summary>
              <div className="mt-2 text-xs text-muted">
                Your Mission Control username/password above will also be used for the PocketBase database admin login.
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  value={form.pbUrl}
                  onChange={(e) => setForm((p) => ({ ...p, pbUrl: e.target.value }))}
                  placeholder="PocketBase URL"
                />
                <div className="flex items-center gap-2">
                  <Input value={pbAdminEmail} readOnly placeholder="PocketBase admin email" />
                  <CopyButton value={pbAdminEmail} label="Copy" />
                </div>
                <Input
                  value={form.pbServiceEmail}
                  onChange={(e) => setForm((p) => ({ ...p, pbServiceEmail: e.target.value }))}
                  placeholder="PocketBase service email"
                />
                <div className="text-xs text-muted">
                  Admin UI: <span className="font-mono">{form.pbUrl}/_/</span> (password = Mission Control password)
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OpenClaw (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.connectOpenClaw}
                onChange={(e) => setForm((p) => ({ ...p, connectOpenClaw: e.target.checked }))}
              />
              Connect OpenClaw now (Tools Invoke delivery)
            </label>
            <Input
              value={form.openclawGatewayUrl}
              onChange={(e) => setForm((p) => ({ ...p, openclawGatewayUrl: e.target.value }))}
              placeholder="Gateway URL (usually http://127.0.0.1:18789)"
              disabled={!form.connectOpenClaw}
            />
            <Input
              value={form.openclawGatewayToken}
              onChange={(e) => setForm((p) => ({ ...p, openclawGatewayToken: e.target.value }))}
              placeholder="Tools Invoke token"
              type="password"
              disabled={!form.connectOpenClaw}
            />
            <div className="text-xs text-muted">
              Tip: go to the <span className="font-semibold">Overview</span> page in OpenClaw to copy your gateway URL and Tools Invoke token,
              then paste them here.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={discoverOpenClawLocal}
                disabled={discoveringOpenclaw}
              >
                {discoveringOpenclaw ? 'Discovering…' : 'Fill from local OpenClaw config'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={testOpenClaw}
                disabled={!form.connectOpenClaw || !form.openclawGatewayToken.trim() || testingOpenclaw}
              >
                {testingOpenclaw ? 'Testing…' : 'Test connection'}
              </Button>
              {openclawTest ? (
                <Badge className={openclawTest.ok ? 'border-none bg-emerald-600 text-white' : 'border-none bg-red-600 text-white'}>
                  {openclawTest.ok ? 'connected' : 'failed'}
                </Badge>
              ) : null}
              {openclawTest ? <CopyButton value={openclawTest.message} label="Copy result" /> : null}
            </div>
            <div className="text-xs text-muted">
              Local-only: this reads your OpenClaw config on this machine to fill the token. It only works on{' '}
              <span className="font-mono">localhost</span>.
            </div>
            {openclawDiscoverStatus ? <div className="text-xs text-muted">{openclawDiscoverStatus}</div> : null}
            {openclawTest ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                {openclawTest.message}
              </pre>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={form.gatewayHostHint}
                onChange={(e) => setForm((p) => ({ ...p, gatewayHostHint: e.target.value }))}
                placeholder="Gateway tailnet host/IP hint (optional)"
              />
              <Input
                value={form.gatewayPortHint}
                onChange={(e) => setForm((p) => ({ ...p, gatewayPortHint: e.target.value }))}
                placeholder="Gateway port hint (default 18789)"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Applying…' : 'Save + Bootstrap'}
          </Button>
          <CopyButton
            value={[
              `Mission Control Login`,
              `username: ${form.mcAdminUser}`,
              `password: ${form.mcAdminPassword}`,
              ``,
              `Lead agent: ${form.leadAgentName} (${form.leadAgentId})`,
              ``,
              `OpenClaw`,
              `gateway: ${form.openclawGatewayUrl}`,
              `connected: ${form.connectOpenClaw ? 'yes' : 'no'}`,
            ].join('\n')}
            label="Copy summary"
          />
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {result && 'ok' in result && result.ok ? (
          <Card>
            <CardHeader>
              <CardTitle>Setup Applied</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="text-sm">
                Wrote <span className="font-mono">{result.envPath}</span>.
              </div>

              {result.restartMode === 'auto' ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                  <div className="font-semibold text-[var(--foreground)]">Restarting Mission Control…</div>
                  <div className="mt-2">
                    {restartSeconds !== null
                      ? `Restarting… T-minus ~${Math.max(0, 10 - restartSeconds)}s (elapsed ${restartSeconds}s)`
                      : 'Restarting…'}
                  </div>
                  <div className="mt-2">When restart completes, you’ll be redirected to the login prompt.</div>
                  {restartSeconds !== null && restartSeconds >= 45 ? (
                    <div className="mt-3 text-red-600">
                      Auto-restart didn’t complete. Restart Mission Control manually using <span className="font-mono">./scripts/run.sh</span>.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                  <div className="font-semibold text-[var(--foreground)]">Next</div>
                  <ol className="mt-2 list-decimal pl-5">
                    {(result.next || []).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                <div className="font-semibold text-[var(--foreground)]">Your Login</div>
                <div className="mt-2">
                  username: <span className="font-mono">{form.mcAdminUser}</span>
                </div>
                <div className="mt-1">password: <span className="font-mono">••••••••</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton value={form.mcAdminUser} label="Copy user" />
                  <CopyButton value={form.mcAdminPassword} label="Copy pass" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </form>
    </div>
    </div>
  );
}
