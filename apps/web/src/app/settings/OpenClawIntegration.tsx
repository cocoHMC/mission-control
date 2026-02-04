'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';

type OpenClawSettings = {
  gatewayUrl: string;
  token: string;
  enabled: boolean;
};

type TestResponse = { ok: boolean; sessionCount?: number | null; error?: string };
type SaveResponse = { ok?: boolean; restartMode?: 'auto' | 'manual'; error?: string };

export function OpenClawIntegration() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [form, setForm] = React.useState<OpenClawSettings>({
    gatewayUrl: 'http://127.0.0.1:18789',
    token: '',
    enabled: false,
  });
  const [test, setTest] = React.useState<TestResponse | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/openclaw', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as OpenClawSettings;
        if (cancelled) return;
        setForm({
          gatewayUrl: json.gatewayUrl || 'http://127.0.0.1:18789',
          token: json.token || '',
          enabled: Boolean(json.enabled),
        });
      } catch (err: any) {
        if (cancelled) return;
        setStatus(err?.message || 'Failed to load OpenClaw settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function testConnection() {
    setStatus(null);
    setTest(null);
    setTesting(true);
    try {
      const res = await fetch('/api/openclaw/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gatewayUrl: form.gatewayUrl, token: form.token }),
      });
      const json = (await res.json()) as TestResponse;
      if (!res.ok || !json.ok) throw new Error(json.error || 'Test failed');
      setTest(json);
    } catch (err: any) {
      setTest({ ok: false, error: err?.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    try {
      const res = await fetch('/api/settings/openclaw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gatewayUrl: form.gatewayUrl, token: form.token, enabled: form.enabled }),
      });
      const json = (await res.json()) as SaveResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Save failed');
      setStatus(json.restartMode === 'auto' ? 'Saved. Restarting Mission Control now…' : 'Saved. Restart Mission Control to apply changes.');
    } catch (err: any) {
      setStatus(err?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>OpenClaw Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted">
        <div>
          Connect Mission Control to your OpenClaw gateway for deterministic Tools Invoke delivery (no polling, no LLM wakeups).
        </div>
        <div className="text-xs text-muted">
          Tip: open OpenClaw → <span className="font-semibold text-[var(--foreground)]">Overview</span> to copy your gateway URL and Tools Invoke token.
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Enabled</label>
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={loading}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
              className="h-4 w-4"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Gateway URL</label>
            <div className="flex flex-wrap gap-2">
              <Input
                value={form.gatewayUrl}
                onChange={(e) => setForm((p) => ({ ...p, gatewayUrl: e.target.value }))}
                placeholder="http://127.0.0.1:18789"
                className="h-9 w-full max-w-xl"
                disabled={loading}
              />
              <CopyButton value={form.gatewayUrl} label="Copy URL" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Tools Invoke Token</label>
            <div className="flex flex-wrap gap-2">
              <Input
                value={form.token}
                onChange={(e) => setForm((p) => ({ ...p, token: e.target.value }))}
                placeholder="Paste token from OpenClaw → Overview"
                className="h-9 w-full max-w-xl font-mono"
                type="password"
                disabled={loading || !form.enabled}
              />
              <CopyButton value={form.token} label="Copy token" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={testConnection} disabled={loading || testing || !form.enabled || !form.token.trim()}>
            {testing ? 'Testing…' : 'Test connection'}
          </Button>
          {test ? (
            <Badge className={test.ok ? 'border-none bg-emerald-600 text-white' : 'border-none bg-red-600 text-white'}>
              {test.ok ? `connected${typeof test.sessionCount === 'number' ? ` (sessions: ${test.sessionCount})` : ''}` : 'failed'}
            </Badge>
          ) : null}
          <Button size="sm" onClick={save} disabled={loading || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {status ? <div className="text-xs text-[var(--foreground)]">{status}</div> : null}
        {test?.error ? <div className="text-xs text-red-600">{test.error}</div> : null}
      </CardContent>
    </Card>
  );
}

