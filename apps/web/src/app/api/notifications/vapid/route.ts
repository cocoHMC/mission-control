import { NextResponse } from 'next/server';

export async function GET() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const enabled = Boolean(publicKey && privateKey);
  return NextResponse.json({ enabled, publicKey: enabled ? publicKey : '' });
}
