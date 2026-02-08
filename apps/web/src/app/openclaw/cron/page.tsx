import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { CronClient } from '@/app/openclaw/cron/cronClient';

export const dynamic = 'force-dynamic';

export default function OpenClawCronPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Cron" subtitle="Scheduled jobs that wake agents (use sparingly)." density="compact" />
        <div className="min-h-0 flex-1">
          <CronClient />
        </div>
      </div>
    </AppShell>
  );
}
