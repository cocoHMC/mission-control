import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function createActivity(type: string, summary: string, taskId?: string, actorAgentId?: string) {
  const now = new Date().toISOString();
  try {
    await pbFetch('/api/collections/activities/records', {
      method: 'POST',
      body: {
        type,
        summary,
        taskId: taskId ?? '',
        actorAgentId: actorAgentId ?? '',
        createdAt: now,
      },
    });
  } catch {
    // Best-effort only: workflow runs should not fail because activity logging failed.
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/workflow_runs/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const workflowId = safeString(body.workflowId);
  const taskId = safeString(body.taskId);
  const sessionKey = safeString(body.sessionKey);
  const vars = body.vars ?? null;

  if (!workflowId) return NextResponse.json({ ok: false, error: 'workflowId required' }, { status: 400 });

  const workflow = await pbFetch<any>(`/api/collections/workflows/records/${workflowId}`);
  const kind = safeString(workflow?.kind) || 'manual';
  const pipeline = safeString(workflow?.pipeline);

  const now = new Date();
  const basePayload: Record<string, unknown> = {
    workflowId,
    taskId: taskId || '',
    sessionKey: sessionKey || '',
    vars,
    status: kind === 'lobster' ? 'running' : 'queued',
    startedAt: kind === 'lobster' ? now.toISOString() : '',
    finishedAt: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const created = await pbFetch<any>('/api/collections/workflow_runs/records', { method: 'POST', body: basePayload });
  const commandId = `mcwfr-${String(created?.id || '').trim()}`;
  if (commandId !== 'mcwfr-') {
    try {
      await pbFetch<any>(`/api/collections/workflow_runs/records/${created.id}`, {
        method: 'PATCH',
        body: { commandId, updatedAt: new Date().toISOString() },
      });
    } catch {
      // Best-effort only: runs still work without persisting commandId.
    }
  }
  await createActivity(
    'workflow_run_started',
    `Workflow run started (${safeString(workflow?.name) || workflowId}).`,
    taskId || '',
    ''
  );

  if (kind !== 'lobster') {
    return NextResponse.json({ ok: true, run: created });
  }

  if (!pipeline) {
    const failed = await pbFetch<any>(`/api/collections/workflow_runs/records/${created.id}`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        log: 'Missing pipeline on workflow.',
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    await createActivity('workflow_run_failed', `Workflow run failed (missing pipeline).`, taskId || '', '');
    return NextResponse.json({ ok: false, error: 'Workflow has no pipeline.', run: failed }, { status: 400 });
  }

  try {
    // Lobster runs can be slow; allow up to 10 minutes.
    const timeoutMs = 10 * 60_000;
    const args: Record<string, unknown> = { pipeline };
    if (vars) args.vars = vars;
    if (taskId) args.taskId = taskId;
    if (created.id) args.runId = created.id;

    const out = await openclawToolsInvoke<any>(
      'lobster',
      args,
      sessionKey ? { sessionKey, timeoutMs, commandId } : { timeoutMs, commandId }
    );
    const result = out.parsedText ?? out.raw;
    const updated = await pbFetch<any>(`/api/collections/workflow_runs/records/${created.id}`, {
      method: 'PATCH',
      body: {
        status: 'succeeded',
        result,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    await createActivity('workflow_run_succeeded', `Workflow run succeeded (${safeString(workflow?.name) || workflowId}).`, taskId || '', '');
    return NextResponse.json({ ok: true, run: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const updated = await pbFetch<any>(`/api/collections/workflow_runs/records/${created.id}`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        log: msg || 'Lobster run failed.',
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    await createActivity('workflow_run_failed', `Workflow run failed (${safeString(workflow?.name) || workflowId}): ${msg || 'error'}`, taskId || '', '');
    return NextResponse.json({ ok: false, error: msg || 'Lobster run failed.', run: updated }, { status: 502 });
  }
}
