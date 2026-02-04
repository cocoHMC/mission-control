'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseName?: string; releaseNotes?: string }
  | { status: 'not_available'; version?: string }
  | { status: 'downloading'; percent?: number }
  | { status: 'downloaded'; version: string; releaseName?: string; releaseNotes?: string }
  | { status: 'error'; message: string };

type DesktopBridge = {
  getVersion: () => Promise<string>;
  getUpdateState: () => Promise<UpdateState>;
  getUpdateAuth: () => Promise<{ githubTokenConfigured: boolean }>;
  setGithubToken: (token: string) => Promise<{ ok: boolean; configured?: boolean; error?: string }>;
  clearGithubToken: () => Promise<{ ok: boolean; error?: string }>;
  checkForUpdates: () => Promise<{ ok: boolean; error?: string }>;
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
  quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
  onUpdate: (cb: (state: UpdateState) => void) => () => void;
};

function getBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as any).MissionControlDesktop ?? null;
}

export function DesktopUpdates() {
  const bridge = getBridge();
  const [version, setVersion] = React.useState<string | null>(null);
  const [state, setState] = React.useState<UpdateState>({ status: 'idle' });
  const [busy, setBusy] = React.useState(false);
  const [githubTokenConfigured, setGithubTokenConfigured] = React.useState<boolean | null>(null);
  const [githubToken, setGithubToken] = React.useState('');

  React.useEffect(() => {
    if (!bridge) return;
    let unsub: (() => void) | null = null;
    bridge.getVersion().then(setVersion).catch(() => {});
    bridge.getUpdateState().then(setState).catch(() => {});
    bridge.getUpdateAuth().then((v) => setGithubTokenConfigured(v.githubTokenConfigured)).catch(() => {});
    unsub = bridge.onUpdate(setState);
    return () => unsub?.();
  }, [bridge]);

  if (!bridge) {
    return (
      <div className="text-sm text-muted">
        Desktop updates are available in the macOS app build (.dmg). If you&apos;re running in a browser, update by pulling
        the latest code and restarting.
      </div>
    );
  }

  async function check() {
    const b = bridge;
    if (!b) return;
    setBusy(true);
    try {
      await b.checkForUpdates();
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const b = bridge;
    if (!b) return;
    setBusy(true);
    try {
      await b.downloadUpdate();
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    const b = bridge;
    if (!b) return;
    setBusy(true);
    try {
      await b.quitAndInstall();
    } finally {
      setBusy(false);
    }
  }

  const subtitle = (() => {
    if (state.status === 'idle') return 'Check for updates from GitHub Releases.';
    if (state.status === 'checking') return 'Checking…';
    if (state.status === 'available') return `Update available: ${state.version}`;
    if (state.status === 'not_available') return 'You are up to date.';
    if (state.status === 'downloading') return state.percent ? `Downloading… ${state.percent.toFixed(0)}%` : 'Downloading…';
    if (state.status === 'downloaded') return `Ready to install: ${state.version}`;
    if (state.status === 'error') return `Update error: ${state.message}`;
    return '';
  })();

  return (
    <div className="space-y-3 text-sm text-muted">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--foreground)]">Desktop Updates</div>
          <div className="text-xs text-muted">{subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={check} disabled={busy || state.status === 'checking'}>
            Check
          </Button>
          {state.status === 'available' ? (
            <Button size="sm" onClick={download} disabled={busy}>
              Download
            </Button>
          ) : null}
          {state.status === 'downloaded' ? (
            <Button size="sm" onClick={install} disabled={busy}>
              Install + Restart
            </Button>
          ) : null}
        </div>
      </div>
      {version ? <div className="text-xs">Current version: {version}</div> : null}

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">
          Private GitHub Updates (Advanced)
        </summary>
        <div className="mt-2 space-y-2 text-xs text-muted">
          <div>
            If your repo is private, the desktop app may need a GitHub token to download release assets.
          </div>
          <div className="text-[11px]">
            Status:{' '}
            <span className="font-semibold text-[var(--foreground)]">
              {githubTokenConfigured === null ? 'unknown' : githubTokenConfigured ? 'token set' : 'no token'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 flex-1 min-w-[220px] rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 font-mono text-[11px] text-[var(--foreground)]"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_… (read-only token)"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !githubToken.trim()}
              onClick={async () => {
                const b = bridge;
                if (!b) return;
                setBusy(true);
                try {
                  const res = await b.setGithubToken(githubToken.trim());
                  setGithubTokenConfigured(Boolean(res.configured));
                  setGithubToken('');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save token
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || !githubTokenConfigured}
              onClick={async () => {
                const b = bridge;
                if (!b) return;
                setBusy(true);
                try {
                  await b.clearGithubToken();
                  setGithubTokenConfigured(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </details>

      {state.status === 'available' || state.status === 'downloaded' ? (
        state.releaseNotes ? (
          <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">What&apos;s new</summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{state.releaseNotes}</pre>
          </details>
        ) : null
      ) : null}
    </div>
  );
}
