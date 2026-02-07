import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getPBRealtimeBridge } from '@/lib/server/pbRealtimeBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const auth = requireAdminAuth(req);
  if (auth) return auth;

  const bridge = getPBRealtimeBridge();
  try {
    await bridge.ensureStarted();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Realtime unavailable', detail }, { status: 503 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let keepAliveId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // ignore write failures during disconnect
        }
      };

      write(encodeEvent('ready', { ok: true }));

      unsubscribe = bridge.subscribe((evt) => {
        write(encodeEvent(evt.event, evt.data));
      });

      // Keep the connection alive through reverse proxies and Tailscale serve.
      keepAliveId = setInterval(() => write(': ping\n\n'), 25_000);

      const onAbort = () => {
        if (closed) return;
        closed = true;
        if (keepAliveId) clearInterval(keepAliveId);
        keepAliveId = null;
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      if (req.signal.aborted) onAbort();
      else req.signal.addEventListener('abort', onAbort, { once: true });
    },
    cancel() {
      closed = true;
      if (keepAliveId) clearInterval(keepAliveId);
      keepAliveId = null;
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

