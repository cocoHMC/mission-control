'use client';

import * as React from 'react';
import { addMinutes, set as setTime } from 'date-fns';
import { PanelRightOpen, PanelRightClose, GripVertical, Search, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarBody } from '@/features/full-calendar/calendar-body';
import { CalendarProvider } from '@/features/full-calendar/contexts/calendar-context';
import { DndProvider } from '@/features/full-calendar/contexts/dnd-context';
import { CalendarHeader } from '@/features/full-calendar/header/calendar-header';
import type { IEvent, IUser } from '@/features/full-calendar/interfaces';
import type { TEventColor } from '@/features/full-calendar/types';
import { DraggableEvent } from '@/features/full-calendar/dnd/draggable-event';
import { Avatar, AvatarFallback, AvatarImage } from '@/features/full-calendar/ui/avatar';
import { AvatarGroup } from '@/features/full-calendar/ui/avatar-group';
import { Badge } from '@/features/full-calendar/ui/badge';
import { Button } from '@/features/full-calendar/ui/button';
import { Input } from '@/features/full-calendar/ui/input';
import { ScrollArea } from '@/features/full-calendar/ui/scroll-area';
import { cn, titleCase } from '@/lib/utils';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import { mcFetch } from '@/lib/clientApi';
import { TaskDrawer } from '@/app/tasks/TaskDrawer';
import { TaskCreateDrawer } from '@/app/tasks/TaskCreateDrawer';
import { TaskViewToggle } from '@/app/tasks/TaskViewToggle';
import type { Agent, NodeRecord, Project, Task, TaskStatus } from '@/lib/types';

const DEFAULT_EVENT_MINUTES = 30;

function safeDate(value: string | undefined | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function colorForStatus(status: TaskStatus): TEventColor {
  switch (status) {
    case 'blocked':
      return 'red';
    case 'review':
      return 'yellow';
    case 'in_progress':
      return 'green';
    case 'assigned':
      return 'purple';
    case 'done':
      return 'orange';
    case 'inbox':
    default:
      return 'blue';
  }
}

function statusForColor(color: TEventColor): TaskStatus {
  switch (color) {
    case 'red':
      return 'blocked';
    case 'yellow':
      return 'review';
    case 'green':
      return 'in_progress';
    case 'purple':
      return 'assigned';
    case 'orange':
      return 'done';
    case 'blue':
    default:
      return 'inbox';
  }
}

function initials(label: string) {
  const parts = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'A';
}

function buildUsers(agents: Agent[]) {
  const pbIdToKey = new Map<string, string>();
  const keyToUser = new Map<string, IUser>();

  for (const a of agents || []) {
    if (!a?.id) continue;
    const key = String(a.openclawAgentId || a.id).trim();
    if (!key) continue;
    pbIdToKey.set(a.id, key);
    if (a.openclawAgentId) pbIdToKey.set(a.openclawAgentId, key);
    keyToUser.set(key, {
      id: key,
      name: a.displayName || a.openclawAgentId || a.id,
      picturePath: `/api/agents/avatar/${encodeURIComponent(key)}`,
    });
  }

  const users = Array.from(keyToUser.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { users, pbIdToKey, keyToUser };
}

function normalizeAssigneeIds(task: Task, pbIdToKey: Map<string, string>) {
  const ids = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  return ids
    .map((id) => {
      const raw = String(id || '').trim();
      if (!raw) return '';
      return pbIdToKey.get(raw) || raw;
    })
    .filter(Boolean);
}

function taskToEvent(task: Task, pbIdToKey: Map<string, string>, keyToUser: Map<string, IUser>): IEvent | null {
  if (!task?.id) return null;
  if (task.archived) return null;

  const start = safeDate(task.startAt) || safeDate(task.dueAt);
  if (!start) return null;
  const due = safeDate(task.dueAt);
  const end = due || new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60_000);
  const safeEnd = end <= start ? new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60_000) : end;

  const assigneeIds = normalizeAssigneeIds(task, pbIdToKey);
  const primary = assigneeIds[0] || '';
  const user =
    (primary && keyToUser.get(primary)) || {
      id: 'unassigned',
      name: 'Unassigned',
      picturePath: null,
    };

  return {
    id: task.id,
    title: String(task.title || ''),
    description: String(task.description || ''),
    startDate: start.toISOString(),
    endDate: safeEnd.toISOString(),
    color: colorForStatus(task.status),
    user,
    assigneeIds,
  };
}

