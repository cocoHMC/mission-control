import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { GatewayClient } from '@/app/openclaw/gateway/gatewayClient';

export const dynamic = 'force-dynamic';

export default function OpenClawGatewayPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Gateway" subtitle="Service status, bind mode, and safe start/stop controls." density="compact" />
        <div className="min-h-0 flex-1">
          <GatewayClient />
        </div>
      </div>
    </AppShell>
  );
}
