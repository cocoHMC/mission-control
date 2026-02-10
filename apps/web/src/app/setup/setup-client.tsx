'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type StatusResponse = {
  configured: boolean;
  setupAllowed: boolean;
  envPath?: string;
  vaultConfigured?: boolean;
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
  | {
      ok: true;
      envPath: string;
      vaultMasterKeyB64?: string | null;
      restartRequired: boolean;
      restartMode?: 'auto' | 'manual';
      next: string[];
    }
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

  const [step, setStep] = React.useState(0);
  const [savedVaultKey, setSavedVaultKey] = React.useState(false);
  const [keepExistingPassword, setKeepExistingPassword] = React.useState(false);
  const [vaultMasterKeyReveal, setVaultMasterKeyReveal] = React.useState<string | null>(null);
  const [revealLoading, setRevealLoading] = React.useState(false);

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
        const res = await mcFetch('/api/setup/status', { cache: 'no-store' });
        const json = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(json);
        setKeepExistingPassword(Boolean(json?.configured));
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
        // For first-run, pre-fill with a generated password. For reconfigure, keep blank by default.
        setForm((prev) => ({
          ...prev,
          mcAdminPassword: json?.configured ? '' : prev.mcAdminPassword || generatePassword(18),
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
      const res = await mcFetch('/api/setup/tailscale-status', { cache: 'no-store' });
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
        const res = await mcFetch('/api/setup/status', { cache: 'no-store' });
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
      const isReconfigure = Boolean(status?.configured);
      const endpoint = isReconfigure ? '/api/setup/reconfigure' : '/api/setup/apply';
      const adminPassword = keepExistingPassword ? '' : form.mcAdminPassword;
      const payload = {
        ...form,
        mcAdminPassword: adminPassword,
        pbAdminEmail,
        // Default simplicity: reuse the Mission Control password for PocketBase
        // admin + service so users don't manage multiple passwords.
        pbAdminPassword: adminPassword || form.mcAdminPassword,
        pbServicePassword: adminPassword || form.mcAdminPassword,
      };
      const res = await mcFetch(endpoint, {
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
      const res = await mcFetch('/api/setup/test-openclaw', {
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
      const res = await mcFetch('/api/setup/openclaw-local', { cache: 'no-store' });
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

  async function revealVaultMasterKey() {
    setRevealLoading(true);
    setVaultMasterKeyReveal(null);
    try {
      const res = await mcFetch('/api/setup/vault-master-key?confirm=show', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setVaultMasterKeyReveal(String(json.key || ''));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setVaultMasterKeyReveal(message || 'Failed to reveal key');
    } finally {
      setRevealLoading(false);
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

  const isReconfigure = Boolean(status?.configured);
  const stepDefs = [
    { id: 'welcome', title: 'Welcome', subtitle: 'What this wizard configures' },
    { id: 'tailnet', title: 'Tailnet', subtitle: 'Safe remote access (recommended)' },
    { id: 'login', title: 'Login', subtitle: 'Mission Control Basic Auth' },
    { id: 'lead', title: 'Lead Agent', subtitle: 'Default assignee and escalation target' },
    { id: 'vault', title: 'Vault', subtitle: 'Credentials encryption + backups' },
    { id: 'openclaw', title: 'OpenClaw', subtitle: 'Optional gateway wiring' },
    { id: 'db', title: 'Database', subtitle: 'PocketBase advanced settings' },
    { id: 'review', title: 'Review', subtitle: isReconfigure ? 'Save and restart' : 'Bootstrap and restart' },
  ] as const;

  const activeStep = stepDefs[Math.max(0, Math.min(step, stepDefs.length - 1))];
  const progressPct = Math.round(((step + 1) / stepDefs.length) * 100);

  return (
    <div className="mc-viewport overflow-auto mc-scroll">
      <div className="mx-auto max-w-4xl p-6 sm:p-8">
        <div className="mb-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Mission Control</div>
              <div className="mt-2 text-3xl font-semibold headline">{isReconfigure ? 'Setup Wizard' : 'First-run Setup Wizard'}</div>
              <div className="mt-2 text-sm text-muted">
                {isReconfigure
                  ? 'Re-run the wizard to update settings. Changes are written to .env and Mission Control restarts.'
                  : 'This configures Basic Auth, bootstraps PocketBase, and (optionally) connects to OpenClaw. Mission Control restarts after applying.'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">host: {status?.hostname || 'unknown'}</Badge>
              <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">tailnet-only recommended</Badge>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Step {step + 1} of {stepDefs.length}</div>
                <div className="mt-1 truncate text-lg font-semibold text-[var(--foreground)]">{activeStep.title}</div>
                <div className="mt-1 text-sm text-muted">{activeStep.subtitle}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {stepDefs.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(idx)}
                    className={`h-9 rounded-xl border px-3 text-sm transition ${
                      idx === step
                        ? 'border-transparent bg-[var(--accent)] text-[var(--background)]'
                        : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[color:var(--foreground)]/5'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[color:var(--foreground)]/10">
              <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {step === 0 ? (
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
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 1 ? (
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
                    <div className="font-semibold text-[var(--foreground)]">Safe remote access</div>
                    <div className="mt-2">
                      Recommended: keep Mission Control bound to <span className="font-mono">127.0.0.1</span> and use{' '}
                      <span className="font-mono">tailscale serve</span>.
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono">tailscale serve --bg 4010</span>
                      <CopyButton value="tailscale serve --bg 4010" label="Copy cmd" />
                    </div>
                    {tailscale.self.dnsName ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono">https://{tailscale.self.dnsName}</span>
                        <CopyButton value={`https://${tailscale.self.dnsName}`} label="Copy URL" />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {tailscale?.error ? (
                  <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                    {tailscale.error}
                  </pre>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
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
                {isReconfigure ? (
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" checked={keepExistingPassword} onChange={(e) => setKeepExistingPassword(e.target.checked)} />
                    Keep current password (recommended)
                  </label>
                ) : null}
                <div className="flex items-center gap-2">
                  <Input
                    value={form.mcAdminPassword}
                    onChange={(e) => setForm((p) => ({ ...p, mcAdminPassword: e.target.value }))}
                    placeholder={keepExistingPassword ? '(unchanged)' : 'Password'}
                    type="password"
                    disabled={isReconfigure && keepExistingPassword}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setForm((p) => ({ ...p, mcAdminPassword: generatePassword(18) }))}
                    disabled={isReconfigure && keepExistingPassword}
                  >
                    Generate
                  </Button>
                  <CopyButton value={form.mcAdminPassword} label="Copy" className={isReconfigure && keepExistingPassword ? 'opacity-50 pointer-events-none' : ''} />
                </div>
                <div className="text-xs text-muted">This username/password gates the UI. Keep it strong.</div>
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? (
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
                <div className="text-xs text-muted">
                  This agent is used as the default escalation target and a safe fallback when no assignees exist.
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 4 ? (
            <Card>
              <CardHeader>
                <CardTitle>Vault (Credentials)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Losing <span className="font-mono">MC_VAULT_MASTER_KEY_B64</span> means losing access to all stored secrets.
                  Back it up like a root password.
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                  <div className="font-semibold text-[var(--foreground)]">Where it lives</div>
                  <div className="mt-2 text-muted">
                    It is stored in your Mission Control <span className="font-mono">.env</span> file.
                  </div>
                  {status?.envPath ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono">{status.envPath}</span>
                      <CopyButton value={status.envPath} label="Copy path" />
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                  <div className="font-semibold text-[var(--foreground)]">Vault Key Backup Checklist</div>
                  <div className="mt-2 space-y-2 text-muted">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={savedVaultKey}
                        onChange={(e) => setSavedVaultKey(e.target.checked)}
                      />
                      <span>
                        I saved <span className="font-mono">MC_VAULT_MASTER_KEY_B64</span> somewhere secure.
                        <div className="mt-1 text-[11px] text-muted">
                          Recommended: a password manager (1Password/Bitwarden), a team secret manager, or an encrypted offline backup.
                        </div>
                      </span>
                    </label>
                    <div className="text-[11px] text-muted">
                      Don’t store this key in plaintext notes, screenshots, or chat logs. Treat it like a root password.
                    </div>
                    <div className="text-[11px] text-muted">
                      If you rotate/reinstall Mission Control, keep this key the same to preserve decryptability of existing secrets.
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                  <div className="font-semibold text-[var(--foreground)]">Reveal (danger)</div>
                  <div className="mt-2 text-muted">
                    Only do this if you are alone and ready to paste into a secure password manager.
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={revealVaultMasterKey} disabled={revealLoading}>
                      {revealLoading ? 'Revealing…' : 'Reveal key'}
                    </Button>
                    {vaultMasterKeyReveal ? <CopyButton value={vaultMasterKeyReveal} label="Copy key" /> : null}
                  </div>
                  {vaultMasterKeyReveal ? (
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] text-[var(--foreground)]">
                      {vaultMasterKeyReveal}
                    </pre>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 5 ? (
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={discoverOpenClawLocal} disabled={discoveringOpenclaw}>
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
          ) : null}

          {step === 6 ? (
            <Card>
              <CardHeader>
                <CardTitle>PocketBase</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted">
                  PocketBase stores tasks/agents/documents. It is normally started locally by <span className="font-mono">./scripts/run.sh</span>.
                </div>
                <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                    Advanced PocketBase settings (most people can ignore this)
                  </summary>
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
                      Admin UI: <span className="font-mono">{form.pbUrl}/_/</span>
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          ) : null}

          {step === 7 ? (
            <Card>
              <CardHeader>
                <CardTitle>Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="font-semibold text-[var(--foreground)]">Summary</div>
                  <div className="mt-2 font-mono text-xs whitespace-pre-wrap text-[var(--foreground)]">
                    {[
                      `Mission Control`,
                      `  user: ${form.mcAdminUser}`,
                      `  password: ${isReconfigure && keepExistingPassword ? '(unchanged)' : '(updated)'}`,
                      ``,
                      `Lead agent`,
                      `  id: ${form.leadAgentId}`,
                      `  name: ${form.leadAgentName}`,
                      ``,
                      `PocketBase`,
                      `  url: ${form.pbUrl}`,
                      ``,
                      `OpenClaw`,
                      `  connect: ${form.connectOpenClaw ? 'yes' : 'no'}`,
                      `  gateway: ${form.openclawGatewayUrl}`,
                    ].join('\n')}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
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
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Applying…' : isReconfigure ? 'Save + Restart' : 'Save + Bootstrap'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep((s) => Math.min(stepDefs.length - 1, s + 1))}
              disabled={step === stepDefs.length - 1 || saving}
            >
              Next
            </Button>
            <div className="ml-auto text-xs text-muted">Progress: {progressPct}%</div>
          </div>

          {result && 'ok' in result && result.ok ? (
            <Card>
              <CardHeader>
                <CardTitle>{isReconfigure ? 'Settings Updated' : 'Setup Applied'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-sm">
                  Wrote <span className="font-mono">{result.envPath}</span>.
                </div>

                {result.vaultMasterKeyB64 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="font-semibold">Vault master key (save this now)</div>
                    <div className="mt-2 font-mono break-all">{result.vaultMasterKeyB64}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CopyButton value={String(result.vaultMasterKeyB64)} label="Copy key" />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={savedVaultKey} onChange={(e) => setSavedVaultKey(e.target.checked)} />
                        I saved this in a secure place
                      </label>
                    </div>
                    {!savedVaultKey ? (
                      <div className="mt-2 text-[11px] text-amber-900/80">
                        If you lose this key, you cannot decrypt existing Vault secrets.
                      </div>
                    ) : null}
                  </div>
                ) : null}

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
                      {(result.next || []).map((stepLine) => (
                        <li key={stepLine}>{stepLine}</li>
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
                    {!keepExistingPassword ? <CopyButton value={form.mcAdminPassword} label="Copy pass" /> : null}
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
