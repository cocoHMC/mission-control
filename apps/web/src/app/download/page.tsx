import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { DownloadClient } from '@/app/download/downloadClient';

export const dynamic = 'force-dynamic';

export default function DownloadPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="Downloads" subtitle="Pick the right native installer for your device." density="compact" />
        <div className="min-h-0 flex-1">
          <DownloadClient />
        </div>
      </div>
    </AppShell>
  );
}

