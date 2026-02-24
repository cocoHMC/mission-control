import path from 'node:path';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { pbFetch } from '@/lib/pbServer';
import type { PBList, Workspace } from '@/lib/types';

type OpenClawWorkspaceProbe = {
  connected: boolean;
  defaultPath: string;
  agentPaths: string[];
  candidatePaths: string[];
  errors: string[];
};

export type OpenClawWorkspaceSyncResult = {
  connected: boolean;
  defaultPath: string;
  candidatePaths: string[];
  createdWorkspaceIds: string[];
  linkedWorkspaceId: string;
  errors: string[];
};

function normalizeWorkspacePath(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const stripped = raw
    .replace(/^"(.*)"$/, '$1')
    .replace(/^'(.*)'$/, '$1')
    .trim();
  return stripped;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseScalarStdout(stdout: string) {
  const lines = String(stdout || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  const last = lines[lines.length - 1] || '';
  if (!last || last === 'null' || last === 'undefined') return '';
  const maybeJson = parseJson(last);
  if (typeof maybeJson === 'string') return normalizeWorkspacePath(maybeJson);
  return normalizeWorkspacePath(last);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeWorkspacePath(value)).filter(Boolean)));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function looksLikeDefaultOpenClawWorkspace(workspacePath: string) {
  const normalized = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.endsWith('/.openclaw/workspace') || normalized.endsWith('/.openclaw/workspace-default');
}

function defaultNameForWorkspacePath(workspacePath: string, isDefault: boolean) {
  if (isDefault || looksLikeDefaultOpenClawWorkspace(workspacePath)) return 'OpenClaw Workspace';
  const base = path.basename(workspacePath.replace(/\/+$/, '').replace(/\\+$/, '')) || 'workspace';
  const pretty = base
    .replace(/^workspace[-_]?/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const label = pretty ? pretty.replace(/\b\w/g, (ch) => ch.toUpperCase()) : base;
  return `OpenClaw ${label}`;
}

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function listWorkspaces() {
  const q = new URLSearchParams({ page: '1', perPage: '400', sort: '-updatedAt' });
  const list = await pbFetch<PBList<Workspace>>(`/api/collections/workspaces/records?${q.toString()}`);
  return Array.isArray(list.items) ? list.items : [];
}

async function readDefaultOpenClawWorkspace(errors: string[]) {
  const direct = await runOpenClaw(['config', 'get', 'agents.defaults.workspace'], { timeoutMs: 9_000 });
  if (direct.ok) {
    const parsed = parseScalarStdout(String(direct.stdout || ''));
    if (parsed) return parsed;
  } else {
    errors.push(String(direct.message || direct.stderr || 'openclaw config get agents.defaults.workspace failed'));
  }

  // Backward-compatible fallback.
  const legacy = await runOpenClaw(['config', 'get', 'agent.workspace'], { timeoutMs: 9_000 });
  if (legacy.ok) {
    const parsed = parseScalarStdout(String(legacy.stdout || ''));
    if (parsed) return parsed;
  }

  const defaultsJson = await runOpenClaw(['config', 'get', 'agents.defaults', '--json'], { timeoutMs: 10_000 });
  if (defaultsJson.ok) {
    const parsed = parseJson(String(defaultsJson.stdout || '').trim());
    if (parsed && typeof parsed === 'object') {
      const fromDefaults = normalizeWorkspacePath((parsed as Record<string, unknown>).workspace);
      if (fromDefaults) return fromDefaults;
    }
  }

  return '';
}

async function readOpenClawAgentWorkspaces(errors: string[]) {
  const list = await runOpenClaw(['agents', 'list', '--json'], { timeoutMs: 12_000 });
  if (!list.ok) {
    errors.push(String(list.message || list.stderr || 'openclaw agents list failed'));
    return [] as string[];
  }

  const parsed = parseJson(String(list.stdout || '').trim());
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).agents)
      ? ((parsed as Record<string, unknown>).agents as unknown[])
      : [];

  const paths: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const workspacePath = normalizeWorkspacePath((row as Record<string, unknown>).workspace);
    if (workspacePath) paths.push(workspacePath);
  }
  return uniqueStrings(paths);
}

export async function probeOpenClawWorkspaces(): Promise<OpenClawWorkspaceProbe> {
  const errors: string[] = [];
  const [defaultPath, agentPaths] = await Promise.all([
    readDefaultOpenClawWorkspace(errors),
    readOpenClawAgentWorkspaces(errors),
  ]);

  const candidatePaths = uniqueStrings([defaultPath, ...agentPaths]);
  return {
    connected: candidatePaths.length > 0,
    defaultPath,
    agentPaths,
    candidatePaths,
    errors: uniqueStrings(errors),
  };
}

function nextUniqueSlug(seed: string, existing: Set<string>) {
  const base = slugify(seed) || 'openclaw-workspace';
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  for (let idx = 2; idx < 500; idx += 1) {
    const candidate = `${base}-${idx}`;
    if (!existing.has(candidate)) {
      existing.add(candidate);
      return candidate;
    }
  }
  const fallback = `${base}-${Date.now().toString(36)}`;
  existing.add(fallback);
  return fallback;
}

