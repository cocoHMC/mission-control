import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { TaskBoard } from '@/app/tasks/TaskBoard';
import { TaskCalendar } from '@/app/tasks/TaskCalendar';
import { TaskViewToggle } from '@/app/tasks/TaskViewToggle';
import { pbFetch } from '@/lib/pbServer';
import type { Agent, NodeRecord, PBList, Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getTasks() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  return pbFetch<PBList<Task>>(`/api/collections/tasks/records?${q.toString()}`);
}

async function getAgents() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  return pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
}

async function getNodes() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  return pbFetch<PBList<NodeRecord>>(`/api/collections/nodes/records?${q.toString()}`);
}

function pickString(value: string | string[] | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) return value[0] || '';
  return value;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const viewParam = pickString(resolved.view).trim().toLowerCase();
  const view = viewParam === 'calendar' ? 'calendar' : 'board';

  const [tasks, agents, nodes] = await Promise.all([getTasks(), getAgents(), getNodes()]);

  return (
    <AppShell scroll="none" padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-2 lg:gap-3">
        {/* On mobile we already have a prominent nav bar; this title row was eating calendar space. */}
        <div className="hidden lg:block">
          <Topbar title="Tasks" density="compact" rightSlot={<TaskViewToggle variant="inline" />} />
        </div>
        <div className="min-h-0 flex-1">
          {view === 'calendar' ? (
            <TaskCalendar initialTasks={tasks.items ?? []} agents={agents.items ?? []} nodes={nodes.items ?? []} />
          ) : (
            <TaskBoard initialTasks={tasks.items ?? []} agents={agents.items ?? []} nodes={nodes.items ?? []} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
