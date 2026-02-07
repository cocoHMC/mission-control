import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { Agent, PBList } from '@/lib/types';
import { VaultClient } from '@/app/agents/[id]/vault/vaultClient';

export const dynamic = 'force-dynamic';

async function getAgentByOpenClawId(openclawId: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `openclawAgentId = "${openclawId}" || id = "${openclawId}"`,
  });
  const data = await pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
  return data.items?.[0] ?? null;
}

export default async function AgentVaultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgentByOpenClawId(id);
  const title = agent?.displayName ? `${agent.displayName} (${id})` : id;
  const subtitle = 'Credentials (Vault) · Manage tokens, passwords, and audit logs';

  return (
    <AppShell>
      <Topbar title={title} subtitle={subtitle} />
      <div className="mt-4 sm:mt-8">
        <VaultClient agentId={id} />
      </div>
    </AppShell>
  );
}

