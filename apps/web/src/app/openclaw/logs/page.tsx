import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { LogsClient } from '@/app/openclaw/logs/logsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawLogsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="OpenClaw Logs"
          subtitle="Tail recent gateway logs (redacted). Useful for debugging connectivity and channels."
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <LogsClient />
        </div>
      </div>
    </AppShell>
  );
}
