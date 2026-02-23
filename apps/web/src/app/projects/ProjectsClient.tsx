'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderPlus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { mcFetch } from '@/lib/clientApi';
import type { Project, ProjectStatusUpdate, Workspace } from '@/lib/types';
import { formatShortDate } from '@/lib/utils';

type ProjectsClientProps = {
  initialProjects: Project[];
  initialStatusUpdates: ProjectStatusUpdate[];
  initialWorkspaces: Workspace[];
  initialWorkspaceFilter?: string;
};

const MODES = ['manual', 'supervised', 'autopilot'] as const;
const STATUSES = ['active', 'paused', 'archived'] as const;
const STATUS_LEVELS = ['on_track', 'at_risk', 'off_track'] as const;

type StatusDraft = {
  status: 'on_track' | 'at_risk' | 'off_track';
  summary: string;
  highlights: string;
  risks: string;
  nextSteps: string;
};

function parseNonNegativeNumber(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseWarnPct(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(100, n));
}

function makeDefaultDraft(): StatusDraft {
  return {
    status: 'on_track',
    summary: '',
    highlights: '',
    risks: '',
    nextSteps: '',
  };
}

export function ProjectsClient({
  initialProjects,
  initialStatusUpdates,
  initialWorkspaces,
  initialWorkspaceFilter = '',
}: ProjectsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = React.useState<Project[]>(initialProjects || []);
  const [statusUpdates, setStatusUpdates] = React.useState<ProjectStatusUpdate[]>(initialStatusUpdates || []);
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>(initialWorkspaces || []);
  const [statusDraftByProject, setStatusDraftByProject] = React.useState<Record<string, StatusDraft>>({});
  const [loading, setLoading] = React.useState(false);
  const [workspaceFilter, setWorkspaceFilter] = React.useState(initialWorkspaceFilter);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [workspaceId, setWorkspaceId] = React.useState('');
  const [mode, setMode] = React.useState<Project['mode']>('supervised');
  const [status, setStatus] = React.useState<Project['status']>('active');
  const [dailyBudgetUsd, setDailyBudgetUsd] = React.useState('');
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = React.useState('');
  const [budgetWarnPct, setBudgetWarnPct] = React.useState('90');

  const updatesByProject = React.useMemo(() => {
    const map = new Map<string, ProjectStatusUpdate[]>();
    for (const update of statusUpdates) {
      const projectId = String(update?.projectId || '').trim();
      if (!projectId) continue;
      const arr = map.get(projectId) || [];
      arr.push(update);
      map.set(projectId, arr);
    }
    return map;
  }, [statusUpdates]);

  const workspaceNameById = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const workspace of workspaces) {
      const id = String(workspace.id || '').trim();
      if (!id) continue;
      out.set(id, String(workspace.name || id));
    }
    return out;
  }, [workspaces]);

  const filteredProjects = React.useMemo(() => {
    const selected = String(workspaceFilter || '').trim();
    if (!selected) return projects;
    return projects.filter((project) => String(project.workspaceId || '').trim() === selected);
  }, [projects, workspaceFilter]);

  const updateWorkspaceFilter = React.useCallback(
    (nextWorkspaceId: string) => {
      const value = String(nextWorkspaceId || '').trim();
      setWorkspaceFilter(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set('workspace', value);
      else params.delete('workspace');
      const qs = params.toString();
      router.replace(qs ? `/projects?${qs}` : '/projects', { scroll: false });
    },
    [router, searchParams]
  );

  React.useEffect(() => {
    const selected = String(searchParams.get('workspace') || '').trim();
    if (selected !== workspaceFilter) setWorkspaceFilter(selected);
  }, [searchParams, workspaceFilter]);

  React.useEffect(() => {
    if (!workspaceFilter) return;
    setWorkspaceId((prev) => (prev ? prev : workspaceFilter));
  }, [workspaceFilter]);

  React.useEffect(() => {
    if (!workspaceFilter) return;
    if (workspaceNameById.has(workspaceFilter)) return;
    updateWorkspaceFilter('');
  }, [workspaceFilter, workspaceNameById, updateWorkspaceFilter]);

  function getStatusDraft(projectId: string): StatusDraft {
    return statusDraftByProject[projectId] || makeDefaultDraft();
  }

  function patchStatusDraft(projectId: string, patch: Partial<StatusDraft>) {
    setStatusDraftByProject((prev) => {
      const current = prev[projectId] || makeDefaultDraft();
      return {
        ...prev,
        [projectId]: { ...current, ...patch },
      };
    });
  }

  async function refresh() {
    setLoading(true);
    try {
      const [projectsRes, updatesRes, workspacesRes] = await Promise.all([
        mcFetch(`/api/projects?${new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' }).toString()}`, {
          cache: 'no-store',
        }),
        mcFetch(
          `/api/project-status-updates?${new URLSearchParams({ page: '1', perPage: '400', sort: '-createdAt' }).toString()}`,
          { cache: 'no-store' }
        ),
        mcFetch(`/api/workspaces?${new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' }).toString()}`, {
          cache: 'no-store',
        }),
      ]);
      const projectsJson = await projectsRes.json().catch(() => null);
      const updatesJson = await updatesRes.json().catch(() => null);
      const workspacesJson = await workspacesRes.json().catch(() => null);
      if (projectsRes.ok) setProjects(Array.isArray(projectsJson?.items) ? (projectsJson.items as Project[]) : []);
      if (updatesRes.ok) setStatusUpdates(Array.isArray(updatesJson?.items) ? (updatesJson.items as ProjectStatusUpdate[]) : []);
      if (workspacesRes.ok) setWorkspaces(Array.isArray(workspacesJson?.items) ? (workspacesJson.items as Workspace[]) : []);
    } finally {
      setLoading(false);
    }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const parsedDaily = parseNonNegativeNumber(dailyBudgetUsd);
    const parsedMonthly = parseNonNegativeNumber(monthlyBudgetUsd);
    const parsedWarn = parseWarnPct(budgetWarnPct);
    const res = await mcFetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        workspaceId: workspaceId.trim(),
        description: description.trim(),
        mode,
        status,
        dailyBudgetUsd: parsedDaily,
        monthlyBudgetUsd: parsedMonthly,
        budgetWarnPct: parsedWarn ?? 90,
      }),
    });
    if (!res.ok) return;
    setName('');
    setDescription('');
    setWorkspaceId('');
    setMode('supervised');
    setStatus('active');
    setDailyBudgetUsd('');
    setMonthlyBudgetUsd('');
    setBudgetWarnPct('90');
    await refresh();
  }

  async function patchProject(id: string, patch: Record<string, unknown>) {
    const res = await mcFetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function createStatusUpdate(projectId: string) {
    const draft = getStatusDraft(projectId);
    const summary = draft.summary.trim();
    if (!summary) return;
    const res = await mcFetch('/api/project-status-updates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        status: draft.status,
        summary,
        highlights: draft.highlights.trim(),
        risks: draft.risks.trim(),
        nextSteps: draft.nextSteps.trim(),
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return;
    if (!json || typeof json !== 'object') return;
    const created = json as ProjectStatusUpdate;
    setStatusUpdates((prev) => [created, ...prev]);
    setStatusDraftByProject((prev) => ({
      ...prev,
      [projectId]: {
        ...makeDefaultDraft(),
        status: draft.status,
      },
    }));
  }

  async function deleteProject(id: string) {
    if (!window.confirm('Delete this project? Tasks keep their projectId value until reassigned.')) return;
    const res = await mcFetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="uppercase tracking-[0.2em]">Workspace filter</span>
          <select
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs text-[var(--foreground)]"
            value={workspaceFilter}
            onChange={(event) => updateWorkspaceFilter(event.target.value)}
          >
            <option value="">All workspaces</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name || workspace.id}
              </option>
            ))}
          </select>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            {filteredProjects.length} visible
          </Badge>
        </div>
        <Link href="/workspaces" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium">
          Manage workspaces
        </Link>
      </div>

      <form onSubmit={createProject} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderPlus className="h-4 w-4" />
          New project
        </div>
        <div className="mt-2 text-xs text-muted">
          Mode policy: <span className="font-medium">manual</span> blocks schedule/trigger automation, <span className="font-medium">supervised</span> and <span className="font-medium">autopilot</span> allow it.
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2" placeholder="Ops Control Tower" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Workspace</label>
            <select
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              <option value="">No workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name || workspace.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Mode</label>
            <select
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as Project['mode'])}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Status</label>
            <select
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as Project['status'])}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-2"
              placeholder="What this project owns and how work should be run."
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Daily budget (USD)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={dailyBudgetUsd}
              onChange={(e) => setDailyBudgetUsd(e.target.value)}
              className="mt-2"
              placeholder="25"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Monthly budget (USD)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={monthlyBudgetUsd}
              onChange={(e) => setMonthlyBudgetUsd(e.target.value)}
              className="mt-2"
              placeholder="500"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Alert threshold (%)</label>
            <Input
              type="number"
              min="1"
              max="100"
              step="1"
              value={budgetWarnPct}
              onChange={(e) => setBudgetWarnPct(e.target.value)}
              className="mt-2"
              placeholder="90"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit">Create project</Button>
          <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-auto mc-scroll">
        <div className="space-y-2 pr-1">
          {filteredProjects.map((project) => {
            const projectUpdates = updatesByProject.get(project.id) || [];
            const latestStatus = projectUpdates[0] || null;
            const statusDraft = getStatusDraft(project.id);
            const workspaceName = workspaceNameById.get(String(project.workspaceId || '').trim()) || '';
            return (
            <div key={project.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{project.name || project.id}</div>
                  <div className="mt-1 text-xs text-muted">{project.description || 'No description.'}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                      {project.mode || 'supervised'}
                    </Badge>
                    <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                      {project.status || (project.archived ? 'archived' : 'active')}
                    </Badge>
                    {Number(project.dailyBudgetUsd || 0) > 0 ? (
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                        daily ${Number(project.dailyBudgetUsd || 0).toFixed(2)}
                      </Badge>
                    ) : null}
                    {Number(project.monthlyBudgetUsd || 0) > 0 ? (
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                        month ${Number(project.monthlyBudgetUsd || 0).toFixed(2)}
                      </Badge>
                    ) : null}
                    {project.slug ? <span className="font-mono text-muted">{project.slug}</span> : null}
                    {workspaceName ? (
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{workspaceName}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/tasks?project=${encodeURIComponent(project.id)}`}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium"
                  >
                    Open tasks
                  </Link>
                  <Link
                    href={`/usage?project=${encodeURIComponent(project.id)}`}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium"
                  >
                    Usage
                  </Link>
                  <select
                    className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                    value={String(project.workspaceId || '').trim()}
                    onChange={(e) =>
                      void patchProject(project.id, {
                        workspaceId: e.target.value,
                      })
                    }
                  >
                    <option value="">no workspace</option>
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name || workspace.id}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                    value={project.mode || 'supervised'}
                    onChange={(e) => void patchProject(project.id, { mode: e.target.value })}
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                    value={project.status || 'active'}
                    onChange={(e) =>
                      void patchProject(project.id, {
                        status: e.target.value,
                        archived: e.target.value === 'archived',
                      })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="destructive" onClick={() => void deleteProject(project.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              <form
                className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const nextDaily = parseNonNegativeNumber(String(data.get('dailyBudgetUsd') || ''));
                  const nextMonthly = parseNonNegativeNumber(String(data.get('monthlyBudgetUsd') || ''));
                  const nextWarn = parseWarnPct(String(data.get('budgetWarnPct') || ''));
                  void patchProject(project.id, {
                    dailyBudgetUsd: nextDaily,
                    monthlyBudgetUsd: nextMonthly,
                    budgetWarnPct: nextWarn ?? 90,
                  });
                }}
              >
                <Input
                  name="dailyBudgetUsd"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={project.dailyBudgetUsd != null ? String(project.dailyBudgetUsd) : ''}
                  placeholder="Daily budget USD"
                  className="h-9"
                />
                <Input
                  name="monthlyBudgetUsd"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={project.monthlyBudgetUsd != null ? String(project.monthlyBudgetUsd) : ''}
                  placeholder="Monthly budget USD"
                  className="h-9"
                />
                <Input
                  name="budgetWarnPct"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  defaultValue={project.budgetWarnPct != null ? String(project.budgetWarnPct) : '90'}
                  placeholder="Alert %"
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="secondary" className="h-9">
                  Save budgets
                </Button>
              </form>
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Status update</div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{projectUpdates.length} updates</span>
                    {latestStatus?.createdAt ? <span>latest {formatShortDate(String(latestStatus.createdAt))}</span> : null}
                  </div>
                </div>
                {latestStatus ? (
                  <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                        {String(latestStatus.status || 'on_track')}
                      </Badge>
                      {latestStatus.autoGenerated ? (
                        <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">auto</Badge>
                      ) : null}
                    </div>
                    {latestStatus.summary ? <div className="mt-2 text-sm">{latestStatus.summary}</div> : null}
                    {latestStatus.highlights ? <div className="mt-2 text-muted">Highlights: {latestStatus.highlights}</div> : null}
                    {latestStatus.risks ? <div className="mt-1 text-muted">Risks: {latestStatus.risks}</div> : null}
                    {latestStatus.nextSteps ? <div className="mt-1 text-muted">Next: {latestStatus.nextSteps}</div> : null}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted">No status updates yet.</div>
                )}
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createStatusUpdate(project.id);
                  }}
                >
                  <select
                    className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                    value={statusDraft.status}
                    onChange={(event) =>
                      patchStatusDraft(project.id, {
                        status: event.target.value as StatusDraft['status'],
                      })
                    }
                  >
                    {STATUS_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={statusDraft.summary}
                    onChange={(event) => patchStatusDraft(project.id, { summary: event.target.value })}
                    placeholder="Summary (required)"
                    className="h-9"
                  />
                  <Input
                    value={statusDraft.highlights}
                    onChange={(event) => patchStatusDraft(project.id, { highlights: event.target.value })}
                    placeholder="Highlights (optional)"
                    className="h-9"
                  />
                  <Input
                    value={statusDraft.risks}
                    onChange={(event) => patchStatusDraft(project.id, { risks: event.target.value })}
                    placeholder="Risks (optional)"
                    className="h-9"
                  />
                  <Input
                    value={statusDraft.nextSteps}
                    onChange={(event) => patchStatusDraft(project.id, { nextSteps: event.target.value })}
                    placeholder="Next steps (optional)"
                    className="h-9"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Post status update
                  </Button>
                </form>
              </div>
            </div>
            );
          })}
          {!filteredProjects.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-muted">
              {workspaceFilter ? 'No projects in this workspace yet.' : 'No projects yet.'}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
