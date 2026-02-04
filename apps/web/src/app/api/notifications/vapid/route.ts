import { NextResponse } from 'next/server';

export async function GET() {
  const globalEnabled = String(process.env.WEB_PUSH_ENABLED || '').trim().toLowerCase();
  const enabledFlag = ['1', 'true', 'yes', 'y', 'on'].includes(globalEnabled);
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const enabled = Boolean(enabledFlag && publicKey && privateKey);
  return NextResponse.json({ enabled, publicKey: enabled ? publicKey : '' });
}
