import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { pbFetch } from '@/lib/pbServer';
import { formatShortDate, titleCase } from '@/lib/utils';
import type { Activity, Agent, PBList, Task } from '@/lib/types';

async function getOverview() {
  const tasks = await pbFetch<PBList<Task>>('/api/collections/tasks/records?page=1&perPage=200');
  const agents = await pbFetch<PBList<Agent>>('/api/collections/agents/records?page=1&perPage=200');
  const activity = await pbFetch<PBList<Activity>>('/api/collections/activities/records?page=1&perPage=12');
  return {
    tasks: tasks.items ?? [],
    agents: agents.items ?? [],
    activity: activity.items ?? [],
  };
}

export default async function DashboardPage() {
  const { tasks, agents, activity } = await getOverview();
  const leadName = process.env.MC_LEAD_AGENT_NAME || process.env.MC_LEAD_AGENT_ID || 'Lead';
  const counts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell>
      <Topbar title="Mission Control" subtitle={`Push-based orchestration for ${leadName} + future nodes`} actionHref="/tasks/new" actionLabel="New task" />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Task Pulse</CardTitle>
            <CardDescription>Live breakdown across your Kanban pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {['inbox', 'assigned', 'in_progress', 'review', 'blocked', 'done'].map((status) => (
              <div key={status} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">{titleCase(status)}</div>
                <div className="mt-2 text-3xl font-semibold headline">{counts[status] ?? 0}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Agents</CardTitle>
            <CardDescription>Lead with Coco. Add more as needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                <div>
                  <div className="text-sm font-medium">{agent.displayName ?? agent.id}</div>
                  <div className="text-xs text-muted">{agent.role ?? 'Agent'}</div>
                </div>
                <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">{agent.status ?? 'idle'}</Badge>
              </div>
            ))}
            {!agents.length && <div className="text-sm text-muted">No agents yet. Seed Coco in settings.</div>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Append-only logs of every change.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activity.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted">{item.type}</div>
                <div className="mt-1 text-sm">{item.summary}</div>
                <div className="mt-2 text-xs text-muted">{formatShortDate(item.created)}</div>
              </div>
            ))}
            {!activity.length && <div className="text-sm text-muted">No activity yet.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump into command workflows.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              { href: '/tasks', label: 'Open Kanban', desc: 'Move tasks fast' },
              { href: '/activity', label: 'Activity Feed', desc: 'Audit every action' },
              { href: '/nodes', label: 'Nodes', desc: 'Pair new devices' },
              { href: '/docs', label: 'Docs', desc: 'Store deliverables' },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="mt-1 text-xs text-muted">{item.desc}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