export function TaskCalendar({
  initialTasks,
  agents,
  nodes,
  projects,
}: {
  initialTasks: Task[];
  agents: Agent[];
  nodes: NodeRecord[];
  projects: Project[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = React.useState<Task[]>(initialTasks || []);
  const calendarShellRef = React.useRef<HTMLDivElement>(null);
  const [unscheduledOpen, setUnscheduledOpen] = React.useState(false);
  const [unscheduledVisible, setUnscheduledVisible] = React.useState(false);
  const closeUnscheduledTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unscheduledQuery, setUnscheduledQuery] = React.useState('');
  const [createInitialStartAt, setCreateInitialStartAt] = React.useState<string | undefined>(undefined);
  const [createInitialDueAt, setCreateInitialDueAt] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    setTasks(initialTasks || []);
  }, [initialTasks]);

  React.useEffect(() => {
    return () => {
      if (closeUnscheduledTimer.current) clearTimeout(closeUnscheduledTimer.current);
    };
  }, []);

  const { users, pbIdToKey, keyToUser } = React.useMemo(() => buildUsers(agents || []), [agents]);

  const selectedProjectId = React.useMemo(() => String(searchParams.get('project') || '').trim(), [searchParams]);

  const visibleTasks = React.useMemo(
    () =>
      (tasks || []).filter((task) => {
        if (task.archived) return false;
        if (!selectedProjectId) return true;
        return String(task.projectId || '').trim() === selectedProjectId;
      }),
    [tasks, selectedProjectId]
  );

  const scheduledEvents = React.useMemo(() => {
    return visibleTasks
      .map((t) => taskToEvent(t, pbIdToKey, keyToUser))
      .filter(Boolean) as IEvent[];
  }, [keyToUser, pbIdToKey, visibleTasks]);

  const unscheduledTasks = React.useMemo(() => {
    const q = unscheduledQuery.trim().toLowerCase();
    return visibleTasks
      .filter((t) => !safeDate(t.startAt) && !safeDate(t.dueAt))
      .filter((t) => {
        if (!q) return true;
        const title = String(t.title || '').toLowerCase();
        const desc = String(t.description || '').toLowerCase();
        return title.includes(q) || desc.includes(q);
      })
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }, [visibleTasks, unscheduledQuery]);

  // Keep tasks fresh via PB realtime when available; fall back to polling.
  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await mcFetch('/api/tasks?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      setTasks(json?.items ?? []);
    }, 30_000);

    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    getPocketBaseClient()
      .then(async (pb) => {
        if (cancelled) return;
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        await pb.collection('tasks').subscribe('*', (e: PBRealtimeEvent<Task>) => {
          if (!e?.record?.id) return;
          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === e.record.id);
            if (e.action === 'delete') return prev.filter((t) => t.id !== e.record.id);
            if (idx === -1) return [...prev, e.record as Task];
            const next = [...prev];
            next[idx] = e.record as Task;
            return next;
          });
        });
        unsubscribe = async () => pb.collection('tasks').unsubscribe('*');
      })
      .catch(() => {
        // keep polling
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (unsubscribe) void unsubscribe().catch(() => {});
    };
  }, []);

  const patchTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const patchPayloads = React.useRef(new Map<string, Record<string, unknown>>());

  React.useEffect(() => {
    const timers = patchTimers.current;
    const payloads = patchPayloads.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      payloads.clear();
    };
  }, []);

  function resetCalendarHorizontalScroll() {
    const el = calendarShellRef.current;
    if (!el) return;
    if (el.scrollLeft) el.scrollLeft = 0;
  }

  function openUnscheduledDrawer() {
    if (closeUnscheduledTimer.current) {
      clearTimeout(closeUnscheduledTimer.current);
      closeUnscheduledTimer.current = null;
    }

    resetCalendarHorizontalScroll();
    setUnscheduledVisible(true);
    // Mount at `translate-x-full`, then animate in on the next frame.
    window.requestAnimationFrame(() => {
      setUnscheduledOpen(true);
      resetCalendarHorizontalScroll();
    });
  }

  function closeUnscheduledDrawer() {
    setUnscheduledOpen(false);
    resetCalendarHorizontalScroll();

    if (closeUnscheduledTimer.current) clearTimeout(closeUnscheduledTimer.current);
    closeUnscheduledTimer.current = setTimeout(() => {
      setUnscheduledVisible(false);
      closeUnscheduledTimer.current = null;
      resetCalendarHorizontalScroll();
    }, 200);
  }

  function toggleUnscheduledDrawer() {
    if (unscheduledOpen) closeUnscheduledDrawer();
    else openUnscheduledDrawer();
  }

  function openDrawer(taskId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    params.set('task', taskId);
    params.set('view', 'calendar');
    router.replace(`/tasks?${params.toString()}`, { scroll: false });
  }

  function closeDrawer() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('task');
    const qs = params.toString();
    router.replace(qs ? `/tasks?${qs}` : '/tasks', { scroll: false });
  }

  const taskParam = searchParams.get('task');
  const drawerOpen = Boolean(taskParam);

  const newParam = searchParams.get('new');
  const createOpen = newParam === '1';

  function openCreateDrawer(startAt?: string, dueAt?: string) {
    if (startAt) setCreateInitialStartAt(startAt);
    if (dueAt) setCreateInitialDueAt(dueAt);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('task');
    params.set('new', '1');
    params.set('view', 'calendar');
    router.replace(`/tasks?${params.toString()}`, { scroll: false });
  }

  function closeCreateDrawer() {
    setCreateInitialStartAt(undefined);
    setCreateInitialDueAt(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const qs = params.toString();
    router.replace(qs ? `/tasks?${qs}` : '/tasks', { scroll: false });
  }

  async function createTaskFromEvent(draft: Omit<IEvent, 'id'>) {
    const status = statusForColor(draft.color);
    const body = {
      title: draft.title,
      description: draft.description ?? '',
      projectId: selectedProjectId || '',
      status,
      startAt: draft.startDate,
      dueAt: draft.endDate,
      assigneeIds: Array.isArray(draft.assigneeIds) ? draft.assigneeIds : [],
    };

    const res = await mcFetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(typeof json === 'string' ? json : json?.message || json?.error || 'Failed to create task');
    }

    setTasks((prev) => {
      const created = json as Task;
      const exists = prev.some((t) => t.id === created.id);
      return exists ? prev : [...prev, created];
    });
  }

  function schedulePatch(taskId: string, patch: Record<string, unknown>) {
    patchPayloads.current.set(taskId, patch);
    const existing = patchTimers.current.get(taskId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      patchTimers.current.delete(taskId);
      const payload = patchPayloads.current.get(taskId) || patch;
      patchPayloads.current.delete(taskId);

      try {
        const res = await mcFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`PATCH failed (${res.status})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg || 'Failed to update task');
      }
    }, 450);

    patchTimers.current.set(taskId, timer);
  }

  function updateTaskFromEvent(event: IEvent) {
    const status = statusForColor(event.color);

    const patch = {
      title: event.title,
      description: event.description ?? '',
      status,
      startAt: event.startDate,
      dueAt: event.endDate,
      assigneeIds: Array.isArray(event.assigneeIds) ? event.assigneeIds : [],
    } satisfies Record<string, unknown>;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === event.id
          ? {
              ...t,
              title: String(event.title || ''),
              description: String(event.description || ''),
              status,
              startAt: event.startDate,
              dueAt: event.endDate,
              assigneeIds: Array.isArray(event.assigneeIds) ? event.assigneeIds : [],
            }
          : t
      )
    );

    schedulePatch(event.id, patch);
  }

  function deleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    mcFetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg || 'Failed to delete task');
      });
  }

  const unscheduledCount = unscheduledTasks.length;

  return (
    <CalendarProvider
      events={scheduledEvents}
      users={users}
      view="month"
      onAddEvent={createTaskFromEvent}
      onUpdateEvent={updateTaskFromEvent}
      onRemoveEvent={deleteTask}
      onOpenEvent={(event) => openDrawer(event.id)}
      onOpenCreateEvent={({ startDate, endDate }) => openCreateDrawer(startDate.toISOString(), endDate.toISOString())}
    >
      <DndProvider>
        <div
          ref={calendarShellRef}
          className="relative flex h-full min-h-0 flex-col overflow-hidden overscroll-x-none touch-pan-y rounded-xl border border-border bg-background"
          onScroll={() => resetCalendarHorizontalScroll()}
        >
          <CalendarHeader
            extraActions={
              <>
                {/* On mobile the page titlebar is hidden to free space; keep Board/Calendar switch here. */}
                <div className="lg:hidden">
                  <TaskViewToggle variant="inline" />
                </div>
                <select
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  value={selectedProjectId}
                  onChange={(event) => {
                    const params = new URLSearchParams(searchParams.toString());
                    const value = String(event.target.value || '').trim();
                    if (value) params.set('project', value);
                    else params.delete('project');
                    params.set('view', 'calendar');
                    const next = params.toString();
                    router.replace(next ? `/tasks?${next}` : '/tasks?view=calendar', { scroll: false });
                  }}
                >
                  <option value="">All projects</option>
                  {projects
                    .filter((p) => !p.archived && String(p.status || 'active') !== 'archived')
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name || project.id}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="relative"
                  aria-label={unscheduledOpen ? 'Close unscheduled tasks' : 'Open unscheduled tasks'}
                  onClick={() => toggleUnscheduledDrawer()}
                >
                  {unscheduledOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  {unscheduledCount ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {unscheduledCount}
                    </span>
                  ) : null}
                </Button>
              </>
            }
          />

          <div className="relative min-h-0 flex-1">
            <CalendarBody />

            {/* Unscheduled drawer (non-modal overlay so drag -> drop still works). */}
            {unscheduledVisible ? (
              <div
                className={cn(
                  'absolute right-0 top-0 z-30 flex h-full w-[min(92vw,380px)] flex-col border-l border-border bg-background shadow-xl transition-transform duration-200 ease-out',
                  unscheduledOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
                )}
                aria-hidden={!unscheduledOpen}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">Unscheduled</div>
                      <Badge variant="secondary" className="h-6">
                        {unscheduledCount}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Drag a task onto the calendar to schedule it.</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => closeUnscheduledDrawer()}
                    aria-label="Close"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </div>

                <div className="border-b border-border p-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={unscheduledQuery}
                      onChange={(e) => setUnscheduledQuery(e.target.value)}
                      placeholder="Search unscheduled..."
                      className="pl-9"
                    />
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-2 p-4">
                    {unscheduledTasks.length ? (
                      unscheduledTasks.map((t) => {
                        const startDate = setTime(new Date(), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
                        const endDate = addMinutes(startDate, DEFAULT_EVENT_MINUTES);
                        const assigneeIds = normalizeAssigneeIds(t, pbIdToKey);
                        const primary = assigneeIds[0] || '';
                        const user =
                          (primary && keyToUser.get(primary)) || {
                            id: 'unassigned',
                            name: 'Unassigned',
                            picturePath: null,
                          };
                        const pseudoEvent: IEvent = {
                          id: t.id,
                          title: String(t.title || ''),
                          description: String(t.description || ''),
                          startDate: startDate.toISOString(),
                          endDate: endDate.toISOString(),
                          color: colorForStatus(t.status),
                          user,
                          assigneeIds,
                        };

                        return (
                          <DraggableEvent key={t.id} event={pseudoEvent}>
                            <div
                              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-xs transition hover:bg-accent"
                              role="button"
                              tabIndex={0}
                              onClick={() => openDrawer(t.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') openDrawer(t.id);
                              }}
                            >
                              <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                                <GripVertical className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{t.title || 'Untitled'}</div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                      <span className="rounded-md border border-border bg-background px-2 py-0.5 font-semibold">
                                        {titleCase(t.status)}
                                      </span>
                                      {t.priority ? (
                                        <span className="rounded-md border border-border bg-background px-2 py-0.5 font-semibold">
                                          {String(t.priority).toUpperCase()}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <Link
                                    href={`/tasks?view=calendar&task=${encodeURIComponent(t.id)}`}
                                    className="opacity-0 transition group-hover:opacity-100"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Open task"
                                  >
                                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                  </Link>
                                </div>

                                <div className="mt-2 flex items-center justify-between gap-2">
                                  {assigneeIds.length ? (
                                    <AvatarGroup className="flex items-center" max={3}>
                                      {assigneeIds.map((id) => {
                                        const u = keyToUser.get(id);
                                        const label = u?.name || id;
                                        return (
                                          <Avatar key={id} className="size-6">
                                            <AvatarImage src={u?.picturePath ?? undefined} alt={label} />
                                            <AvatarFallback className="text-[10px]">{initials(label)}</AvatarFallback>
                                          </Avatar>
                                        );
                                      })}
                                    </AvatarGroup>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Unassigned</span>
                                  )}
                                  <span className="text-[10px] font-semibold text-muted-foreground">Drag to schedule</span>
                                </div>
                              </div>
                            </div>
                          </DraggableEvent>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                        No unscheduled tasks.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
          </div>
        </div>

        <TaskCreateDrawer
          open={createOpen}
          agents={agents}
          nodes={nodes}
          projects={projects}
          initialProjectId={selectedProjectId || undefined}
          onClose={closeCreateDrawer}
          initialStartAt={createInitialStartAt}
          initialDueAt={createInitialDueAt}
        />
        <TaskDrawer
          open={drawerOpen}
          taskId={taskParam}
          agents={agents}
          nodes={nodes}
          projects={projects}
          onClose={closeDrawer}
        />
      </DndProvider>
    </CalendarProvider>
  );
}
