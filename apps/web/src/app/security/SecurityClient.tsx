'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { NodeSync } from '@/app/nodes/NodeSync';
import type { NodeRecord } from '@/lib/types';

type VaultwardenStatus = {
  ok: boolean;
  opsDir: string;
  files: { env: boolean; compose: boolean; caddy: boolean; caddyDocker: boolean };
  config: {
    domain: string;
    bindIp: string;
    orgName: string;
    signupsAllowed: boolean;
    hasCloudflareToken: boolean;
    hasAdminToken: boolean;
    adminTokenHashed: boolean;
  };
  docker: { installed: boolean; compose: 'docker' | 'docker-compose' | null; error: string | null };
  stack: { running: boolean; services: Array<{ name: string; running: boolean }>; error: string | null };
  health: { ok: boolean; status?: number; error?: string; url?: string };
  actionsEnabled: boolean;
  ts: string;
};

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

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizeDomain(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const withScheme = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    return url.hostname;
  } catch {
    return raw.replace(/^https?:\/\//i, '');
  }
}

function generateToken(bytes = 20) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...Array.from(arr)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function SecurityClient({ nodes }: { nodes: NodeRecord[] }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<VaultwardenStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [runningAction, setRunningAction] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tailscale, setTailscale] = React.useState<TailscaleStatus | null>(null);

  const [form, setForm] = React.useState({
    domain: '',
    bindIp: '',
    cloudflareToken: '',
    adminToken: '',
    signupsAllowed: false,
    orgName: 'OpenClaw',
  });

  const tailscalePrimaryIp = React.useMemo(() => {
    const ips = tailscale?.self?.tailscaleIps || [];
    return ips.find((ip) => ip.includes('.')) || ips[0] || '';
  }, [tailscale]);

  const domainHost = React.useMemo(() => normalizeDomain(form.domain || status?.config.domain || ''), [form.domain, status?.config.domain]);

  const nodePlan = React.useMemo(() => {
    const host = domainHost || 'vault.local';
    return (nodes || []).map((node) => {
      const label = node.displayName || node.nodeId || node.id;
      const slug = slugify(label || node.id);
      return {
        id: node.nodeId || node.id,
        label,
        collection: `node-${slug}`,
        userEmail: `openclaw-node-${slug}@${host}`,
      };
    });
  }, [nodes, domainHost]);

  async function refreshStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/security/vaultwarden/status', { cache: 'no-store' });
      const json = (await res.json()) as VaultwardenStatus;
      if (!res.ok) throw new Error((json as any)?.error || 'Failed to load status');
      setStatus(json);
      setForm((prev) => ({
        ...prev,
        domain: prev.domain || json.config.domain || '',
        bindIp: prev.bindIp || json.config.bindIp || '',
        signupsAllowed: prev.signupsAllowed || json.config.signupsAllowed || false,
        orgName: prev.orgName || json.config.orgName || 'OpenClaw',
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }

  async function refreshTailscale() {
    try {
      const res = await fetch('/api/setup/tailscale-status', { cache: 'no-store' });
      const json = (await res.json()) as TailscaleStatus;
      setTailscale(json);
      if (!form.bindIp && json?.self?.tailscaleIps?.length) {
        setForm((prev) => ({ ...prev, bindIp: prev.bindIp || json.self?.tailscaleIps?.[0] || '' }));
      }
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
    }
  }

  React.useEffect(() => {
    void refreshStatus();
    void refreshTailscale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyConfig() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/security/vaultwarden/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: form.domain,
          bindIp: form.bindIp,
          cloudflareToken: form.cloudflareToken,
          adminToken: form.adminToken,
          signupsAllowed: form.signupsAllowed,
          orgName: form.orgName,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to write stack files');
      setMessage('Vaultwarden stack files generated.');
      await refreshStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Failed to write stack files');
    } finally {
      setSaving(false);
    }
  }

  async function runStack(action: 'up' | 'down' | 'restart' | 'pull') {
    setRunningAction(action);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/security/vaultwarden/stack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Failed to run ${action}`);
      setMessage(`Vaultwarden stack ${action} complete.`);
      await refreshStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || `Failed to run ${action}`);
    } finally {
      setRunningAction(null);
    }
  }

  const stackReady = Boolean(status?.files.compose && status?.files.env && status?.files.caddy);

  const provisioningScript = React.useMemo(() => {
    if (!nodePlan.length) return '';
    const names = nodePlan.map((node) => `"${node.collection}"`).join(' ');
    return [
      '# Requires bw CLI + jq on the gateway host',
      'bw list organizations',
      'ORG_ID="<org-id>"',
      `for name in ${names}; do`,
      '  bw get template org-collection | jq --arg name "$name" --arg org "$ORG_ID" ".name=$name | .organizationId=$org" | bw encode | bw create org-collection',
      'done',
    ].join('\n');
  }, [nodePlan]);

  const nodeBootstrapSnippet = React.useMemo(() => {
    if (!domainHost) return '';
    return [
      `bw config server https://${domainHost}`,
      'bw login --apikey',
      'export BW_PASSWORD="<node-master-password>"',
      'bw unlock --passwordenv BW_PASSWORD',
      'bw sync',
      'bw get item "<collection/item>"',
    ].join('\n');
  }, [domainHost]);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Vaultwarden Status</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={refreshStatus} disabled={loading}>
                  {loading ? 'Checking…' : 'Refresh'}
                </Button>
                {status ? (
                  <Badge className={status.stack.running ? 'border-none bg-emerald-600 text-white' : 'border-none bg-amber-500 text-black'}>
                    {status.stack.running ? 'running' : 'stopped'}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em]">Docker</div>
                <div className="mt-1 text-sm text-[var(--foreground)]">
                  {status?.docker.installed ? `ok (${status?.docker.compose || 'compose'})` : 'missing'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em]">Stack files</div>
                <div className="mt-1 text-sm text-[var(--foreground)]">
                  {stackReady ? 'ready' : 'missing'}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em]">Domain</div>
                <div className="mt-1 text-sm text-[var(--foreground)]">{status?.config.domain || 'not set'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em]">Bind IP</div>
                <div className="mt-1 text-sm text-[var(--foreground)]">{status?.config.bindIp || 'not set'}</div>
              </div>
            </div>

            {status?.stack.services?.length ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em]">Services</div>
                <div className="flex flex-wrap gap-2">
                  {status.stack.services.map((service) => (
                    <Badge
                      key={service.name}
                      className={service.running ? 'border-none bg-emerald-600 text-white' : 'border-none bg-amber-500 text-black'}
                    >
                      {service.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {status?.health?.url ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                <div className="font-semibold text-[var(--foreground)]">Health check</div>
                <div className="mt-1">
                  {status.health.ok ? `OK (${status.health.status})` : status.health.error || 'Unavailable'}
                </div>
                <div className="mt-2 font-mono text-[11px] text-[var(--foreground)]">{status.health.url}</div>
              </div>
            ) : null}

            {status?.stack?.error ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                {status.stack.error}
              </pre>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vaultwarden Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={form.domain}
                onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
                placeholder="vault.example.com"
              />
              <Input
                value={form.bindIp}
                onChange={(e) => setForm((prev) => ({ ...prev, bindIp: e.target.value }))}
                placeholder={tailscalePrimaryIp ? `Tailnet IP (e.g. ${tailscalePrimaryIp})` : 'Tailnet IP (100.x)'}
              />
              <Input
                value={form.cloudflareToken}
                onChange={(e) => setForm((prev) => ({ ...prev, cloudflareToken: e.target.value }))}
                placeholder={status?.config.hasCloudflareToken ? 'Cloudflare API token (set)' : 'Cloudflare API token'}
                type="password"
              />
              <Input
                value={form.adminToken}
                onChange={(e) => setForm((prev) => ({ ...prev, adminToken: e.target.value }))}
                placeholder={status?.config.hasAdminToken ? 'Admin token (set)' : 'Admin token (optional)'}
                type="password"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={form.orgName}
                onChange={(e) => setForm((prev) => ({ ...prev, orgName: e.target.value }))}
                placeholder="Organization name"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.signupsAllowed}
                  onChange={(e) => setForm((prev) => ({ ...prev, signupsAllowed: e.target.checked }))}
                />
                Allow new signups (not recommended after initial setup)
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={applyConfig} disabled={saving}>
                {saving ? 'Saving…' : 'Generate stack'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, adminToken: generateToken(20) }))}
              >
                Generate admin token
              </Button>
            </div>

            <div className="text-xs">
              Caddy will use Cloudflare DNS validation. Keep your public DNS A/AAAA records empty and point tailnet DNS
              to the Vaultwarden host only.
            </div>
            {status?.config.hasAdminToken && !status?.config.adminTokenHashed ? (
              <div className="text-xs text-amber-600">Admin token is not hashed. Consider hashing via `vaultwarden hash`.</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stack Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => runStack('up')} disabled={!status?.actionsEnabled || runningAction !== null || !stackReady}>
                {runningAction === 'up' ? 'Starting…' : 'Start'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runStack('restart')} disabled={!status?.actionsEnabled || runningAction !== null || !stackReady}>
                {runningAction === 'restart' ? 'Restarting…' : 'Restart'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runStack('pull')} disabled={!status?.actionsEnabled || runningAction !== null || !stackReady}>
                {runningAction === 'pull' ? 'Pulling…' : 'Pull images'}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => runStack('down')} disabled={!status?.actionsEnabled || runningAction !== null || !stackReady}>
                {runningAction === 'down' ? 'Stopping…' : 'Stop'}
              </Button>
              {!status?.actionsEnabled ? (
                <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">disabled</Badge>
              ) : null}
            </div>
            <div className="text-xs">
              Enable <span className="font-mono">MC_SECURITY_ACTIONS_ENABLED=true</span> to allow Mission Control to run docker compose.
            </div>
            {status?.docker.error ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                {status.docker.error}
              </pre>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Organization + Collections</CardTitle>
              <NodeSync />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div>
              Create the organization in the Vaultwarden web vault, then add a collection per node. Recommended org name:
              <span className="ml-1 font-semibold text-[var(--foreground)]">{form.orgName || 'OpenClaw'}</span>.
            </div>
            {nodePlan.length ? (
              <div className="space-y-2">
                {nodePlan.map((node) => (
                  <div key={node.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="text-sm font-semibold text-[var(--foreground)]">{node.label}</div>
                    <div className="mt-1 text-xs">Collection: <span className="font-mono text-[var(--foreground)]">{node.collection}</span></div>
                    <div className="mt-1 text-xs">User: <span className="font-mono text-[var(--foreground)]">{node.userEmail}</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted">No nodes synced yet.</div>
            )}

            {provisioningScript ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em]">CLI helper (collections)</div>
                <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
{provisioningScript}
                </pre>
                <CopyButton value={provisioningScript} label="Copy script" />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Node Bootstrap Snippet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div>Run this on each node after creating its user + collection.</div>
            {nodeBootstrapSnippet ? (
              <>
                <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
{nodeBootstrapSnippet}
                </pre>
                <CopyButton value={nodeBootstrapSnippet} label="Copy snippet" />
              </>
            ) : (
              <div className="text-xs">Set a domain above to generate the snippet.</div>
            )}
          </CardContent>
        </Card>

        {message ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--foreground)]">{message}</div>
        ) : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tailnet Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={refreshTailscale}>
                Refresh
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
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.2em]">Tailnet IPs</div>
                <div className="font-mono text-xs text-[var(--foreground)]">{tailscale.self.tailscaleIps.join(', ')}</div>
                <CopyButton value={tailscale.self.tailscaleIps.join(', ')} label="Copy IPs" />
              </div>
            ) : null}

            {tailscale?.self?.dnsName ? (
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.2em]">MagicDNS</div>
                <div className="font-mono text-xs text-[var(--foreground)]">{tailscale.self.dnsName}</div>
                <CopyButton value={tailscale.self.dnsName} label="Copy name" />
              </div>
            ) : null}

            {tailscale?.error ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                {tailscale.error}
              </pre>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Safety Checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>Keep Vaultwarden bound to a tailnet IP only. Avoid public A/AAAA records.</div>
            <div>Use read-only collections for node users unless writes are required.</div>
            <div>Rotate node API keys on compromise and revoke collection access immediately.</div>
            <div>Keep docker compose under versioned ops/ with secrets in local env only.</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs">cd ops/vaultwarden &amp;&amp; docker compose up -d</span>
              <CopyButton value="cd ops/vaultwarden && docker compose up -d" />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs">cd ops/vaultwarden &amp;&amp; docker compose logs -f</span>
              <CopyButton value="cd ops/vaultwarden && docker compose logs -f" />
            </div>
            {status?.opsDir ? (
              <div className="text-xs">Stack path: <span className="font-mono">{status.opsDir}</span></div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Node Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>When you add a new OpenClaw node, sync it here and create a matching collection + user.</div>
            <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
              Refresh nodes
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
