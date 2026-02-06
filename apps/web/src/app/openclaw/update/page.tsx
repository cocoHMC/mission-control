import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { UpdateClient } from '@/app/openclaw/update/updateClient';

export const dynamic = 'force-dynamic';

export default function OpenClawUpdatePage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Update" subtitle="Check for updates and switch channels (stable/beta/dev)." />
      <div className="mt-4 sm:mt-8">
        <UpdateClient />
      </div>
    </AppShell>
  );
}

