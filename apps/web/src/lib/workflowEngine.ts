import { pbFetch } from '@/lib/pbServer';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

type WorkflowTaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

type ManualStep =
  | {
      type: 'wait_for_approval';
      title?: string;
      instructions?: string;
      reviewerAgentId?: string;
      requireDecisionNote?: boolean;
      setTaskStatusOnApprove?: WorkflowTaskStatus;
      setTaskStatusOnReject?: WorkflowTaskStatus;
    }
  | {
      type: 'run_lobster';
      pipeline: string;
      vars?: Record<string, unknown> | null;
      sessionKey?: string;
      timeoutMs?: number;
    }
  | {
      type: 'run_openclaw_tool';
      tool: string;
      args?: Record<string, unknown> | null;
      sessionKey?: string;
      timeoutMs?: number;
    }
  | {
      type: 'post_message';
      content: string;
      mentions?: string[];
      fromAgentId?: string;
    }
  | {
      type: 'set_task_status';
      status: WorkflowTaskStatus;
      reason?: string;
      actorAgentId?: string;
      requiresReview?: boolean;
    };

type ManualTraceEvent = {
  at: string;
  stepIndex: number;
  type: string;
  status: 'waiting' | 'approved' | 'rejected' | 'succeeded' | 'failed' | 'skipped';
  message?: string;
  output?: unknown;
};

type ManualState = {
  stepIndex: number;
  steps: ManualStep[];
  trace: ManualTraceEvent[];
  waitingApprovalId?: string;
};

