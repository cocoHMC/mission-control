import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { DoctorClient } from '@/app/openclaw/doctor/doctorClient';

export const dynamic = 'force-dynamic';

export default function OpenClawDoctorPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="OpenClaw Doctor"
          subtitle="Diagnostics and quick fixes. Run read-only first; apply fixes only when needed."
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <DoctorClient />
        </div>
      </div>
    </AppShell>
  );
}
