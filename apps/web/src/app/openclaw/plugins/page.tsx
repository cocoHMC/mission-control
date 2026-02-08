import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { PluginsClient } from '@/app/openclaw/plugins/pluginsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawPluginsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Plugins" subtitle="Bundled extensions that add providers, channels, tools, and hooks." density="compact" />
        <div className="min-h-0 flex-1">
          <PluginsClient />
        </div>
      </div>
    </AppShell>
  );
}
