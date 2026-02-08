import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ModelsClient } from '@/app/openclaw/models/modelsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawModelsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Models" subtitle="Default model, fallbacks, and auth health." density="compact" />
        <div className="min-h-0 flex-1">
          <ModelsClient />
        </div>
      </div>
    </AppShell>
  );
}
