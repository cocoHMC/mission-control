import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { OpenClawConfigClient } from '@/app/openclaw/OpenClawConfigClient';

export const dynamic = 'force-dynamic';

export default function OpenClawConfigPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Config" subtitle="Advanced: review and apply full gateway configuration changes." />
      <div className="mt-4 sm:mt-8">
        <OpenClawConfigClient />
      </div>
    </AppShell>
  );
}

