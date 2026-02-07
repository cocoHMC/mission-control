import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { PluginsClient } from '@/app/openclaw/plugins/pluginsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawPluginsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Plugins" subtitle="Bundled extensions that add providers, channels, tools, and hooks." />
      <div className="mt-4 sm:mt-8">
        <PluginsClient />
      </div>
    </AppShell>
  );
}

