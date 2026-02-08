import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { OpenClawConfigClient } from '@/app/openclaw/OpenClawConfigClient';

export const dynamic = 'force-dynamic';

export default function OpenClawConfigPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Config" subtitle="Advanced: review and apply full gateway configuration changes." density="compact" />
        <div className="min-h-0 flex-1">
          <OpenClawConfigClient />
        </div>
      </div>
    </AppShell>
  );
}
