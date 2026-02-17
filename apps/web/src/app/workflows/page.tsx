import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { pbFetch } from '@/lib/pbServer';
import type { PBList, Workflow, WorkflowRun } from '@/lib/types';
import { WorkflowsClient } from '@/app/workflows/workflowsClient';

export const dynamic = 'force-dynamic';

async function getWorkflows() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'name' });
  return pbFetch<PBList<Workflow>>(`/api/collections/workflows/records?${q.toString()}`);
}

async function getRuns() {
  const q = new URLSearchParams({ page: '1', perPage: '50', sort: '-createdAt' });
  return pbFetch<PBList<WorkflowRun>>(`/api/collections/workflow_runs/records?${q.toString()}`);
}

export default async function WorkflowsPage() {
  const [workflows, runs] = await Promise.all([getWorkflows(), getRuns()]);
  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar
          title="Workflows"
          subtitle="Runbooks and Lobster pipelines that execute repeatable ops."
          density="compact"
        />
        <div className="min-h-0 flex-1">
          <WorkflowsClient initialWorkflows={workflows.items ?? []} initialRuns={runs.items ?? []} />
        </div>
      </div>
    </AppShell>
  );
}

