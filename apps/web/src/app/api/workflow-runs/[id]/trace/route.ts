import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowRunTrace } from '@/lib/workflowEngine';

export const runtime = 'nodejs';

function errorStatus(err: unknown) {
  const status = (err as any)?.status;
  if (typeof status === 'number' && Number.isFinite(status) && status >= 100 && status <= 599) return Math.floor(status);
  return 500;
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const trace = await getWorkflowRunTrace(id);
    return NextResponse.json(trace);
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(err, 'Failed to load workflow run trace.') },
      { status: errorStatus(err) }
    );
  }
}
