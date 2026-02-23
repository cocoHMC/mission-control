import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { PBList, Project, UsageEvent } from '@/lib/types';
import { UsageClient } from '@/app/usage/UsageClient';

export const dynamic = 'force-dynamic';

async function getProjects() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' });
  try {
    return await pbFetch<PBList<Project>>(`/api/collections/projects/records?${q.toString()}`);
  } catch {
    return { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 1 } as PBList<Project>;
  }
}

async function getRecentUsageEvents() {
  const q = new URLSearchParams({ page: '1', perPage: '120', sort: '-ts' });
  try {
    return await pbFetch<PBList<UsageEvent>>(`/api/collections/usage_events/records?${q.toString()}`);
  } catch {
    return { items: [], page: 1, perPage: 120, totalItems: 0, totalPages: 1 } as PBList<UsageEvent>;
  }
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialProjectId = typeof params?.project === 'string' ? params.project.trim() : '';
  const [projects, events] = await Promise.all([getProjects(), getRecentUsageEvents()]);

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="Usage" subtitle="Token burn, estimated spend, and budget health." density="compact" />
        <div className="min-h-0 flex-1">
          <UsageClient
            initialProjects={projects.items || []}
            initialEvents={events.items || []}
            initialProjectId={initialProjectId}
          />
        </div>
      </div>
    </AppShell>
  );
}
