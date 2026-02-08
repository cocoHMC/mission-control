import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ApprovalsClient } from '@/app/openclaw/approvals/approvalsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawApprovalsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Approvals" subtitle="Manage exec allowlists (token-safe)." density="compact" />
        <div className="min-h-0 flex-1">
          <ApprovalsClient />
        </div>
      </div>
    </AppShell>
  );
}
