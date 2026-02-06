import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { OpenClawOverviewClient } from '@/app/openclaw/OpenClawOverviewClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSettingsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw" subtitle="Gateway status, models, security, approvals, and sessions." />
      <div className="mt-4 sm:mt-8">
        <OpenClawOverviewClient />
      </div>
    </AppShell>
  );
}
