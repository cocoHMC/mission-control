import { NextRequest, NextResponse } from 'next/server';
import { decideManualWorkflowApproval, executeManualWorkflowRun } from '@/lib/workflowEngine';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDecision(value: unknown) {
  const v = safeString(value).toLowerCase();
  if (v === 'approved' || v === 'rejected') return v;
  return '';
}

function errorStatus(err: unknown) {
  const status = (err as any)?.status;
  if (typeof status === 'number' && Number.isFinite(status) && status >= 100 && status <= 599) return Math.floor(status);
  return 500;
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const decision = parseDecision(body?.decision);
    if (!decision) {
      return NextResponse.json({ ok: false, error: 'decision must be approved or rejected' }, { status: 400 });
    }

    const note = safeString(body?.note);
    const actorAgentId = safeString(body?.actorAgentId);
    const shouldResume = decision === 'approved' ? body?.resume !== false : false;

    const out = await decideManualWorkflowApproval(id, decision as 'approved' | 'rejected', note, actorAgentId);

    if (shouldResume) {
      const resumed = await executeManualWorkflowRun(id);
      const status = resumed.waitingApproval ? 202 : resumed.ok ? 200 : 502;
      return NextResponse.json(
        {
          ok: resumed.ok,
          waitingApproval: Boolean(resumed.waitingApproval),
          approval: out.approval,
          run: resumed.run ?? out.run,
          error: resumed.error || '',
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      waitingApproval: false,
      approval: out.approval,
      run: out.run,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(err, 'Failed to process approval decision.') },
      { status: errorStatus(err) }
    );
  }
}
