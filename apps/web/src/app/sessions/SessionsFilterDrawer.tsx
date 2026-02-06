'use client';

import * as React from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { inboxFilters, type InboxMode } from '@/app/sessions/sessionsInboxFilters';

type SessionsFilterDrawerProps = {
  open: boolean;
  onClose: () => void;

  loading: boolean;
  onRefresh: () => void;

  query: string;
  onQueryChange: (next: string) => void;

  selectedAgent: string;
  onSelectedAgentChange: (next: string) => void;
  agentIds: string[];
  agentLabelById: Map<string, string>;

  inboxMode: InboxMode;
  onInboxModeChange: (next: InboxMode) => void;

  groupBy: 'agent' | 'type';
  onGroupByChange: (next: 'agent' | 'type') => void;

  hasActiveFilters: boolean;
  onReset: () => void;
};

export function SessionsFilterDrawer({
  open,
  onClose,
  loading,
  onRefresh,
  query,
  onQueryChange,
  selectedAgent,
  onSelectedAgentChange,
  agentIds,
  agentLabelById,
  inboxMode,
  onInboxModeChange,
  groupBy,
  onGroupByChange,
  hasActiveFilters,
  onReset,
}: SessionsFilterDrawerProps) {
  const TRANSITION_MS = 220;
  const [rendered, setRendered] = React.useState(open);
  const [visible, setVisible] = React.useState(open);

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

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close filters drawer"
        className={cn(
          'absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200',
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out will-change-transform sm:max-w-lg',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Inbox</div>
            <div className="text-lg font-semibold">Filters</div>
          </div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Search</label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Search sessions, channels, models…"
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Agent</label>
              <select
                value={selectedAgent}
                onChange={(e) => onSelectedAgentChange(e.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="">All agents</option>
                {agentIds.map((id) => (
                  <option key={id} value={id}>
                    {(() => {
                      const label = agentLabelById.get(id);
                      return label && label !== id ? `${label} (${id})` : id;
                    })()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Type</label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {inboxFilters.map((filter) => {
                  const active = filter.id === inboxMode;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => onInboxModeChange(filter.id)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                        active
                          ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                          : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[color:var(--foreground)]/5'
                      )}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Grouping</label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'agent' as const, label: 'By agent' },
                    { id: 'type' as const, label: 'By type' },
                  ] as const
                ).map((opt) => {
                  const active = groupBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onGroupByChange(opt.id)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                        active
                          ? 'bg-[var(--highlight)] text-[var(--highlight-foreground)]'
                          : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[color:var(--foreground)]/5'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={onReset} disabled={!hasActiveFilters}>
                Reset
              </Button>
              <Button size="sm" variant="secondary" onClick={onRefresh} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

