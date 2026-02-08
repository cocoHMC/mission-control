import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { DevicesClient } from '@/app/openclaw/devices/devicesClient';

export const dynamic = 'force-dynamic';

export default function OpenClawDevicesPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Devices" subtitle="Paired device inventory and tokens (read-only for now)." density="compact" />
        <div className="min-h-0 flex-1">
          <DevicesClient />
        </div>
      </div>
    </AppShell>
  );
}
