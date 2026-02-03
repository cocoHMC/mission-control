import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { OpenClawConfigClient } from '@/app/openclaw/OpenClawConfigClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSettingsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw" subtitle="Review and apply gateway configuration changes." />
      <div className="mt-8">
        <OpenClawConfigClient />
      </div>
    </AppShell>
  );
}
