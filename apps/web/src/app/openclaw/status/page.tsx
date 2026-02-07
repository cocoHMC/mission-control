import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { StatusClient } from '@/app/openclaw/status/statusClient';

export const dynamic = 'force-dynamic';

export default function OpenClawStatusPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Status" subtitle="Token usage, sessions, heartbeats, and channel health (deterministic, no LLM polling)." />
      <div className="mt-4 sm:mt-8">
        <StatusClient />
      </div>
    </AppShell>
  );
}

