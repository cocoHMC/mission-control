'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatShortDate, titleCase } from '@/lib/utils';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import { mcFetch } from '@/lib/clientApi';
import type { DocumentRecord } from '@/lib/types';
import { DocumentDrawer } from '@/app/docs/DocumentDrawer';

function excerpt(value: string, max = 160) {
  const t = value.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function DocumentsClient({ initialDocs }: { initialDocs: DocumentRecord[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [docs, setDocs] = React.useState<DocumentRecord[]>(initialDocs);
  const [query, setQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');

  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await mcFetch('/api/documents?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      setDocs(json?.items ?? []);
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
        await pb.collection('documents').subscribe('*', (e: PBRealtimeEvent<DocumentRecord>) => {
          if (!e?.record) return;
          setDocs((prev) => {
            if (e.action === 'delete') return prev.filter((doc) => doc.id !== e.record.id);
            const idx = prev.findIndex((doc) => doc.id === e.record.id);
            const next = [...prev];
            if (idx === -1) next.push(e.record);
            else next[idx] = e.record;
            return next;
          });
        });
        unsubscribe = async () => pb.collection('documents').unsubscribe('*');
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

  const docParam = searchParams.get('doc');
  const newParam = searchParams.get('new');
  const drawerOpen = Boolean(docParam || newParam === '1');
  const createMode = newParam === '1' && !docParam;
  const effectiveDocId = docParam || null;

  function openDoc(docId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('doc', docId);
    params.delete('new');
    const qs = params.toString();
    router.replace(qs ? `/docs?${qs}` : '/docs', { scroll: false });
  }

  function openCreate() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('doc');
    params.set('new', '1');
    const qs = params.toString();
    router.replace(qs ? `/docs?${qs}` : '/docs', { scroll: false });
  }

  function closeDrawer() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('doc');
    params.delete('new');
    const qs = params.toString();
    router.replace(qs ? `/docs?${qs}` : '/docs', { scroll: false });
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const type = typeFilter.trim().toLowerCase();
    const list = (docs ?? []).filter((d) => d && d.id);
    const out = list.filter((d) => {
      if (type && String(d.type || '').trim().toLowerCase() !== type) return false;
      if (!q) return true;
      const hay = [
        String(d.title || '').toLowerCase(),
        String(d.type || '').toLowerCase(),
        String(d.taskId || '').toLowerCase(),
        String(d.content || '').toLowerCase(),
      ].join('\n');
      return hay.includes(q);
    });
    out.sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return tb - ta;
    });
    return out;
  }, [docs, query, typeFilter]);

  const typeOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const d of docs ?? []) {
      const t = String(d?.type || '').trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [docs]);

  return (
    <>
      <div className="mb-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Search</div>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder="Search docs by title, content, taskId…" />
              </div>
            </div>
            <div className="sm:w-52">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Type</div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="">All</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button type="button" onClick={openCreate} className="self-start sm:self-auto">
            <Sparkles className="h-4 w-4" />
            New document
          </Button>
        </div>
        <div className="mt-3 text-xs text-muted tabular-nums">{filtered.length} documents</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((doc) => {
          const preview = doc.content ? excerpt(String(doc.content || ''), 180) : '';
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => openDoc(doc.id)}
              className={cn(
                'group rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow)] transition',
                'hover:-translate-y-0.5 hover:shadow-2xl'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-[var(--foreground)]">{doc.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge className="border-none">{doc.type || 'deliverable'}</Badge>
                    {doc.updatedAt ? <span>Updated {formatShortDate(doc.updatedAt)}</span> : null}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted opacity-0 transition group-hover:opacity-100">Open</div>
              </div>

              {doc.taskId ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted">Task</span>
                  <Link
                    href={`/tasks/${encodeURIComponent(doc.taskId)}`}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {doc.taskId}
                  </Link>
                </div>
              ) : null}

              {preview ? <div className="mt-4 line-clamp-3 text-sm text-[var(--foreground)]/80">{preview}</div> : null}
              {!preview ? <div className="mt-4 text-sm text-muted">No content yet.</div> : null}
            </button>
          );
        })}

        {!filtered.length ? (
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-muted">
            No documents found. Create one, or open a task and generate a deliverable.
          </div>
        ) : null}
      </div>

      <DocumentDrawer
        open={drawerOpen}
        docId={effectiveDocId}
        createMode={createMode}
        onClose={closeDrawer}
        onCreated={(id) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('doc', id);
          params.delete('new');
          const qs = params.toString();
          router.replace(qs ? `/docs?${qs}` : '/docs', { scroll: false });
        }}
        onDeleted={() => {
          closeDrawer();
        }}
      />
    </>
  );
}
