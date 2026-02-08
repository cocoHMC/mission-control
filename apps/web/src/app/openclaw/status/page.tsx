import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { StatusClient } from '@/app/openclaw/status/statusClient';

export const dynamic = 'force-dynamic';

export default function OpenClawStatusPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="OpenClaw Status"
          subtitle="Token usage, sessions, heartbeats, and channel health (deterministic, no LLM polling)."
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <StatusClient />
        </div>
      </div>
    </AppShell>
  );
}
