import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { Agent, PBList } from '@/lib/types';
import { AgentDetailClient } from '@/app/agents/[id]/AgentDetailClient';

export const dynamic = 'force-dynamic';

async function getAgentByOpenClawId(openclawId: string) {
  const q = new URLSearchParams({ page: '1', perPage: '1', filter: `openclawAgentId = "${openclawId}" || id = "${openclawId}"` });
  const data = await pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
  return data.items?.[0] ?? null;
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentByOpenClawId(id);
  const title = agent?.displayName ? `${agent.displayName} (${id})` : id;
  const subtitle = agent?.role ? `${agent.role} · Agent overview` : 'Agent overview';

  return (
    <AppShell>
      <Topbar title={title} subtitle={subtitle} />
      <div className="mt-4 sm:mt-8">
        <AgentDetailClient agentId={id} pbAgent={agent} />
      </div>
      <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
        View live chat and session history in the Sessions console for clean, fixed-layout scrolling.
      </div>
    </AppShell>
  );
}
