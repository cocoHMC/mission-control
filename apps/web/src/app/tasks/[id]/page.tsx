import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import { TaskDetail } from '@/app/tasks/[id]/TaskDetail';
import type { Agent, DocumentRecord, Message, NodeRecord, PBList, Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getTask(id: string) {
  return pbFetch<Task>(`/api/collections/tasks/records/${id}`);
}

async function getAgents() {
  return pbFetch<PBList<Agent>>('/api/collections/agents/records?page=1&perPage=200');
}

async function getMessages(taskId: string) {
  const q = new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = "${taskId}"` });
  return pbFetch<PBList<Message>>(`/api/collections/messages/records?${q.toString()}`);
}

async function getDocs(taskId: string) {
  const q = new URLSearchParams({ page: '1', perPage: '100', filter: `taskId = "${taskId}"` });
  return pbFetch<PBList<DocumentRecord>>(`/api/collections/documents/records?${q.toString()}`);
}

async function getNodes() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  return pbFetch<PBList<NodeRecord>>(`/api/collections/nodes/records?${q.toString()}`);
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [task, agents, messages, documents, nodes] = await Promise.all([
    getTask(id),
    getAgents(),
    getMessages(id),
    getDocs(id),
    getNodes(),
  ]);

  return (
    <AppShell>
      <Topbar title="Task" subtitle={`Task ID: ${task.id}`} />
      <div className="mt-8">
        <TaskDetail
          task={task}
          agents={agents.items ?? []}
          nodes={nodes.items ?? []}
          messages={messages.items ?? []}
          documents={documents.items ?? []}
        />
      </div>
    </AppShell>
  );
}
