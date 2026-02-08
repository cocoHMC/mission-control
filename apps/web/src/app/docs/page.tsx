import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { DocumentRecord, PBList } from '@/lib/types';
import { DocumentsClient } from '@/app/docs/DocumentsClient';

export default async function DocsPage() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const data = await pbFetch<PBList<DocumentRecord>>(`/api/collections/documents/records?${q.toString()}`);
  const docs = data.items ?? [];

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="Documents"
          subtitle="Shared deliverables, protocols, and research."
          actionHref="/docs?new=1"
          actionLabel="New doc"
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <DocumentsClient initialDocs={docs} />
        </div>
      </div>
    </AppShell>
  );
}