type ManualRunResult = {
  ok: boolean;
  waitingApproval?: boolean;
  run: any;
  error?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function badRequest(message: string) {
  const err = new Error(message) as Error & { status?: number };
  err.status = 400;
  return err;
}

function safeBool(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

function parseTaskStatus(value: unknown): WorkflowTaskStatus | undefined {
  const status = safeString(value).toLowerCase();
  if (
    status === 'inbox' ||
    status === 'assigned' ||
    status === 'in_progress' ||
    status === 'review' ||
    status === 'done' ||
    status === 'blocked'
  ) {
    return status;
  }
  return undefined;
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((v) => safeString(v)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pbDateForFilter(value: string) {
  return String(value || '').replace('T', ' ');
}

function appendRunLog(prev: unknown, line: string) {
  const left = String(prev || '').trim();
  const right = String(line || '').trim();
  if (!right) return left;
  return left ? `${left}\n${right}` : right;
}

function leadAgentId() {
  return String(process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco').trim() || 'coco';
}

function normalizeManualStep(raw: any): ManualStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const typeRaw = safeString(raw.type || raw.kind).toLowerCase();
  const title = safeString(raw.title || raw.name);
  const instructions = safeString(raw.instructions || raw.note || raw.description);
  const reviewerAgentId = safeString(raw.reviewerAgentId || raw.reviewer || raw.approver);
  const setTaskStatusOnApprove = parseTaskStatus(raw.setTaskStatusOnApprove || raw.onApproveStatus || raw.approveStatus);
  const setTaskStatusOnReject = parseTaskStatus(raw.setTaskStatusOnReject || raw.onRejectStatus || raw.rejectStatus);

  if (
    typeRaw === 'wait_for_approval' ||
    typeRaw === 'approval' ||
    typeRaw === 'collect_human_input' ||
    typeRaw === 'human_input' ||
    typeRaw === 'verify_deliverable' ||
    typeRaw === 'review_deliverable' ||
    typeRaw === 'verify'
  ) {
    const isHumanInput = typeRaw === 'collect_human_input' || typeRaw === 'human_input';
    const isVerifyDeliverable =
      typeRaw === 'verify_deliverable' || typeRaw === 'review_deliverable' || typeRaw === 'verify';
    return {
      type: 'wait_for_approval',
      title:
        title ||
        (isHumanInput ? 'Human input required' : isVerifyDeliverable ? 'Verify deliverable' : ''),
      instructions:
        instructions ||
        (isHumanInput ? 'Provide decision note with required input before approval.' : ''),
      reviewerAgentId,
      requireDecisionNote: safeBool(raw.requireDecisionNote, isHumanInput),
      setTaskStatusOnApprove: setTaskStatusOnApprove || (isVerifyDeliverable ? 'done' : undefined),
      setTaskStatusOnReject: setTaskStatusOnReject || (isVerifyDeliverable ? 'in_progress' : undefined),
    };
  }

  if (typeRaw === 'run_lobster' || typeRaw === 'lobster') {
    const pipeline = safeString(raw.pipeline || raw.value || raw.payload);
    if (!pipeline) return null;
    const vars = raw.vars && typeof raw.vars === 'object' ? (raw.vars as Record<string, unknown>) : null;
    const timeoutMs = safeNumber(raw.timeoutMs || raw.timeout);
    return {
      type: 'run_lobster',
      pipeline,
      vars,
      sessionKey: safeString(raw.sessionKey),
      timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
    };
  }

  if (typeRaw === 'run_openclaw_tool' || typeRaw === 'openclaw_tool' || typeRaw === 'tool') {
    const tool = safeString(raw.tool || raw.name);
    if (!tool) return null;
    const args = raw.args && typeof raw.args === 'object' ? (raw.args as Record<string, unknown>) : null;
    const timeoutMs = safeNumber(raw.timeoutMs || raw.timeout);
    return {
      type: 'run_openclaw_tool',
      tool,
      args,
      sessionKey: safeString(raw.sessionKey),
      timeoutMs: timeoutMs > 0 ? timeoutMs : undefined,
    };
  }

  if (typeRaw === 'set_task_status' || typeRaw === 'status') {
    const status = parseTaskStatus(raw.status || raw.value || raw.to || raw.nextStatus);
    if (!status) return null;
    const requiresReview = typeof raw.requiresReview === 'boolean' ? raw.requiresReview : undefined;
    return {
      type: 'set_task_status',
      status,
      reason: safeString(raw.reason || raw.message || raw.note),
      actorAgentId: safeString(raw.actorAgentId || raw.fromAgentId || raw.agentId),
      requiresReview,
    };
  }

  if (typeRaw === 'publish') {
    const status = parseTaskStatus(raw.status || raw.value || raw.to || raw.nextStatus) || 'done';
    return {
      type: 'set_task_status',
      status,
      reason: safeString(raw.reason || raw.message || raw.note) || 'Publish approved deliverable.',
      actorAgentId: safeString(raw.actorAgentId || raw.fromAgentId || raw.agentId),
    };
  }

  if (typeRaw === 'post_message' || typeRaw === 'message' || typeRaw === 'note') {
    const content = safeString(raw.content || raw.message || raw.text);
    if (!content) return null;
    return {
      type: 'post_message',
      content,
      mentions: normalizeStringArray(raw.mentions),
      fromAgentId: safeString(raw.fromAgentId),
    };
  }

  return null;
}

function normalizeManualStepsFromUnknown(value: unknown) {
  let rows: unknown[] = [];
  if (Array.isArray(value)) rows = value;
  else if (value && typeof value === 'object' && Array.isArray((value as any).steps)) rows = (value as any).steps;
  return rows.map((row) => normalizeManualStep(row)).filter(Boolean) as ManualStep[];
}

function normalizeManualStepsFromPipeline(workflow: any) {
  const text = safeString(workflow?.pipeline);
  if (text) {
    try {
      const parsed = JSON.parse(text);
      const steps = normalizeManualStepsFromUnknown(parsed);
      if (steps.length) return steps;
    } catch {
      // fallback below
    }
  }
  if (text) {
    return [
      {
        type: 'post_message',
        content: text,
      } satisfies ManualStep,
    ];
  }
  return [
    {
      type: 'post_message',
      content: `Manual workflow "${safeString(workflow?.name || workflow?.id || 'run')}" executed.`,
    } satisfies ManualStep,
  ];
}

function getManualState(run: any, workflow: any): ManualState {
  const result = run?.result && typeof run.result === 'object' ? (run.result as Record<string, any>) : {};
  const manual = result?.manual && typeof result.manual === 'object' ? (result.manual as Record<string, any>) : {};
  const stepsFromResult = normalizeManualStepsFromUnknown(manual.steps);
  const steps = stepsFromResult.length ? stepsFromResult : normalizeManualStepsFromPipeline(workflow);
  const trace = Array.isArray(manual.trace)
    ? manual.trace
        .map((row: any) => ({
          at: safeString(row?.at) || nowIso(),
          stepIndex: Math.max(0, Number(row?.stepIndex || 0)),
          type: safeString(row?.type),
          status: safeString(row?.status) as ManualTraceEvent['status'],
          message: safeString(row?.message),
          output: row?.output,
        }))
        .filter((row: any) => row.type && row.status)
    : [];
  const stepIndex = Math.max(0, Number(manual.stepIndex || 0));
  return {
    stepIndex: Number.isFinite(stepIndex) ? stepIndex : 0,
    steps,
    trace: trace.slice(-400),
    waitingApprovalId: safeString(manual.waitingApprovalId),
  };
}

function withManualState(run: any, state: ManualState) {
  const result = run?.result && typeof run.result === 'object' ? ({ ...(run.result as Record<string, unknown>) }) : {};
  result.manual = state;
  return result;
}

function pushTrace(state: ManualState, event: ManualTraceEvent) {
  state.trace.push(event);
  if (state.trace.length > 400) state.trace = state.trace.slice(-400);
}

function hasTrace(state: ManualState, stepIndex: number, status: ManualTraceEvent['status']) {
  for (let i = state.trace.length - 1; i >= 0; i--) {
    const row = state.trace[i];
    if (row.stepIndex !== stepIndex) continue;
    if (row.status === status) return true;
  }
  return false;
}

async function createActivity(type: string, summary: string, taskId?: string, actorAgentId?: string) {
  const now = nowIso();
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
    // best effort
  }
}

async function createNotification(toAgentId: string, taskId: string, title: string, content: string, url: string) {
  const to = safeString(toAgentId);
  if (!to) return;
  try {
    await pbFetch('/api/collections/notifications/records', {
      method: 'POST',
      body: {
        toAgentId: to,
        taskId: taskId || '',
        content: content || title,
        kind: 'review_requested',
        title,
        url,
        delivered: false,
        readAt: '',
      },
    });
  } catch {
    // best effort
  }
}

function taskStatusFromApprovalStep(step: ManualStep | null, decision: 'approved' | 'rejected') {
  if (!step || step.type !== 'wait_for_approval') return undefined;
  return decision === 'approved' ? step.setTaskStatusOnApprove : step.setTaskStatusOnReject;
}

async function setTaskStatusFromWorkflow(
  taskId: string,
  status: WorkflowTaskStatus | undefined,
  actorAgentId?: string,
  reason?: string,
  requiresReview?: boolean
) {
  const normalizedTaskId = safeString(taskId);
  if (!normalizedTaskId || !status) return;
  try {
    const patch: Record<string, unknown> = {
      status,
      completedAt: status === 'done' ? nowIso() : '',
      updatedAt: nowIso(),
    };
    if (typeof requiresReview === 'boolean') patch.requiresReview = requiresReview;
    await pbFetch(`/api/collections/tasks/records/${normalizedTaskId}`, {
      method: 'PATCH',
      body: patch,
    });
    const summary =
      safeString(reason) || `Workflow set task status to ${status}.`;
    await createActivity('workflow_step_status', summary, normalizedTaskId, safeString(actorAgentId));
  } catch {
    // best effort
  }
}

async function patchRun(runId: string, patch: Record<string, unknown>) {
  return pbFetch<any>(`/api/collections/workflow_runs/records/${runId}`, {
    method: 'PATCH',
    body: { ...patch, updatedAt: nowIso() },
  });
}

async function listApprovalsForRun(runId: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '200',
    sort: '-createdAt',
    filter: `runId = "${pbFilterString(runId)}"`,
  });
  try {
    const list = await pbFetch<any>(`/api/collections/workflow_step_approvals/records?${q.toString()}`);
    return Array.isArray(list?.items) ? list.items : [];
  } catch {
    return [] as any[];
  }
}

async function latestApprovalForStep(runId: string, stepIndex: number) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    sort: '-createdAt',
    filter: `runId = "${pbFilterString(runId)}" && stepIndex = ${stepIndex}`,
  });
  try {
    const list = await pbFetch<any>(`/api/collections/workflow_step_approvals/records?${q.toString()}`);
    return Array.isArray(list?.items) && list.items.length ? list.items[0] : null;
  } catch {
    return null;
  }
}

