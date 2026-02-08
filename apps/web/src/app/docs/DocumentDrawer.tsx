'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn, formatShortDate, titleCase } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';
import type { DocumentRecord } from '@/lib/types';

type DrawerProps = {
  open: boolean;
  docId: string | null;
  createMode?: boolean;
  onClose: () => void;
  onCreated?: (docId: string) => void;
  onDeleted?: (docId: string) => void;
};

async function fetchJson<T>(url: string) {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return (await res.json()) as T;
}

function normalizeType(value: string) {
  const v = value.trim();
  return v || 'deliverable';
}

export function DocumentDrawer({ open, docId, createMode = false, onClose, onCreated, onDeleted }: DrawerProps) {
  const router = useRouter();
  const TRANSITION_MS = 220;
  const [rendered, setRendered] = React.useState(open);
  const [visible, setVisible] = React.useState(open);
  const [activeDocId, setActiveDocId] = React.useState<string | null>(docId);
  const [doc, setDoc] = React.useState<DocumentRecord | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [mode, setMode] = React.useState<'preview' | 'edit'>('preview');

  const [titleDraft, setTitleDraft] = React.useState('');
  const [typeDraft, setTypeDraft] = React.useState('deliverable');
  const [taskIdDraft, setTaskIdDraft] = React.useState('');
  const [contentDraft, setContentDraft] = React.useState('');

  React.useEffect(() => {
    if (docId) setActiveDocId(docId);
  }, [docId]);

  const liveDocId = docId ?? activeDocId;

  React.useLayoutEffect(() => {
    if (open) {
      setRendered(true);
      setVisible(false);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

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
    if (!liveDocId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchJson<DocumentRecord>(`/api/documents/${liveDocId}`);
      setDoc(next);
      setTitleDraft(String(next.title || ''));
      setTypeDraft(normalizeType(String(next.type || 'deliverable')));
      setTaskIdDraft(String(next.taskId || ''));
      setContentDraft(String(next.content || ''));
      setMode('preview');
    } catch (err: unknown) {
      setDoc(null);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, [liveDocId]);

  React.useEffect(() => {
    if (!open) return;
    if (createMode) {
      setDoc(null);
      setTitleDraft('');
      setTypeDraft('deliverable');
      setTaskIdDraft('');
      setContentDraft('');
      setMode('edit');
      return;
    }
    if (liveDocId) void refresh();
  }, [createMode, liveDocId, open, refresh]);

  if (!rendered) return null;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: titleDraft.trim(),
        type: normalizeType(typeDraft),
        taskId: taskIdDraft.trim(),
        content: contentDraft,
      };

      if (createMode) {
        if (!payload.title) throw new Error('Title is required.');
        const res = await mcFetch('/api/documents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || 'Create failed');
        const id = String(json?.id || '').trim();
        if (!id) throw new Error('Create succeeded but returned no id.');
        if (onCreated) onCreated(id);
        router.refresh();
        return;
      }

      if (!liveDocId) return;
      const res = await mcFetch(`/api/documents/${liveDocId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Save failed');
      setDoc(json as DocumentRecord);
      setMode('preview');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc() {
    if (!liveDocId || deleting) return;
    if (!window.confirm('Delete document? This cannot be undone.')) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await mcFetch(`/api/documents/${liveDocId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Delete failed');
      if (onDeleted) onDeleted(liveDocId);
      router.refresh();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const headerTitle = createMode ? 'New document' : doc?.title || 'Document';
  const headerSubtitle = createMode ? 'Create a deliverable, protocol, or note.' : liveDocId ? `Doc ID: ${liveDocId}` : '';

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
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">{createMode ? 'New' : 'Document'}</div>
            <div className="truncate text-lg font-semibold">{headerTitle}</div>
            {headerSubtitle ? <div className="mt-1 truncate text-xs text-muted">{headerSubtitle}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            {!createMode && liveDocId ? (
              <Link
                href={`/docs?doc=${encodeURIComponent(liveDocId)}`}
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
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          {loading ? (
            <div className="space-y-4">
              <div className="h-20 rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
              <div className="h-72 rounded-2xl border border-[var(--border)] bg-[var(--card)]" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Title</label>
                    <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="mt-2" placeholder="Doc title" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Type</label>
                    <select
                      value={typeDraft}
                      onChange={(e) => setTypeDraft(e.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      {['deliverable', 'protocol', 'research', 'note', 'spec', 'report'].map((t) => (
                        <option key={t} value={t}>
                          {titleCase(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Linked task (optional)</label>
                    <Input
                      value={taskIdDraft}
                      onChange={(e) => setTaskIdDraft(e.target.value)}
                      className="mt-2"
                      placeholder="Paste a taskId to link this doc"
                    />
                    {taskIdDraft.trim() ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={`/tasks/${encodeURIComponent(taskIdDraft.trim())}`}>
                          <Button type="button" size="sm" variant="secondary">
                            Open task page
                          </Button>
                        </Link>
                        <Link href={`/tasks?task=${encodeURIComponent(taskIdDraft.trim())}`}>
                          <Button type="button" size="sm" variant="secondary">
                            Open in board
                          </Button>
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>

                {!createMode && doc ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge className="border-none">{doc.type || 'deliverable'}</Badge>
                    {doc.updatedAt ? <span>Updated {formatShortDate(doc.updatedAt)}</span> : null}
                    {doc.createdAt ? <span>Created {formatShortDate(doc.createdAt)}</span> : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
                  <div className="text-sm font-semibold">Content</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        'rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition',
                        mode === 'preview' ? 'bg-[var(--surface)] text-[var(--foreground)]' : 'text-muted hover:bg-[var(--surface)]'
                      )}
                      onClick={() => setMode('preview')}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition',
                        mode === 'edit' ? 'bg-[var(--surface)] text-[var(--foreground)]' : 'text-muted hover:bg-[var(--surface)]'
                      )}
                      onClick={() => setMode('edit')}
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  {mode === 'edit' ? (
                    <Textarea
                      value={contentDraft}
                      onChange={(e) => setContentDraft(e.target.value)}
                      placeholder="Markdown content..."
                      className="min-h-[360px]"
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{contentDraft || '(empty)'}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={() => void save()} disabled={saving || deleting}>
                    {saving ? (createMode ? 'Creating…' : 'Saving…') : createMode ? 'Create document' : 'Save changes'}
                  </Button>
                  {!createMode ? (
                    <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={saving || deleting}>
                      Reload
                    </Button>
                  ) : null}
                </div>
                {!createMode && liveDocId ? (
                  <Button type="button" variant="destructive" onClick={() => void deleteDoc()} disabled={saving || deleting}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

