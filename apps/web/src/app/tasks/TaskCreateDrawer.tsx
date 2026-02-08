'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { TaskForm } from '@/app/tasks/new/TaskForm';
import type { Agent, NodeRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

type DrawerProps = {
  open: boolean;
  agents: Agent[];
  nodes: NodeRecord[];
  onClose: () => void;
  initialStartAt?: string;
  initialDueAt?: string;
};

export function TaskCreateDrawer({ open, agents, nodes, onClose, initialStartAt, initialDueAt }: DrawerProps) {
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
            <div className="text-xs uppercase tracking-[0.2em] text-muted">New</div>
            <div className="text-lg font-semibold">Task</div>
          </div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <TaskForm
            agents={agents}
            nodes={nodes}
            initialStartAt={initialStartAt}
            initialDueAt={initialDueAt}
            onCreated={() => onClose()}
          />
        </div>
      </div>
    </div>
  );
}