async function createPendingApproval(run: any, stepIndex: number, step: Extract<ManualStep, { type: 'wait_for_approval' }>) {
  const now = nowIso();
  const reviewer = safeString(step.reviewerAgentId) || leadAgentId();
  const instructions = safeString(step.instructions);
  const withRequirement = step.requireDecisionNote
    ? `${instructions ? `${instructions}\n\n` : ''}Decision note is required for approval.`
    : instructions;
  try {
    const created = await pbFetch<any>('/api/collections/workflow_step_approvals/records', {
      method: 'POST',
      body: {
        runId: safeString(run?.id),
        workflowId: safeString(run?.workflowId),
        taskId: safeString(run?.taskId),
        stepIndex,
        title: safeString(step.title) || `Approval step ${stepIndex + 1}`,
        instructions: withRequirement,
        reviewerAgentId: reviewer,
        status: 'pending',
        decisionNote: '',
        decidedBy: '',
        decidedAt: '',
        createdAt: now,
        updatedAt: now,
      },
    });
    return { created, reviewer };
  } catch {
    return { created: null, reviewer };
  }
}

async function failRun(run: any, workflow: any, state: ManualState, reason: string): Promise<ManualRunResult> {
  const msg = safeString(reason) || 'Manual workflow step failed.';
  pushTrace(state, {
    at: nowIso(),
    stepIndex: Math.max(0, Number(state.stepIndex || 0)),
    type: 'run',
    status: 'failed',
    message: msg,
  });
  const failed = await patchRun(safeString(run?.id), {
    status: 'failed',
    finishedAt: nowIso(),
    result: withManualState(run, state),
    log: appendRunLog(run?.log, msg),
  });
  await createActivity(
    'workflow_run_failed',
    `Workflow run failed (${safeString(workflow?.name || run?.workflowId)}): ${msg}`,
    safeString(run?.taskId),
    ''
  );
  return { ok: false, run: failed, error: msg };
}

