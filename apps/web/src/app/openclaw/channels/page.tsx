import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { ChannelsClient } from '@/app/openclaw/channels/channelsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawChannelsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Channels" subtitle="Connected chat channels (iMessage, Telegram, Slack, etc.) and their health." />
      <div className="mt-4 sm:mt-8">
        <ChannelsClient />
      </div>
    </AppShell>
  );
}

