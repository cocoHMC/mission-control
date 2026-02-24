'use client';

import * as React from 'react';
import Link from 'next/link';
import { Layers3, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mcFetch } from '@/lib/clientApi';
import type { Project, Workspace } from '@/lib/types';
import { formatShortDate } from '@/lib/utils';

type Props = {
  initialWorkspaces: Workspace[];
  initialProjects: Project[];
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function WorkspacesClient({ initialWorkspaces, initialProjects }: Props) {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>(initialWorkspaces || []);
  const [projects, setProjects] = React.useState<Project[]>(initialProjects || []);
  const [loading, setLoading] = React.useState(false);

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [openclawWorkspacePath, setOpenclawWorkspacePath] = React.useState('');
  const [syncingOpenClaw, setSyncingOpenClaw] = React.useState(false);
  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  const projectsByWorkspace = React.useMemo(() => {
    const out = new Map<string, Project[]>();
    for (const project of projects) {
      const workspaceId = String(project.workspaceId || '').trim();
      if (!workspaceId) continue;
      const list = out.get(workspaceId) || [];
      list.push(project);
      out.set(workspaceId, list);
    }
    return out;
  }, [projects]);

  async function refresh() {
    setLoading(true);
    try {
      const [workspaceRes, projectsRes] = await Promise.all([
        mcFetch(`/api/workspaces?${new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' }).toString()}`, {
          cache: 'no-store',
        }),
        mcFetch(`/api/projects?${new URLSearchParams({ page: '1', perPage: '400', sort: '-updatedAt' }).toString()}`, {
          cache: 'no-store',
        }),
      ]);
      const workspaceJson = await workspaceRes.json().catch(() => null);
      const projectsJson = await projectsRes.json().catch(() => null);
      if (workspaceRes.ok) setWorkspaces(Array.isArray(workspaceJson?.items) ? (workspaceJson.items as Workspace[]) : []);
      if (projectsRes.ok) setProjects(Array.isArray(projectsJson?.items) ? (projectsJson.items as Project[]) : []);
    } finally {
      setLoading(false);
    }
  }

  async function syncFromOpenClaw(seedWhenEmptyOnly = false) {
    setSyncingOpenClaw(true);
    setSyncFeedback(null);
    try {
      const res = await mcFetch('/api/workspaces/sync-openclaw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedWhenEmptyOnly }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSyncFeedback(String(json?.error || 'OpenClaw sync failed.'));
        return;
      }

      const createdCount = Array.isArray(json?.createdWorkspaceIds) ? json.createdWorkspaceIds.length : 0;
      const connected = Boolean(json?.connected);
      const syncErrors = Array.isArray(json?.errors) ? json.errors.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [];
      if (!connected) {
        setSyncFeedback(syncErrors[0] ? `OpenClaw sync unavailable: ${syncErrors[0]}` : 'OpenClaw workspace paths were not detected.');
      } else if (createdCount > 0) {
        setSyncFeedback(`Imported ${createdCount} workspace${createdCount === 1 ? '' : 's'} from OpenClaw.`);
      } else {
        setSyncFeedback(syncErrors[0] || 'Mission Control workspaces are already synced with OpenClaw paths.');
      }
      await refresh();
    } finally {
      setSyncingOpenClaw(false);
    }
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const res = await mcFetch('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: trimmedName,
        slug: normalizeSlug(slug || trimmedName),
        description: description.trim(),
        openclawWorkspacePath: openclawWorkspacePath.trim(),
      }),
    });
    if (!res.ok) return;

    setName('');
    setSlug('');
    setDescription('');
    setOpenclawWorkspacePath('');
    await refresh();
  }

  async function patchWorkspace(id: string, patch: Record<string, unknown>) {
    const res = await mcFetch(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as Workspace | null;
    if (!json || typeof json !== 'object') return;
    setWorkspaces((prev) => prev.map((workspace) => (workspace.id === id ? json : workspace)));
  }

  async function deleteWorkspace(id: string) {
    if (!window.confirm('Delete this Mission Control workspace? Projects are detached, not deleted.')) return;
    const res = await mcFetch(`/api/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) return;
    setWorkspaces((prev) => prev.filter((workspace) => workspace.id !== id));
    setProjects((prev) => prev.map((project) => (String(project.workspaceId || '').trim() === id ? { ...project, workspaceId: '' } : project)));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Scope: Mission Control</Badge>
          <span>Workspaces here group projects, boards, and budgets in Mission Control, and can link to OpenClaw filesystem workspaces.</span>
        </div>
        <div className="mt-2">
          OpenClaw workspace defaults are managed in{' '}
          <Link href="/agents" className="font-medium underline">
            Agents
          </Link>
          . Use sync to import paths into Mission Control workspace records.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void syncFromOpenClaw(false)} disabled={syncingOpenClaw}>
            <Link2 className="mr-2 h-4 w-4" />
            {syncingOpenClaw ? 'Syncing OpenClaw…' : 'Sync from OpenClaw'}
          </Button>
          {syncFeedback ? <span className="text-[11px] text-muted">{syncFeedback}</span> : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[380px_1fr]">
        <form onSubmit={createWorkspace} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Layers3 className="h-4 w-4" />
            New Mission Control workspace
          </div>
          <div className="mt-2 text-xs text-muted">
            Use Mission Control workspaces to separate business units, product lines, or deployment environments.
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-muted">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-2" placeholder="Growth Ops" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-muted">Slug</label>
              <Input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="mt-2"
                placeholder="growth-ops"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-muted">Description</label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-2"
                placeholder="What this Mission Control workspace owns, and how teams should run it."
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-muted">Linked OpenClaw workspace path (optional)</label>
              <Input
                value={openclawWorkspacePath}
                onChange={(event) => setOpenclawWorkspacePath(event.target.value)}
                className="mt-2"
                placeholder="~/.openclaw/workspace"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Create workspace
            </Button>
            <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </form>

        <div className="min-h-0 overflow-auto pr-1 mc-scroll">
          <div className="space-y-2">
            {workspaces.map((workspace) => {
              const linked = projectsByWorkspace.get(workspace.id) || [];
              return (
                <div key={workspace.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{workspace.name || workspace.id}</div>
                      <div className="mt-1 text-xs text-muted">{workspace.description || 'No description.'}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{linked.length} projects</Badge>
                        {workspace.slug ? <span className="font-mono text-muted">{workspace.slug}</span> : null}
                        {workspace.openclawWorkspacePath ? (
                          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                            OC: {workspace.openclawWorkspacePath}
                          </Badge>
                        ) : null}
                        {workspace.archived ? (
                          <Badge className="border-none bg-red-600 text-white">archived</Badge>
                        ) : (
                          <Badge className="border-none bg-emerald-600 text-white">active</Badge>
                        )}
                        {workspace.updatedAt ? <span className="text-muted">updated {formatShortDate(workspace.updatedAt)}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/projects?workspace=${encodeURIComponent(workspace.id)}`}
                        className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium"
                      >
                        Open projects
                      </Link>
                      <select
                        className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                        value={workspace.archived ? 'archived' : 'active'}
                        onChange={(event) =>
                          void patchWorkspace(workspace.id, {
                            archived: event.target.value === 'archived',
                          })
                        }
                      >
                        <option value="active">active</option>
                        <option value="archived">archived</option>
                      </select>
                      <Button type="button" size="sm" variant="destructive" onClick={() => void deleteWorkspace(workspace.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <form
                    className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void patchWorkspace(workspace.id, {
                        name: String(data.get('name') || '').trim(),
                        slug: normalizeSlug(String(data.get('slug') || '')),
                        description: String(data.get('description') || '').trim(),
                        openclawWorkspacePath: String(data.get('openclawWorkspacePath') || '').trim(),
                      });
                    }}
                  >
                    <Input name="name" defaultValue={workspace.name || ''} placeholder="Mission Control workspace name" className="h-9" />
                    <Input name="slug" defaultValue={workspace.slug || ''} placeholder="slug" className="h-9" />
                    <Input
                      name="openclawWorkspacePath"
                      defaultValue={workspace.openclawWorkspacePath || ''}
                      placeholder="OpenClaw workspace path"
                      className="h-9"
                    />
                    <Button type="submit" size="sm" variant="secondary" className="h-9">
                      Save
                    </Button>
                    <Textarea
                      name="description"
                      defaultValue={workspace.description || ''}
                      placeholder="Mission Control workspace description"
                      className="md:col-span-4"
                    />
                  </form>

                  {linked.length ? (
                    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Projects in this MC workspace</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {linked.slice(0, 10).map((project) => (
                          <Link
                            key={project.id}
                            href={`/tasks?project=${encodeURIComponent(project.id)}`}
                            className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1"
                          >
                            {project.name || project.id}
                          </Link>
                        ))}
                        {linked.length > 10 ? <span className="text-muted">+{linked.length - 10} more</span> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!workspaces.length ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-muted">
                <div>No Mission Control workspaces yet.</div>
                <div className="mt-2 text-xs">Connect OpenClaw and run sync to import workspace paths automatically.</div>
                <div className="mt-3">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void syncFromOpenClaw(false)} disabled={syncingOpenClaw}>
                    <Link2 className="mr-2 h-4 w-4" />
                    {syncingOpenClaw ? 'Syncing OpenClaw…' : 'Sync from OpenClaw'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
