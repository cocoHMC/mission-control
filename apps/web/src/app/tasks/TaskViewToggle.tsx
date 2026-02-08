'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewId = 'board' | 'calendar';

function normalizeView(value: string | null): ViewId {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === 'calendar') return 'calendar';
  return 'board';
}

export function TaskViewToggle({ variant = 'page' }: { variant?: 'page' | 'inline' } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = normalizeView(searchParams.get('view'));

  function setView(next: ViewId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'board') params.delete('view');
    else params.set('view', next);
    const qs = params.toString();
    router.replace(qs ? `/tasks?${qs}` : '/tasks', { scroll: false });
  }

  const tabs: Array<{ id: ViewId; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'board', label: 'Board', Icon: Columns3 },
    { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  ];

  return (
    <div className={cn('flex items-center', variant === 'page' ? 'justify-between gap-3' : 'gap-2')}>
      <div
        role="tablist"
        aria-label="Task views"
        className={cn(
          'inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm',
          variant === 'inline' ? 'h-9' : ''
        )}
      >
        {tabs.map(({ id, label, Icon }) => {
          const active = id === view;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                'inline-flex items-center gap-2 rounded-full text-xs font-semibold uppercase tracking-[0.2em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                variant === 'inline' ? 'px-3 py-1.5' : 'px-4 py-2',
                active ? 'bg-[var(--card)] text-[var(--foreground)]' : 'text-muted hover:bg-[var(--card)]/60'
              )}
              onClick={() => setView(id)}
              title={variant === 'inline' ? label : undefined}
            >
              <Icon className="h-4 w-4" />
              <span className={cn(variant === 'inline' ? 'hidden sm:inline' : '')}>{label}</span>
            </button>
          );
        })}
      </div>

      {variant === 'page' ? (
        <div className="hidden text-xs text-muted sm:block">
          Tip: <span className="font-medium text-[var(--foreground)]">Board</span> for flow,{' '}
          <span className="font-medium text-[var(--foreground)]">Calendar</span> for dates and agent load.
        </div>
      ) : null}
    </div>
  );
}
