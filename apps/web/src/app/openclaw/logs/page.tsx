import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { LogsClient } from '@/app/openclaw/logs/logsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawLogsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Logs" subtitle="Tail recent gateway logs (redacted). Useful for debugging connectivity and channels." />
      <div className="mt-4 sm:mt-8">
        <LogsClient />
      </div>
    </AppShell>
  );
}

