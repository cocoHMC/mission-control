import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { SecurityClient } from '@/app/openclaw/security/securityClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSecurityPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Security" subtitle="Audit common foot-guns and harden your gateway." />
      <div className="mt-4 sm:mt-8">
        <SecurityClient />
      </div>
    </AppShell>
  );
}

