import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { CronClient } from '@/app/openclaw/cron/cronClient';

export const dynamic = 'force-dynamic';

export default function OpenClawCronPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Cron" subtitle="Scheduled jobs that wake agents (use sparingly)." />
      <div className="mt-4 sm:mt-8">
        <CronClient />
      </div>
    </AppShell>
  );
}