export async function executeManualWorkflowRun(runId: string): Promise<ManualRunResult> {
  const normalizedRunId = safeString(runId);
  let run = await pbFetch<any>(`/api/collections/workflow_runs/records/${normalizedRunId}`);
  const workflowId = safeString(run?.workflowId);
  if (!workflowId) return { ok: false, run, error: 'Workflow run has no workflowId.' };
  const workflow = await pbFetch<any>(`/api/collections/workflows/records/${workflowId}`);
  const kind = safeString(workflow?.kind || 'manual') || 'manual';
  if (kind !== 'manual') return { ok: false, run, error: 'Workflow is not manual.' };

  const state = getManualState(run, workflow);
  if (!safeString(run?.startedAt)) {
    run = await patchRun(normalizedRunId, {
      status: 'running',
      startedAt: nowIso(),
      result: withManualState(run, state),
    });
  }

  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const stepIndex = Math.max(0, Number(state.stepIndex || 0));
    state.stepIndex = stepIndex;
    if (stepIndex >= state.steps.length) {
      const done = await patchRun(normalizedRunId, {
        status: 'succeeded',
        finishedAt: nowIso(),
        result: withManualState(run, state),
        log: appendRunLog(run?.log, 'Manual workflow complete.'),
      });
      await createActivity(
        'workflow_run_succeeded',
        `Workflow run succeeded (${safeString(workflow?.name || workflowId)}).`,
        safeString(run?.taskId),
        ''
      );
      return { ok: true, run: done };
    }

    const step = state.steps[stepIndex];
    if (!step) {
      state.stepIndex += 1;
      continue;
    }

    if (step.type === 'wait_for_approval') {
      const latest = await latestApprovalForStep(normalizedRunId, stepIndex);
      const latestStatus = safeString(latest?.status).toLowerCase();
      if (latestStatus === 'approved') {
        state.waitingApprovalId = '';
        if (!hasTrace(state, stepIndex, 'approved')) {
          pushTrace(state, {
            at: nowIso(),
            stepIndex,
            type: 'wait_for_approval',
            status: 'approved',
            message: safeString(step.title) || `Step ${stepIndex + 1} approved`,
          });
        }
        state.stepIndex += 1;
        run = await patchRun(normalizedRunId, {
          status: 'running',
          result: withManualState(run, state),
        });
        continue;
      }

      if (latestStatus === 'rejected') {
        state.waitingApprovalId = safeString(latest?.id);
        if (!hasTrace(state, stepIndex, 'rejected')) {
          pushTrace(state, {
            at: nowIso(),
            stepIndex,
            type: 'wait_for_approval',
            status: 'rejected',
            message: safeString(latest?.decisionNote) || safeString(step.title) || `Step ${stepIndex + 1} rejected`,
          });
        }
        return failRun(run, workflow, state, safeString(latest?.decisionNote) || 'Approval rejected.');
      }

      let approval = latest;
      let createdNow = false;
      let reviewer = safeString(step.reviewerAgentId) || leadAgentId();
      if (!approval || latestStatus !== 'pending') {
        const created = await createPendingApproval(run, stepIndex, step);
        approval = created.created;
        reviewer = created.reviewer;
        createdNow = Boolean(created.created);
      }
      state.waitingApprovalId = safeString(approval?.id);
      if (!hasTrace(state, stepIndex, 'waiting')) {
        pushTrace(state, {
          at: nowIso(),
          stepIndex,
          type: 'wait_for_approval',
          status: 'waiting',
          message: safeString(step.title) || `Waiting approval for step ${stepIndex + 1}`,
        });
      }
      run = await patchRun(normalizedRunId, {
        status: 'running',
        result: withManualState(run, state),
        log: appendRunLog(run?.log, `Waiting approval at step ${stepIndex + 1}: ${safeString(step.title) || 'approval step'}`),
      });
      if (createdNow) {
        const taskId = safeString(run?.taskId);
        const title = safeString(step.title) || `Workflow approval needed`;
        const content = safeString(step.instructions) || `Approve manual workflow step ${stepIndex + 1}.`;
        await createActivity('workflow_approval_requested', `${title} (${safeString(workflow?.name || workflowId)}).`, taskId, reviewer);
        await createNotification(reviewer, taskId, title, content, taskId ? `/tasks/${taskId}` : `/workflows?run=${normalizedRunId}`);
      }
      return { ok: true, waitingApproval: true, run };
    }

    if (step.type === 'post_message') {
      const taskId = safeString(run?.taskId);
      const content = safeString(step.content);
      if (taskId && content) {
        await pbFetch('/api/collections/messages/records', {
          method: 'POST',
          body: {
            taskId,
            fromAgentId: safeString(step.fromAgentId),
            content,
            mentions: normalizeStringArray(step.mentions),
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        }).catch(() => {});
      } else if (content) {
        await createActivity('workflow_step_note', content, taskId, safeString(step.fromAgentId));
      }
      pushTrace(state, {
        at: nowIso(),
        stepIndex,
        type: 'post_message',
        status: 'succeeded',
        message: content,
      });
      state.stepIndex += 1;
      state.waitingApprovalId = '';
      run = await patchRun(normalizedRunId, {
        status: 'running',
        result: withManualState(run, state),
        log: appendRunLog(run?.log, `Step ${stepIndex + 1} post_message succeeded.`),
      });
      continue;
    }

    if (step.type === 'set_task_status') {
      const taskId = safeString(run?.taskId);
      if (!taskId) {
        return failRun(run, workflow, state, `Step ${stepIndex + 1} set_task_status requires taskId.`);
      }
      await setTaskStatusFromWorkflow(
        taskId,
        step.status,
        safeString(step.actorAgentId),
        safeString(step.reason) || `Set task status to ${step.status}.`,
        step.requiresReview
      );
      pushTrace(state, {
        at: nowIso(),
        stepIndex,
        type: 'set_task_status',
        status: 'succeeded',
        message: safeString(step.reason) || `Task status set to ${step.status}.`,
        output: { status: step.status },
      });
      state.stepIndex += 1;
      state.waitingApprovalId = '';
      run = await patchRun(normalizedRunId, {
        status: 'running',
        result: withManualState(run, state),
        log: appendRunLog(run?.log, `Step ${stepIndex + 1} set_task_status (${step.status}) succeeded.`),
      });
      continue;
    }

    if (step.type === 'run_lobster') {
      try {
        const timeoutMs = step.timeoutMs && step.timeoutMs > 0 ? step.timeoutMs : 10 * 60_000;
        const args: Record<string, unknown> = { pipeline: step.pipeline };
        if (step.vars && typeof step.vars === 'object') args.vars = step.vars;
        if (safeString(run?.taskId)) args.taskId = safeString(run?.taskId);
        args.runId = normalizedRunId;
        const out = await openclawToolsInvoke<any>(
          'lobster',
          args,
          safeString(step.sessionKey || run?.sessionKey)
            ? {
                sessionKey: safeString(step.sessionKey || run?.sessionKey),
                timeoutMs,
                commandId: safeString(run?.commandId),
              }
            : { timeoutMs, commandId: safeString(run?.commandId) }
        );
        const output = out?.parsedText ?? out?.raw ?? null;
        pushTrace(state, {
          at: nowIso(),
          stepIndex,
          type: 'run_lobster',
          status: 'succeeded',
          message: `Lobster step ${stepIndex + 1} succeeded.`,
          output,
        });
        state.stepIndex += 1;
        state.waitingApprovalId = '';
        run = await patchRun(normalizedRunId, {
          status: 'running',
          result: withManualState(run, state),
          log: appendRunLog(run?.log, `Step ${stepIndex + 1} run_lobster succeeded.`),
        });
        continue;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return failRun(run, workflow, state, `Step ${stepIndex + 1} run_lobster failed: ${msg}`);
      }
    }

    if (step.type === 'run_openclaw_tool') {
      try {
        const timeoutMs = step.timeoutMs && step.timeoutMs > 0 ? step.timeoutMs : 120_000;
        const args = step.args && typeof step.args === 'object' ? { ...(step.args as Record<string, unknown>) } : {};
        if (safeString(run?.taskId) && !('taskId' in args)) args.taskId = safeString(run?.taskId);
        if (!('runId' in args)) args.runId = normalizedRunId;
        const out = await openclawToolsInvoke<any>(
          step.tool,
          args,
          safeString(step.sessionKey || run?.sessionKey)
            ? {
                sessionKey: safeString(step.sessionKey || run?.sessionKey),
                timeoutMs,
                commandId: safeString(run?.commandId),
              }
            : { timeoutMs, commandId: safeString(run?.commandId) }
        );
        const output = out?.parsedText ?? out?.raw ?? null;
        pushTrace(state, {
          at: nowIso(),
          stepIndex,
          type: `run_openclaw_tool:${step.tool}`,
          status: 'succeeded',
          message: `Tool ${step.tool} step ${stepIndex + 1} succeeded.`,
          output,
        });
        state.stepIndex += 1;
        state.waitingApprovalId = '';
        run = await patchRun(normalizedRunId, {
          status: 'running',
          result: withManualState(run, state),
          log: appendRunLog(run?.log, `Step ${stepIndex + 1} run_openclaw_tool (${step.tool}) succeeded.`),
        });
        continue;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return failRun(run, workflow, state, `Step ${stepIndex + 1} run_openclaw_tool failed: ${msg}`);
      }
    }

    pushTrace(state, {
      at: nowIso(),
      stepIndex,
      type: 'unknown',
      status: 'skipped',
      message: `Skipped unknown step type at index ${stepIndex + 1}.`,
    });
    state.stepIndex += 1;
    run = await patchRun(normalizedRunId, {
      status: 'running',
      result: withManualState(run, state),
      log: appendRunLog(run?.log, `Skipped unknown step at index ${stepIndex + 1}.`),
    });
  }

  return failRun(run, workflow, state, 'Manual workflow exceeded max step iterations.');
}

