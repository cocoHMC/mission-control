'use client';

import * as React from 'react';
import Link from 'next/link';
import { TaskDetail } from '@/app/tasks/[id]/TaskDetail';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Agent, DocumentRecord, Message, NodeRecord, PBList, Project, Subtask, Task, TaskFile } from '@/lib/types';

type DrawerProps = {
  open: boolean;
  taskId: string | null;
  agents: Agent[];
  nodes: NodeRecord[];
  projects: Project[];
  onClose: () => void;
};

async function fetchJson<T>(url: string) {
  // Use mcFetch to avoid browsers rejecting URLs when the app is opened with
  // basic auth in the URL (http://user:pass@host/...).
  const res = await mcFetch(url, { headers: { 'content-type': 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return (await res.json()) as T;
}

export function TaskDrawer({ open, taskId, agents, nodes, projects, onClose }: DrawerProps) {
  const TRANSITION_MS = 220;
  const [rendered, setRendered] = React.useState(open);
  const [visible, setVisible] = React.useState(open);
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(taskId);
  const [task, setTask] = React.useState<Task | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [files, setFiles] = React.useState<TaskFile[]>([]);
  const [subtasks, setSubtasks] = React.useState<Subtask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (taskId) setActiveTaskId(taskId);
  }, [taskId]);

  const liveTaskId = taskId ?? activeTaskId;

  // Opening: render immediately (before paint) and then slide in on the next frame.
  React.useLayoutEffect(() => {
    if (open) {
      setRendered(true);
      setVisible(false);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Closing: allow one paint with the drawer visible, then slide out and unmount.
  React.useEffect(() => {
    if (open) return;
    setVisible(false);
    const timeout = setTimeout(() => setRendered(false), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  React.useEffect(() => {
    if (!rendered) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [rendered]);

  React.useEffect(() => {
    if (!rendered) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rendered, onClose]);

  const refresh = React.useCallback(async () => {
    if (!liveTaskId) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, messageList, docList, fileList, subtaskList] = await Promise.all([
        fetchJson<Task>(`/api/tasks/${liveTaskId}`),
        fetchJson<PBList<Message>>(
          `/api/messages?${new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = \"${liveTaskId}\"`, sort: 'createdAt' }).toString()}`
        ),
        fetchJson<PBList<DocumentRecord>>(
          `/api/documents?${new URLSearchParams({ page: '1', perPage: '100', filter: `taskId = \"${liveTaskId}\"`, sort: '-updatedAt' }).toString()}`
        ),
        fetchJson<PBList<TaskFile>>(
          `/api/task-files?${new URLSearchParams({ page: '1', perPage: '100', filter: `taskId = \"${liveTaskId}\"`, sort: '-updatedAt' }).toString()}`
        ).catch(() => ({ items: [], page: 1, perPage: 100, totalItems: 0, totalPages: 1 } as PBList<TaskFile>)),
        fetchJson<PBList<Subtask>>(
          `/api/subtasks?${new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = \"${liveTaskId}\"`, sort: 'order' }).toString()}`
        ),
      ]);
      setTask(taskData);
      setMessages(messageList.items ?? []);
      setDocuments(docList.items ?? []);
      setFiles(fileList.items ?? []);
      setSubtasks(subtaskList.items ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [liveTaskId]);

  React.useEffect(() => {
    if (open && liveTaskId) void refresh();
  }, [open, liveTaskId, refresh]);

  React.useEffect(() => {
    if (!open || !liveTaskId) return;
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = setInterval(() => void refresh(), 30_000);
    let unsubscribeTasks: (() => Promise<void>) | null = null;
    let unsubscribeMessages: (() => Promise<void>) | null = null;
    let unsubscribeDocs: (() => Promise<void>) | null = null;
    let unsubscribeFiles: (() => Promise<void>) | null = null;
    let unsubscribeSubtasks: (() => Promise<void>) | null = null;

    const upsert = <T extends { id: string }>(list: T[], record: T) => {
      const idx = list.findIndex((item) => item.id === record.id);
      if (idx === -1) return [...list, record];
      const next = [...list];
      next[idx] = record;
      return next;
    };

    getPocketBaseClient()
      .then(async (pb) => {
        if (cancelled) return;
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        // Subscribe to the specific task record to avoid clobbering the TaskBoard
        // subscription (both components share a PB client).
        await pb.collection('tasks').subscribe(liveTaskId, (e: PBRealtimeEvent<Task>) => {
          if (e?.record?.id === liveTaskId) setTask(e.record as Task);
        });
        await pb.collection('messages').subscribe('*', (e: PBRealtimeEvent<Message>) => {
          if (e?.record?.taskId !== liveTaskId) return;
          if (e.action === 'delete') {
            setMessages((prev) => prev.filter((m) => m.id !== e.record.id));
          } else {
            setMessages((prev) => upsert(prev, e.record as Message));
          }
        });
        await pb.collection('documents').subscribe('*', (e: PBRealtimeEvent<DocumentRecord>) => {
          if (e?.record?.taskId !== liveTaskId) return;
          if (e.action === 'delete') {
            setDocuments((prev) => prev.filter((d) => d.id !== e.record.id));
          } else {
            setDocuments((prev) => upsert(prev, e.record as DocumentRecord));
          }
        });
        try {
          await pb.collection('task_files').subscribe('*', (e: PBRealtimeEvent<TaskFile>) => {
            if (e?.record?.taskId !== liveTaskId) return;
            if (e.action === 'delete') {
              setFiles((prev) => prev.filter((f) => f.id !== e.record.id));
            } else {
              setFiles((prev) => upsert(prev, e.record as TaskFile));
            }
          });
          unsubscribeFiles = async () => pb.collection('task_files').unsubscribe('*');
        } catch {
          // older schemas may not have task_files yet
        }
        await pb.collection('subtasks').subscribe('*', (e: PBRealtimeEvent<Subtask>) => {
          if (e?.record?.taskId !== liveTaskId) return;
          if (e.action === 'delete') {
            setSubtasks((prev) => prev.filter((s) => s.id !== e.record.id));
          } else {
            setSubtasks((prev) => upsert(prev, e.record as Subtask));
          }
        });

        unsubscribeTasks = async () => pb.collection('tasks').unsubscribe(liveTaskId);
        unsubscribeMessages = async () => pb.collection('messages').unsubscribe('*');
        unsubscribeDocs = async () => pb.collection('documents').unsubscribe('*');
        unsubscribeSubtasks = async () => pb.collection('subtasks').unsubscribe('*');
      })
      .catch(() => {
        // fallback to polling
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (unsubscribeTasks) void unsubscribeTasks().catch(() => {});
      if (unsubscribeMessages) void unsubscribeMessages().catch(() => {});
      if (unsubscribeDocs) void unsubscribeDocs().catch(() => {});
      if (unsubscribeFiles) void unsubscribeFiles().catch(() => {});
      if (unsubscribeSubtasks) void unsubscribeSubtasks().catch(() => {});
    };
  }, [open, liveTaskId, refresh]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close drawer"
        className={cn(
          'absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200',
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out will-change-transform',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Task</div>
            <div className="text-lg font-semibold">{task?.title ?? 'Loading task...'}</div>
          </div>
          <div className="flex items-center gap-2">
            {task ? (
              <Link
                href={`/tasks/${task.id}`}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted hover:bg-[var(--surface)]"
              >
                Open page
              </Link>
            ) : null}
            <Button size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-muted">
              {error}
            </div>
          ) : null}
          {loading || !task ? (
            <div className="space-y-4">
              <div className="h-32 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
              <div className="h-48 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
              <div className="h-40 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
            </div>
          ) : (
            <TaskDetail
              task={task}
              agents={agents}
              nodes={nodes}
              projects={projects}
              messages={messages}
              documents={documents}
              files={files}
              subtasks={subtasks}
              onUpdated={refresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
