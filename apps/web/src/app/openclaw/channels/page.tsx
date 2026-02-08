import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ChannelsClient } from '@/app/openclaw/channels/channelsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawChannelsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="OpenClaw Channels"
          subtitle="Connected chat channels (iMessage, Telegram, Slack, etc.) and their health."
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <ChannelsClient />
        </div>
      </div>
    </AppShell>
  );
}
