import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { NodeRecord, PBList } from '@/lib/types';
import { SecurityClient } from '@/app/security/SecurityClient';

export default async function SecurityPage() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'displayName' });
  const data = await pbFetch<PBList<NodeRecord>>(`/api/collections/nodes/records?${q.toString()}`);
  const nodes = data.items ?? [];

  return (
    <AppShell>
      <Topbar title="Security" subtitle="Vaultwarden + tailnet-only secrets control." />
      <div className="mt-4 sm:mt-8">
        <SecurityClient nodes={nodes} />
      </div>
    </AppShell>
  );
}
