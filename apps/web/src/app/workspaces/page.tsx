import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Badge } from '@/components/ui/badge';
import { pbFetch } from '@/lib/pbServer';
import type { PBList, Project, Workspace } from '@/lib/types';
import { WorkspacesClient } from '@/app/workspaces/WorkspacesClient';

export const dynamic = 'force-dynamic';

async function getWorkspaces() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' });
  try {
    return await pbFetch<PBList<Workspace>>(`/api/collections/workspaces/records?${q.toString()}`);
  } catch {
    return { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 1 } as PBList<Workspace>;
  }
}

async function getProjects() {
  const q = new URLSearchParams({ page: '1', perPage: '400', sort: '-updatedAt' });
  try {
    return await pbFetch<PBList<Project>>(`/api/collections/projects/records?${q.toString()}`);
  } catch {
    return { items: [], page: 1, perPage: 400, totalItems: 0, totalPages: 1 } as PBList<Project>;
  }
}

export default async function WorkspacesPage() {
  const [workspaces, projects] = await Promise.all([getWorkspaces(), getProjects()]);

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="Mission Control Workspaces"
          subtitle="Group projects into operating domains for Mission Control. These do not set OpenClaw filesystem workspace paths."
          rightSlot={<Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Scope: Mission Control</Badge>}
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <WorkspacesClient initialWorkspaces={workspaces.items || []} initialProjects={projects.items || []} />
        </div>
      </div>
    </AppShell>
  );
}
