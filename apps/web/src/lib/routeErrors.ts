import { NextResponse } from 'next/server';

function statusFromError(err: any): number | null {
  const s = err?.status;
  if (typeof s === 'number' && Number.isFinite(s) && s >= 100 && s <= 599) return Math.floor(s);

  const msg = typeof err?.message === 'string' ? err.message : '';
  const m = /(?:failed:\s*|->\s*)(\d{3})\b/.exec(msg);
  if (m) {
    const n = Number.parseInt(m[1] || '', 10);
    if (Number.isFinite(n) && n >= 100 && n <= 599) return n;
  }
  return null;
}

function messageFromError(err: any, fallback: string): string {
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  return msg || fallback;
}

export function adminJsonError(err: unknown, fallbackMessage: string = 'Request failed') {
  const status = statusFromError(err as any) ?? 500;
  const message = messageFromError(err as any, fallbackMessage);
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function publicJsonError(err: unknown, fallbackMessage: string = 'Request failed') {
  const status = statusFromError(err as any) ?? 500;
  // Never leak backend details on public/agent-callable endpoints.
  void err;
  const safeMessage = fallbackMessage;
  const safeStatus = status >= 500 ? 500 : status;
  return NextResponse.json({ ok: false, error: safeMessage }, { status: safeStatus });
}

