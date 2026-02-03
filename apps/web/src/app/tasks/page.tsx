import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { TaskBoard } from '@/app/tasks/TaskBoard';
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

export default async function TasksPage() {
  const [tasks, agents, nodes] = await Promise.all([getTasks(), getAgents(), getNodes()]);

  return (
    <AppShell>
      <Topbar title="Tasks" subtitle="Kanban control with lease enforcement." actionHref="/tasks/new" actionLabel="New task" />
      <div className="mt-8">
        <TaskBoard initialTasks={tasks.items ?? []} agents={agents.items ?? []} nodes={nodes.items ?? []} />
      </div>
    </AppShell>
  );
}
