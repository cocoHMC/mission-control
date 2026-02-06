import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

type AddBody = {
  channel?: string;
  account?: string;
  name?: string;
  token?: string;
  botToken?: string;
  appToken?: string;
  signalNumber?: string;
  cliPath?: string;
  dbPath?: string;
  service?: string;
  region?: string;
  authDir?: string;
  webhookPath?: string;
  webhookUrl?: string;
  audienceType?: string;
  audience?: string;
  homeserver?: string;
  userId?: string;
  accessToken?: string;
  password?: string;
  deviceName?: string;
};

function pushArg(args: string[], flag: string, value: unknown) {
  const v = String(value ?? '').trim();
  if (!v) return;
  args.push(flag, v);
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = (await req.json().catch(() => null)) as AddBody | null;
  const channel = String(body?.channel || '').trim();
  if (!channel) return NextResponse.json({ ok: false, error: 'channel required' }, { status: 400 });

  const args: string[] = ['channels', 'add', '--channel', channel];
  pushArg(args, '--account', body?.account);
  pushArg(args, '--name', body?.name);

  // Common auth knobs. Do not echo these back to the client.
  pushArg(args, '--token', body?.token);
  pushArg(args, '--bot-token', body?.botToken);
  pushArg(args, '--app-token', body?.appToken);
  pushArg(args, '--signal-number', body?.signalNumber);
  pushArg(args, '--cli-path', body?.cliPath);
  pushArg(args, '--db-path', body?.dbPath);
  pushArg(args, '--service', body?.service);
  pushArg(args, '--region', body?.region);
  pushArg(args, '--auth-dir', body?.authDir);
  pushArg(args, '--webhook-path', body?.webhookPath);
  pushArg(args, '--webhook-url', body?.webhookUrl);
  pushArg(args, '--audience-type', body?.audienceType);
  pushArg(args, '--audience', body?.audience);
  pushArg(args, '--homeserver', body?.homeserver);
  pushArg(args, '--user-id', body?.userId);
  pushArg(args, '--access-token', body?.accessToken);
  pushArg(args, '--password', body?.password);
  pushArg(args, '--device-name', body?.deviceName);

  const res = await runOpenClaw(args, { timeoutMs: 25_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to add channel.' }, { status: 502 });
  }

  const out = redactText(String(res.stdout || '').trim());
  return NextResponse.json({ ok: true, output: out.slice(0, 8000) });
}

