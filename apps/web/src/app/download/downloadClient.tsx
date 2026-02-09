'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';

type ReleaseAsset = { name?: string; browser_download_url?: string; size?: number; content_type?: string };
type GhRelease = { tag_name?: string; name?: string; published_at?: string; html_url?: string; assets?: ReleaseAsset[] };

function safeString(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

function formatBytes(bytes: number | undefined | null) {
  const n = typeof bytes === 'number' ? bytes : 0;
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v > 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function detectPlatform() {
  const ua = safeString(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const platform = safeString(typeof navigator !== 'undefined' ? (navigator as any).platform : '');
  const isMac = /Macintosh|Mac OS X/i.test(ua) || /Mac/i.test(platform);
  const isWin = /Windows/i.test(ua) || /Win/i.test(platform);
  const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);

  // Best-effort arch.
  const isArm =
    /arm|aarch64/i.test(ua) ||
    /AppleWebKit/i.test(ua) && /Mac/i.test(ua) && /Apple Silicon/i.test(ua);
  const isX64 = /x86_64|Win64|x64|amd64/i.test(ua);

  return { isMac, isWin, isLinux, isArm, isX64, ua };
}

function pick(assets: ReleaseAsset[], pred: (name: string) => boolean) {
  return assets.find((a) => {
    const name = safeString(a.name);
    if (!name) return false;
    return pred(name);
  }) || null;
}

export function DownloadClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rel, setRel] = React.useState<GhRelease | null>(null);

  const platform = React.useMemo(() => detectPlatform(), []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Public endpoint; if the repo is private, this will fail and we show fallback instructions.
        const res = await fetch('https://api.github.com/repos/cocoHMC/mission-control/releases/latest', {
          method: 'GET',
          headers: { accept: 'application/vnd.github+json' },
        });
        const json = (await res.json().catch(() => null)) as GhRelease | null;
        if (!res.ok) throw new Error(safeString((json as any)?.message) || `GitHub API failed (${res.status}).`);
        if (!cancelled) setRel(json);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assets = Array.isArray(rel?.assets) ? rel!.assets! : [];
  const tag = safeString(rel?.tag_name) || 'latest';
  const releaseUrl = safeString(rel?.html_url) || 'https://github.com/cocoHMC/mission-control/releases/latest';

  const macArmDmg = pick(assets, (n) => n.includes('-macos-arm64.dmg'));
  const macX64Dmg = pick(assets, (n) => n.includes('-macos-x64.dmg'));
  const winSetup = pick(assets, (n) => n.includes('-windows-x64-setup.exe'));
  const linuxAppImage = pick(assets, (n) => n.includes('-linux-x86_64.AppImage'));
  const linuxDeb = pick(assets, (n) => n.includes('-linux-amd64.deb'));

  const recommended = (() => {
    if (platform.isMac) return platform.isArm ? macArmDmg : macX64Dmg;
    if (platform.isWin) return winSetup;
    if (platform.isLinux) return linuxAppImage;
    return null;
  })();

  function AssetButton({ label, asset, recommended }: { label: string; asset: ReleaseAsset | null; recommended?: boolean }) {
    const url = safeString(asset?.browser_download_url);
    const name = safeString(asset?.name);
    const size = formatBytes(asset?.size);
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[var(--foreground)]">{label}</div>
          {recommended ? <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">recommended</Badge> : null}
        </div>
        <div className="mt-2 text-xs text-muted">
          {name ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{name}</span>
              <CopyButton value={name} label="Copy filename" />
              {size ? <span>{size}</span> : null}
            </div>
          ) : (
            <span>Not found in release assets.</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            className={cn(buttonVariants({ size: 'sm', variant: 'default' }), !url ? 'pointer-events-none opacity-50' : '')}
            href={url || releaseUrl}
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
          <a
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
          >
            View release
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Latest Release</span>
            <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{tag}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <div>
            If you are unsure, download the <span className="font-semibold text-[var(--foreground)]">recommended</span> installer below.
          </div>
          <div className="text-xs text-muted">
            GitHub release: <a className="underline underline-offset-2" href={releaseUrl} target="_blank" rel="noreferrer">{releaseUrl}</a>
          </div>
          {loading ? <div className="text-xs text-muted">Loading release assets…</div> : null}
          {error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Could not load asset list from GitHub API. Use the release link above and pick the file names shown below.
              <div className="mt-2 text-[11px] text-amber-900/80">{error}</div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
            Ignore <span className="font-mono">latest*.yml</span>, <span className="font-mono">*.blockmap</span>, and <span className="font-mono">*.zip</span> unless you know you need them.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AssetButton label="macOS Apple Silicon (M1/M2/M3)" asset={macArmDmg} recommended={recommended === macArmDmg} />
        <AssetButton label="macOS Intel" asset={macX64Dmg} recommended={recommended === macX64Dmg} />
        <AssetButton label="Windows 10/11 (x64)" asset={winSetup} recommended={recommended === winSetup} />
        <AssetButton label="Linux (x86_64) AppImage" asset={linuxAppImage} recommended={recommended === linuxAppImage} />
        <div className="lg:col-span-2">
          <AssetButton label="Linux (Debian/Ubuntu x86_64) .deb" asset={linuxDeb} />
        </div>
      </div>

      {recommended ? (
        <Card>
          <CardHeader>
            <CardTitle>Detected Device</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted">
            <div>UA: <span className="font-mono">{platform.ua || 'unknown'}</span></div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
