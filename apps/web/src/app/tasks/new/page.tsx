import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskForm } from '@/app/tasks/new/TaskForm';
import { pbFetch } from '@/lib/pbServer';
import type { NodeRecord, PBList } from '@/lib/types';

async function getAgents() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  return pbFetch(`/api/collections/agents/records?${q.toString()}`);
}

async function getNodes() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  return pbFetch<PBList<NodeRecord>>(`/api/collections/nodes/records?${q.toString()}`);
}

export default async function NewTaskPage() {
  const [agents, nodes] = await Promise.all([getAgents(), getNodes()]);

  return (
    <AppShell>
      <Topbar title="New Task" subtitle="Create a task with clear ownership." />
      <div className="mt-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Task details</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskForm agents={agents.items ?? []} nodes={nodes.items ?? []} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
