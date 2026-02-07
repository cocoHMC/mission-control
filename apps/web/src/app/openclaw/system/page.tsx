import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { SystemClient } from '@/app/openclaw/system/systemClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSystemPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw System" subtitle="Presence and heartbeat controls (use heartbeats carefully to avoid token burn)." />
      <div className="mt-4 sm:mt-8">
        <SystemClient />
      </div>
    </AppShell>
  );
}

