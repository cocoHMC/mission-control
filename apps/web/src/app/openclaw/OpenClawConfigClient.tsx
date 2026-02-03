"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ConfigResponse = {
  path: string;
  updatedAt: string;
  config: string;
};

type StatusResponse = {
  ok: boolean;
  output?: string;
  error?: string;
};

export function OpenClawConfigClient() {
  const [config, setConfig] = React.useState("");
  const [path, setPath] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState("");
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [diff, setDiff] = React.useState("");
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [applyResult, setApplyResult] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadConfig = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/openclaw/config");
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as ConfigResponse;
      setConfig(json.config || "");
      setPath(json.path);
      setUpdatedAt(json.updatedAt);
      setDiff("");
      setWarnings([]);
      setApplyResult(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/openclaw/status");
      const json = (await res.json()) as StatusResponse;
      setStatus(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ ok: false, error: message || "Failed to load status" });
    }
  }, []);

  React.useEffect(() => {
    void loadConfig();
    void loadStatus();
  }, [loadConfig, loadStatus]);

  async function validateConfig() {
    setValidating(true);
    setError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/openclaw/config/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Validation failed");
      setDiff(json.diff || "");
      setWarnings(json.warnings || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function applyConfig() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/openclaw/config/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Apply failed");
      setApplyResult(
        `Applied to ${json.appliedPath}. Backup: ${json.backupPath}. Restart required: ${json.restartHint}`
      );
      setWarnings(json.warnings || []);
      await loadStatus();
      await loadConfig();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gateway Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">{status?.ok ? "ok" : "error"}</Badge>
            <Button size="sm" variant="secondary" onClick={loadStatus}>
              Refresh
            </Button>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
            {status?.ok ? status.output : status?.error || "No status available"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OpenClaw Config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-muted">
            Path: <span className="text-[var(--foreground)]">{path || "unknown"}</span>
          </div>
          <div className="text-xs text-muted">
            Last modified: <span className="text-[var(--foreground)]">{updatedAt || "unknown"}</span>
          </div>
          <Textarea
            value={config}
            onChange={(event) => setConfig(event.target.value)}
            className="min-h-[320px] font-mono text-xs"
            placeholder="OpenClaw config JSON"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={loadConfig} disabled={loading}>
              Reload
            </Button>
            <Button size="sm" onClick={validateConfig} disabled={validating}>
              {validating ? "Validating..." : "Validate"}
            </Button>
            <Button size="sm" variant="secondary" onClick={applyConfig} disabled={applying}>
              {applying ? "Applying..." : "Apply"}
            </Button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
              <div className="font-semibold text-[var(--foreground)]">Warnings</div>
              <ul className="mt-2 list-disc pl-5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          {diff && (
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Unified diff</div>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                {diff}
              </pre>
            </div>
          )}
          {applyResult && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
              {applyResult}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
