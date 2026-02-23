import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { NotificationRecord, PBList } from '@/lib/types';
import { InboxClient } from '@/app/inbox/InboxClient';

export const dynamic = 'force-dynamic';

async function getInboxItems() {
  const q = new URLSearchParams({
    page: '1',
    perPage: '200',
    sort: '-created',
    filter: 'delivered = true',
  });
  return pbFetch<PBList<NotificationRecord>>(`/api/collections/notifications/records?${q.toString()}`);
}

export default async function InboxPage() {
  const data = await getInboxItems();

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="Inbox" subtitle="Human review queue and agent notifications." density="compact" />
        <div className="min-h-0 flex-1">
          <InboxClient initialItems={data.items || []} />
        </div>
      </div>
    </AppShell>
  );
}