export async function decideManualWorkflowApproval(
  runId: string,
  decision: 'approved' | 'rejected',
  note?: string,
  actorAgentId?: string
) {
  const normalizedRunId = safeString(runId);
  const action = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : '';
  if (!action) throw new Error('Invalid approval decision.');
  const actor = safeString(actorAgentId) || leadAgentId();
  const decisionNote = safeString(note);

  const run = await pbFetch<any>(`/api/collections/workflow_runs/records/${normalizedRunId}`);
  const workflowId = safeString(run?.workflowId);
  const workflow = workflowId ? await pbFetch<any>(`/api/collections/workflows/records/${workflowId}`).catch(() => null) : null;
  const state = getManualState(run, workflow || {});

  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    sort: '-createdAt',
    filter: `runId = "${pbFilterString(normalizedRunId)}" && status = "pending"`,
  });
  const pending = await pbFetch<any>(`/api/collections/workflow_step_approvals/records?${q.toString()}`);
  const approval = Array.isArray(pending?.items) && pending.items.length ? pending.items[0] : null;
  if (!approval) throw new Error('No pending approval for this workflow run.');

  const stepIndex = Math.max(0, Math.floor(safeNumber(approval?.stepIndex)));
  const step = state.steps[stepIndex] || null;
  if (step && step.type === 'wait_for_approval' && step.requireDecisionNote && !decisionNote) {
    throw badRequest('Decision note is required for this step.');
  }

  const now = nowIso();
  const updatedApproval = await pbFetch<any>(`/api/collections/workflow_step_approvals/records/${approval.id}`, {
    method: 'PATCH',
    body: {
      status: action,
      decisionNote,
      decidedBy: actor,
      decidedAt: now,
      updatedAt: now,
    },
  });

  const taskStatusTarget = taskStatusFromApprovalStep(step, action);
  if (taskStatusTarget) {
    await setTaskStatusFromWorkflow(
      safeString(run?.taskId),
      taskStatusTarget,
      actor,
      `${action === 'approved' ? 'Approved' : 'Rejected'} step ${stepIndex + 1}; status set to ${taskStatusTarget}.`
    );
  }

  await createActivity(
    action === 'approved' ? 'workflow_approval_approved' : 'workflow_approval_rejected',
    `${action === 'approved' ? 'Approved' : 'Rejected'} workflow step ${safeNumber(updatedApproval?.stepIndex) + 1} (${safeString(workflow?.name || workflowId || normalizedRunId)}).`,
    safeString(run?.taskId),
    actor
  );

  if (action === 'rejected' && safeString(run?.status) !== 'failed' && safeString(run?.status) !== 'succeeded') {
    const failed = await patchRun(normalizedRunId, {
      status: 'failed',
      finishedAt: nowIso(),
      log: appendRunLog(run?.log, decisionNote || `Approval rejected at step ${safeNumber(updatedApproval?.stepIndex) + 1}.`),
    });
    await createActivity(
      'workflow_run_failed',
      `Workflow run failed (${safeString(workflow?.name || workflowId || normalizedRunId)}): approval rejected.`,
      safeString(run?.taskId),
      ''
    );
    return { approval: updatedApproval, run: failed };
  }

  return { approval: updatedApproval, run };
}

