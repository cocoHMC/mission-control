import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

type UsageAgg = {
  events: number;
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
  estimatedCostUsd: number;
};

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pbDateForFilter(date: Date) {
  return date.toISOString().replace('T', ' ');
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, digits = 6) {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function makeAgg(): UsageAgg {
  return { events: 0, inputTokens: 0, outputTokens: 0, tokensUsed: 0, estimatedCostUsd: 0 };
}

function addAgg(target: UsageAgg, item: any) {
  target.events += 1;
  target.inputTokens += safeNumber(item?.inputTokens);
  target.outputTokens += safeNumber(item?.outputTokens);
  target.tokensUsed += safeNumber(item?.tokensUsed);
  target.estimatedCostUsd += safeNumber(item?.estimatedCostUsd);
}

function sortAggEntries(map: Map<string, UsageAgg>) {
  return Array.from(map.entries())
    .map(([id, agg]) => ({
      id,
      events: agg.events,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      tokensUsed: agg.tokensUsed,
      estimatedCostUsd: round(agg.estimatedCostUsd),
    }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.tokensUsed - a.tokensUsed || b.events - a.events);
}

function resolveRange(input: string, fromRaw: string, toRaw: string) {
  const now = new Date();
  const range = String(input || '').trim().toLowerCase();
  const to = toRaw ? new Date(toRaw) : now;
  let from: Date;

  if (range === 'custom' && fromRaw) {
    const parsed = new Date(fromRaw);
    if (!Number.isNaN(parsed.getTime())) from = parsed;
    else from = new Date(now.getTime() - 24 * 60 * 60_000);
  } else if (range === 'week') {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  } else if (range === 'month') {
    from = new Date(now);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  }

  if (Number.isNaN(from.getTime())) from = new Date(now.getTime() - 24 * 60 * 60_000);
  const safeTo = Number.isNaN(to.getTime()) ? now : to;
  return { from, to: safeTo };
}

async function listUsageEvents(filter: string) {
  const perPage = 500;
  let page = 1;
  const out: any[] = [];

  while (page <= 50) {
    const q = new URLSearchParams({
      page: String(page),
      perPage: String(perPage),
      sort: '-ts',
      ...(filter ? { filter } : {}),
    });
    const data = await pbFetch<any>(`/api/collections/usage_events/records?${q.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    out.push(...items);
    if (items.length < perPage) break;
    page += 1;
  }

  return out;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const range = String(url.searchParams.get('range') || 'today').trim().toLowerCase();
  const projectId = String(url.searchParams.get('projectId') || '').trim();
  const taskId = String(url.searchParams.get('taskId') || '').trim();
  const fromRaw = String(url.searchParams.get('from') || '').trim();
  const toRaw = String(url.searchParams.get('to') || '').trim();
  const { from, to } = resolveRange(range, fromRaw, toRaw);

  const filters: string[] = [
    `ts >= "${pbDateForFilter(from)}"`,
    `ts <= "${pbDateForFilter(to)}"`,
  ];
  if (projectId) filters.push(`projectId = "${pbFilterString(projectId)}"`);
  if (taskId) filters.push(`taskId = "${pbFilterString(taskId)}"`);

  const rows = await listUsageEvents(filters.join(' && '));

  const totals = makeAgg();
  const byModel = new Map<string, UsageAgg>();
  const byProject = new Map<string, UsageAgg>();
  const byTask = new Map<string, UsageAgg>();
  const byAgent = new Map<string, UsageAgg>();

  for (const row of rows) {
    addAgg(totals, row);

    const model = String(row?.model || '').trim();
    if (model) {
      if (!byModel.has(model)) byModel.set(model, makeAgg());
      addAgg(byModel.get(model)!, row);
    }

    const p = String(row?.projectId || '').trim();
    if (p) {
      if (!byProject.has(p)) byProject.set(p, makeAgg());
      addAgg(byProject.get(p)!, row);
    }

    const t = String(row?.taskId || '').trim();
    if (t) {
      if (!byTask.has(t)) byTask.set(t, makeAgg());
      addAgg(byTask.get(t)!, row);
    }

    const a = String(row?.agentId || '').trim();
    if (a) {
      if (!byAgent.has(a)) byAgent.set(a, makeAgg());
      addAgg(byAgent.get(a)!, row);
    }
  }

  return NextResponse.json({
    ok: true,
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    totals: {
      events: totals.events,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      tokensUsed: totals.tokensUsed,
      estimatedCostUsd: round(totals.estimatedCostUsd),
    },
    topModels: sortAggEntries(byModel).slice(0, 10),
    topProjects: sortAggEntries(byProject).slice(0, 10),
    topTasks: sortAggEntries(byTask).slice(0, 10),
    topAgents: sortAggEntries(byAgent).slice(0, 10),
  });
}

