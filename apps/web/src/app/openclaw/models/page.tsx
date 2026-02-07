import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ModelsClient } from '@/app/openclaw/models/modelsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawModelsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Models" subtitle="Default model, fallbacks, and auth health." />
      <div className="mt-4 sm:mt-8">
        <ModelsClient />
      </div>
    </AppShell>
  );
}

