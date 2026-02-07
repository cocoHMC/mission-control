import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { GatewayClient } from '@/app/openclaw/gateway/gatewayClient';

export const dynamic = 'force-dynamic';

export default function OpenClawGatewayPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Gateway" subtitle="Service status, bind mode, and safe start/stop controls." />
      <div className="mt-4 sm:mt-8">
        <GatewayClient />
      </div>
    </AppShell>
  );
}

