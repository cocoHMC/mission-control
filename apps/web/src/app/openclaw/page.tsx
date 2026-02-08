import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { OpenClawOverviewClient } from '@/app/openclaw/OpenClawOverviewClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSettingsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw" subtitle="Gateway status, models, security, approvals, and sessions." density="compact" />
        <div className="min-h-0 flex-1">
          <OpenClawOverviewClient />
        </div>
      </div>
    </AppShell>
  );
}
