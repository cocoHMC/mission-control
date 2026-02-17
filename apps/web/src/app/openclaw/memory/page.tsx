import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { MemoryClient } from '@/app/openclaw/memory/memoryClient';

export const dynamic = 'force-dynamic';

export default function OpenClawMemoryPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Memory" subtitle="Inspect and search agent memory via the gateway." density="compact" />
        <div className="min-h-0 flex-1">
          <MemoryClient />
        </div>
      </div>
    </AppShell>
  );
}

