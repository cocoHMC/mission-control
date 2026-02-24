import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { NotificationRecord, PBList } from '@/lib/types';
import { InboxClient } from '@/app/inbox/InboxClient';

export const dynamic = 'force-dynamic';

const NOTIFICATION_SORT_FALLBACKS = ['-created', '-createdAt', '-deliveredAt,-id', '-id'];

async function getInboxItems() {
  const baseQ = new URLSearchParams({
    page: '1',
    perPage: '200',
    filter: 'delivered = true',
  });

  let lastErr: unknown = null;
  for (const sort of NOTIFICATION_SORT_FALLBACKS) {
    const q = new URLSearchParams(baseQ);
    q.set('sort', sort);
    try {
      return await pbFetch<PBList<NotificationRecord>>(`/api/collections/notifications/records?${q.toString()}`);
    } catch (err: any) {
      lastErr = err;
      if (Number(err?.status || 0) !== 400) break;
    }
  }

  console.error('[inbox] failed to load notifications', lastErr);
  return { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 0 };
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
