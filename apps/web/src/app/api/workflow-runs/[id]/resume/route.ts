import { NextRequest, NextResponse } from 'next/server';
import { executeManualWorkflowRun } from '@/lib/workflowEngine';

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

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const out = await executeManualWorkflowRun(id);
    const status = out.waitingApproval ? 202 : out.ok ? 200 : 502;
    return NextResponse.json(
      {
        ok: out.ok,
        waitingApproval: Boolean(out.waitingApproval),
        run: out.run,
        error: out.error || '',
      },
      { status }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(err, 'Failed to resume workflow run.') },
      { status: errorStatus(err) }
    );
  }
}
