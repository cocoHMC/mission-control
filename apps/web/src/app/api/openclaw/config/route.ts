import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { readConfigFile } from '@/app/api/openclaw/_shared';
import { promises as fs } from 'node:fs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const { filePath, content } = await readConfigFile();
  const stats = await fs.stat(filePath);

  return NextResponse.json({
    path: filePath,
    updatedAt: stats.mtime.toISOString(),
    config: content,
  });
}
