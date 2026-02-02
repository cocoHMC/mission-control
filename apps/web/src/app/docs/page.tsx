import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { DocumentRecord, PBList } from '@/lib/types';
import { DocumentsList } from '@/app/docs/DocumentsList';

export default async function DocsPage() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const data = await pbFetch<PBList<DocumentRecord>>(`/api/collections/documents/records?${q.toString()}`);
  const docs = data.items ?? [];

  return (
    <AppShell>
      <Topbar title="Documents" subtitle="Shared deliverables, protocols, and research." />
      <div className="mt-8">
        <DocumentsList initialDocs={docs} />
      </div>
    </AppShell>
  );
}