export async function syncMissionControlWorkspacesFromOpenClaw(opts?: {
  seedWhenEmptyOnly?: boolean;
}): Promise<OpenClawWorkspaceSyncResult> {
  const seedWhenEmptyOnly = Boolean(opts?.seedWhenEmptyOnly);
  const probe = await probeOpenClawWorkspaces();
  const existing = await listWorkspaces();

  if (!probe.candidatePaths.length) {
    return {
      connected: false,
      defaultPath: probe.defaultPath,
      candidatePaths: [],
      createdWorkspaceIds: [],
      linkedWorkspaceId: '',
      errors: probe.errors,
    };
  }

  if (seedWhenEmptyOnly && existing.length > 0) {
    return {
      connected: true,
      defaultPath: probe.defaultPath,
      candidatePaths: probe.candidatePaths,
      createdWorkspaceIds: [],
      linkedWorkspaceId: '',
      errors: probe.errors,
    };
  }

  const now = new Date().toISOString();
  const createdWorkspaceIds: string[] = [];
  let linkedWorkspaceId = '';

  const existingByPath = new Map<string, Workspace>();
  const existingSlugSet = new Set<string>();
  for (const workspace of existing) {
    const pathKey = normalizeWorkspacePath(workspace.openclawWorkspacePath);
    if (pathKey) existingByPath.set(pathKey, workspace);
    const slugKey = String(workspace.slug || '').trim().toLowerCase();
    if (slugKey) existingSlugSet.add(slugKey);
  }

  const preferredPath = normalizeWorkspacePath(probe.defaultPath) || probe.candidatePaths[0] || '';
  const targetPaths = seedWhenEmptyOnly ? uniqueStrings([preferredPath]) : probe.candidatePaths;

  // If there is exactly one unlinked workspace and one OpenClaw workspace path, link it instead of creating a duplicate.
  if (!seedWhenEmptyOnly && targetPaths.length === 1 && !existingByPath.has(targetPaths[0] || '')) {
    const unlinked = existing.filter((workspace) => !normalizeWorkspacePath(workspace.openclawWorkspacePath) && !workspace.archived);
    if (unlinked.length === 1 && targetPaths[0]) {
      const toLink = unlinked[0];
      try {
        const updated = await pbFetch<Workspace>(`/api/collections/workspaces/records/${toLink.id}`, {
          method: 'PATCH',
          body: {
            openclawWorkspacePath: targetPaths[0],
            description: String(toLink.description || '').trim(),
            updatedAt: now,
          },
        });
        linkedWorkspaceId = String(updated?.id || toLink.id);
        existingByPath.set(targetPaths[0], updated);
      } catch (err) {
        probe.errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  for (const workspacePath of targetPaths) {
    if (!workspacePath) continue;
    const existingMatch = existingByPath.get(workspacePath);
    if (existingMatch) {
      if (!linkedWorkspaceId) linkedWorkspaceId = existingMatch.id;
      continue;
    }

    const name = defaultNameForWorkspacePath(workspacePath, workspacePath === preferredPath);
    const slug = nextUniqueSlug(name, existingSlugSet);
    const description = `Linked to OpenClaw workspace path: ${workspacePath}`;

    try {
      const created = await pbFetch<Workspace>('/api/collections/workspaces/records', {
        method: 'POST',
        body: {
          name,
          slug,
          description,
          openclawWorkspacePath: workspacePath,
          archived: false,
          createdAt: now,
          updatedAt: now,
        },
      });
      const createdId = String(created?.id || '').trim();
      if (createdId) {
        createdWorkspaceIds.push(createdId);
        if (!linkedWorkspaceId) linkedWorkspaceId = createdId;
      }
      existingByPath.set(workspacePath, created);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // If schema is older and field doesn't exist yet, create workspace without linkage field.
      if (message.includes('Unknown field') || message.includes('validation_unknown_fields')) {
        try {
          const createdFallback = await pbFetch<Workspace>('/api/collections/workspaces/records', {
            method: 'POST',
            body: {
              name,
              slug,
              description,
              archived: false,
              createdAt: now,
              updatedAt: now,
            },
          });
          const createdId = String(createdFallback?.id || '').trim();
          if (createdId) {
            createdWorkspaceIds.push(createdId);
            if (!linkedWorkspaceId) linkedWorkspaceId = createdId;
          }
        } catch (fallbackErr) {
          probe.errors.push(fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
        }
      } else {
        probe.errors.push(message);
      }
    }
  }

  return {
    connected: true,
    defaultPath: probe.defaultPath,
    candidatePaths: probe.candidatePaths,
    createdWorkspaceIds,
    linkedWorkspaceId,
    errors: uniqueStrings(probe.errors),
  };
}

export async function findWorkspaceByOpenClawPath(openclawWorkspacePath: string) {
  const normalized = normalizeWorkspacePath(openclawWorkspacePath);
  if (!normalized) return null;
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `openclawWorkspacePath = "${pbFilterString(normalized)}"`,
  });
  const list = await pbFetch<PBList<Workspace>>(`/api/collections/workspaces/records?${q.toString()}`);
  return list.items?.[0] || null;
}
