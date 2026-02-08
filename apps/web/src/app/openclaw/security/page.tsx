import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { SecurityClient } from '@/app/openclaw/security/securityClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSecurityPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Security" subtitle="Audit common foot-guns and harden your gateway." density="compact" />
        <div className="min-h-0 flex-1">
          <SecurityClient />
        </div>
      </div>
    </AppShell>
  );
}
