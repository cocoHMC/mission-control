import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { OpsClient } from '@/app/ops/opsClient';

export const dynamic = 'force-dynamic';

export default function OpsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="Ops" subtitle="End-to-end health across Mission Control, PocketBase, OpenClaw, and workflows." density="compact" />
        <div className="min-h-0 flex-1">
          <OpsClient />
        </div>
      </div>
    </AppShell>
  );
}

