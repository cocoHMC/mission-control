import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { UpdateClient } from '@/app/openclaw/update/updateClient';

export const dynamic = 'force-dynamic';

export default function OpenClawUpdatePage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Update" subtitle="Check for updates and switch channels (stable/beta/dev)." density="compact" />
        <div className="min-h-0 flex-1">
          <UpdateClient />
        </div>
      </div>
    </AppShell>
  );
}