async function listTaskArtifacts(collection: string, taskId: string, runCreatedAt: string) {
  if (!taskId) return [] as any[];
  const filters = [`taskId = "${pbFilterString(taskId)}"`];
  if (runCreatedAt) filters.push(`createdAt >= "${pbFilterString(pbDateForFilter(runCreatedAt))}"`);
  const q = new URLSearchParams({
    page: '1',
    perPage: '200',
    sort: '-createdAt',
    filter: filters.join(' && '),
  });
  try {
    const list = await pbFetch<any>(`/api/collections/${collection}/records?${q.toString()}`);
    return Array.isArray(list?.items) ? list.items : [];
  } catch {
    return [] as any[];
  }
}

export async function getWorkflowRunTrace(runId: string) {
  const normalizedRunId = safeString(runId);
  const run = await pbFetch<any>(`/api/collections/workflow_runs/records/${normalizedRunId}`);
  const workflowId = safeString(run?.workflowId);
  const workflow = workflowId ? await pbFetch<any>(`/api/collections/workflows/records/${workflowId}`).catch(() => null) : null;
  const taskId = safeString(run?.taskId);
  const runCreatedAt = safeString(run?.createdAt);

  const approvals = await listApprovalsForRun(normalizedRunId);
  const manualState = getManualState(run, workflow || {});

  const [activities, messages, documents] = await Promise.all([
    listTaskArtifacts('activities', taskId, runCreatedAt),
    listTaskArtifacts('messages', taskId, runCreatedAt),
    listTaskArtifacts('documents', taskId, runCreatedAt),
  ]);

  return {
    ok: true,
    run,
    workflow,
    approvals,
    manualTrace: manualState.trace,
    activities,
    messages,
    documents,
  };
}
