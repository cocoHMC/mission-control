import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { requireAdminAuth } from '@/lib/adminAuth';
import { patchEnvFile } from '@/lib/envFile';

export const runtime = 'nodejs';

function isTruthy(value: string | undefined) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const existingPublic = String(process.env.WEB_PUSH_PUBLIC_KEY || '').trim();
  const existingPrivate = String(process.env.WEB_PUSH_PRIVATE_KEY || '').trim();
  const existingEnabled = isTruthy(process.env.WEB_PUSH_ENABLED);

  // If already configured, just acknowledge.
  if (existingEnabled && existingPublic && existingPrivate) {
    return NextResponse.json({ ok: true, alreadyConfigured: true });
  }

  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  const subject = String(process.env.WEB_PUSH_SUBJECT || '').trim() || 'mailto:admin@local';

  const updates = new Map<string, string>();
  updates.set('WEB_PUSH_ENABLED', 'true');
  updates.set('WEB_PUSH_PUBLIC_KEY', publicKey);
  updates.set('WEB_PUSH_PRIVATE_KEY', privateKey);
  updates.set('WEB_PUSH_SUBJECT', subject);

  const envPath = await patchEnvFile(updates);

  const restartMode = process.env.MC_AUTO_RESTART === '1' ? 'auto' : 'manual';
  const restartExitCode = Number.parseInt(process.env.MC_RESTART_EXIT_CODE || '42', 10) || 42;
  if (restartMode === 'auto') {
    const t = setTimeout(() => process.exit(restartExitCode), 750);
    (t as any).unref?.();
  }

  return NextResponse.json({
    ok: true,
    alreadyConfigured: false,
    envPath,
    restartRequired: true,
    restartMode,
  });
}

