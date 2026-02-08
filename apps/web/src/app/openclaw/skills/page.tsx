import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { SkillsClient } from '@/app/openclaw/skills/skillsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSkillsPage() {
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="OpenClaw Skills" subtitle="Discover installed skills and missing requirements." density="compact" />
        <div className="min-h-0 flex-1">
          <SkillsClient />
        </div>
      </div>
    </AppShell>
  );
}
