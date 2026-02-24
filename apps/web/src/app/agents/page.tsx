import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Badge } from '@/components/ui/badge';
import { pbFetch } from '@/lib/pbServer';
import type { Agent, PBList } from '@/lib/types';
import { AgentsGrid } from '@/app/agents/AgentsGrid';

export default async function AgentsPage() {
  const leadName = process.env.MC_LEAD_AGENT_NAME || process.env.MC_LEAD_AGENT_ID || 'Lead';
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'displayName' });
  const data = await pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
  const agents = data.items ?? [];

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="Agents"
          subtitle={`Lead agent: ${leadName}. Configure OpenClaw agent defaults here; link Mission Control workspaces to OpenClaw paths under Workspaces.`}
          rightSlot={<Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Scope: OpenClaw</Badge>}
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <AgentsGrid initialAgents={agents} />
        </div>
      </div>
    </AppShell>
  );
}
