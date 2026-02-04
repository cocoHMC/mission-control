import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { Agent, PBList } from '@/lib/types';
import { AgentsGrid } from '@/app/agents/AgentsGrid';

export default async function AgentsPage() {
  const leadName = process.env.MC_LEAD_AGENT_NAME || process.env.MC_LEAD_AGENT_ID || 'Lead';
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'displayName' });
  const data = await pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
  const agents = data.items ?? [];

  return (
    <AppShell>
      <Topbar title="Agents" subtitle={`Lead agent: ${leadName}. Add more agents when ready.`} />
      <div className="mt-4 sm:mt-8">
        <AgentsGrid initialAgents={agents} />
      </div>
    </AppShell>
  );
}
