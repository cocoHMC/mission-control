import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { DoctorClient } from '@/app/openclaw/doctor/doctorClient';

export const dynamic = 'force-dynamic';

export default function OpenClawDoctorPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Doctor" subtitle="Diagnostics and quick fixes. Run read-only first; apply fixes only when needed." />
      <div className="mt-4 sm:mt-8">
        <DoctorClient />
      </div>
    </AppShell>
  );
}

