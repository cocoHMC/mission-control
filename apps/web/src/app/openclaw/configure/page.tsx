import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ConfigureClient } from '@/app/openclaw/configure/configureClient';

export const dynamic = 'force-dynamic';

export default function OpenClawConfigurePage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="OpenClaw Settings"
          subtitle="Guided configuration for gateway access, tailscale exposure, and safety defaults."
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <ConfigureClient />
        </div>
      </div>
    </AppShell>
  );
}
