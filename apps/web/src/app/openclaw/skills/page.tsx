import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { SkillsClient } from '@/app/openclaw/skills/skillsClient';

export const dynamic = 'force-dynamic';

export default function OpenClawSkillsPage() {
  return (
    <AppShell>
      <Topbar title="OpenClaw Skills" subtitle="Discover installed skills and missing requirements." />
      <div className="mt-4 sm:mt-8">
        <SkillsClient />
      </div>
    </AppShell>
  );
}

