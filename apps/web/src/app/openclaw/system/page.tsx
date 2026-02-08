import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { SystemClient } from '@/app/openclaw/system/systemClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSystemPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="OpenClaw System"
          subtitle="Presence and heartbeat controls (use heartbeats carefully to avoid token burn)."
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <SystemClient />
        </div>
      </div>
    </AppShell>
  );
}
