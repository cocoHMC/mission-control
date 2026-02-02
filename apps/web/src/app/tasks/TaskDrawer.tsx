'use client';

import * as React from 'react';
import Link from 'next/link';
import { TaskDetail } from '@/app/tasks/[id]/TaskDetail';
import { Button } from '@/components/ui/button';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Agent, DocumentRecord, Message, NodeRecord, PBList, Task } from '@/lib/types';

type DrawerProps = {
  open: boolean;
  taskId: string | null;
  agents: Agent[];
  nodes: NodeRecord[];
  onClose: () => void;
};

async function fetchJson<T>(url: string) {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return (await res.json()) as T;
}

export function TaskDrawer({ open, taskId, agents, nodes, onClose }: DrawerProps) {
  const [task, setTask] = React.useState<Task | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, messageList, docList] = await Promise.all([
        fetchJson<Task>(`/api/tasks/${taskId}`),
        fetchJson<PBList<Message>>(`/api/messages?${new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = \"${taskId}\"` }).toString()}`),
        fetchJson<PBList<DocumentRecord>>(`/api/documents?${new URLSearchParams({ page: '1', perPage: '100', filter: `taskId = \"${taskId}\"` }).toString()}`),
      ]);
      setTask(taskData);
      setMessages(messageList.items ?? []);
      setDocuments(docList.items ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    if (open && taskId) void refresh();
  }, [open, taskId, refresh]);

  React.useEffect(() => {
    if (!open || !taskId) return;
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = setInterval(() => void refresh(), 30_000);
    let unsubscribeTasks: (() => Promise<void>) | null = null;
    let unsubscribeMessages: (() => Promise<void>) | null = null;
    let unsubscribeDocs: (() => Promise<void>) | null = null;

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
        await pb.collection('tasks').subscribe('*', (e: PBRealtimeEvent<Task>) => {
          if (e?.record?.id === taskId) setTask(e.record as Task);
        });
        await pb.collection('messages').subscribe('*', (e: PBRealtimeEvent<Message>) => {
          if (e?.record?.taskId !== taskId) return;
          if (e.action === 'delete') {
            setMessages((prev) => prev.filter((m) => m.id !== e.record.id));
          } else {
            setMessages((prev) => upsert(prev, e.record as Message));
          }
        });
        await pb.collection('documents').subscribe('*', (e: PBRealtimeEvent<DocumentRecord>) => {
          if (e?.record?.taskId !== taskId) return;
          if (e.action === 'delete') {
            setDocuments((prev) => prev.filter((d) => d.id !== e.record.id));
          } else {
            setDocuments((prev) => upsert(prev, e.record as DocumentRecord));
          }
        });

        unsubscribeTasks = async () => pb.collection('tasks').unsubscribe('*');
        unsubscribeMessages = async () => pb.collection('messages').unsubscribe('*');
        unsubscribeDocs = async () => pb.collection('documents').unsubscribe('*');
      })
      .catch(() => {
        // fallback to polling
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (unsubscribeTasks) void unsubscribeTasks();
      if (unsubscribeMessages) void unsubscribeMessages();
      if (unsubscribeDocs) void unsubscribeDocs();
    };
  }, [open, taskId, refresh]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close drawer" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
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
            <TaskDetail task={task} agents={agents} nodes={nodes} messages={messages} documents={documents} onUpdated={refresh} />
          )}
        </div>
      </div>
    </div>
  );
}
