import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ApprovalsClient } from '@/app/openclaw/approvals/approvalsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawApprovalsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Approvals" subtitle="Manage exec allowlists (token-safe)." />
      <div className="mt-4 sm:mt-8">
        <ApprovalsClient />
      </div>
    </AppShell>
  );
}

