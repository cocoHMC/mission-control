import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { Activity, PBList } from '@/lib/types';
import { ActivityFeed } from '@/app/activity/ActivityFeed';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const data = await pbFetch<PBList<Activity>>(`/api/collections/activities/records?${q.toString()}`);
  const items = data.items ?? [];

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="Activity" subtitle="Append-only system record." density="compact" />
        <div className="min-h-0 flex-1">
          <ActivityFeed initialItems={items} />
        </div>
      </div>
    </AppShell>
  );
}
