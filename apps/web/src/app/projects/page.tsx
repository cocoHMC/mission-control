import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Badge } from '@/components/ui/badge';
import { pbFetch } from '@/lib/pbServer';
import type { PBList, Project, ProjectStatusUpdate, Workspace } from '@/lib/types';
import { ProjectsClient } from '@/app/projects/ProjectsClient';

export const dynamic = 'force-dynamic';

async function getProjects() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' });
  try {
    return await pbFetch<PBList<Project>>(`/api/collections/projects/records?${q.toString()}`);
  } catch {
    return { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 1 } as PBList<Project>;
  }
}

async function getStatusUpdates() {
  const q = new URLSearchParams({ page: '1', perPage: '400', sort: '-createdAt' });
  try {
    return await pbFetch<PBList<ProjectStatusUpdate>>(`/api/collections/project_status_updates/records?${q.toString()}`);
  } catch {
    return { items: [], page: 1, perPage: 400, totalItems: 0, totalPages: 1 } as PBList<ProjectStatusUpdate>;
  }
}

async function getWorkspaces() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' });
  try {
    return await pbFetch<PBList<Workspace>>(`/api/collections/workspaces/records?${q.toString()}`);
  } catch {
    return { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 1 } as PBList<Workspace>;
  }
}

function pickString(value: string | string[] | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) return value[0] || '';
  return value;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = (await searchParams) ?? {};
  const workspaceFilter = pickString(resolved.workspace).trim();
  const [projects, statusUpdates, workspaces] = await Promise.all([getProjects(), getStatusUpdates(), getWorkspaces()]);

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="Projects"
          subtitle="Asana-style work buckets with automation controls and status reporting inside Mission Control."
          rightSlot={<Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Scope: Mission Control</Badge>}
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <ProjectsClient
            initialProjects={projects.items || []}
            initialStatusUpdates={statusUpdates.items || []}
            initialWorkspaces={workspaces.items || []}
            initialWorkspaceFilter={workspaceFilter}
          />
        </div>
      </div>
    </AppShell>
  );
}
