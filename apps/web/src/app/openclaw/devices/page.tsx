import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { DevicesClient } from '@/app/openclaw/devices/devicesClient';

export const dynamic = 'force-dynamic';

export default function OpenClawDevicesPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Devices" subtitle="Paired device inventory and tokens (read-only for now)." />
      <div className="mt-4 sm:mt-8">
        <DevicesClient />
      </div>
    </AppShell>
  );
}

