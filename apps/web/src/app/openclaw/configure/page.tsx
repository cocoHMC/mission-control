import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ConfigureClient } from '@/app/openclaw/configure/configureClient';

export const dynamic = 'force-dynamic';

export default function OpenClawConfigurePage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Settings" subtitle="Guided configuration for gateway access, tailscale exposure, and safety defaults." />
      <div className="mt-4 sm:mt-8">
        <ConfigureClient />
      </div>
    </AppShell>
  );
}

