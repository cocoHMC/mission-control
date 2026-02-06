import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { Agent, PBList } from '@/lib/types';
import { SessionsInboxClient } from '@/app/sessions/sessionsClient';

export const dynamic = 'force-dynamic';

async function getAgents() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'displayName' });
  return pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
}

export default async function SessionsPage() {
  const agents = await getAgents();
  return (
    <AppShell scroll="none">
      <div className="flex h-full min-h-0 flex-col">
        <Topbar title="Sessions" actionHref="/sessions?new=1" actionLabel="New session" />
        <div className="mt-2 min-h-0 flex-1 sm:mt-4">
          <SessionsInboxClient agents={agents.items ?? []} />
        </div>
      </div>
    </AppShell>
  );
}
