'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { BarChart3, FilePlus2, ListTodo, MessageSquare, Server, Settings, UserRound } from 'lucide-react';

const actions = [
  { label: 'Create new task', icon: FilePlus2, href: '/tasks/new' },
  { label: 'Open tasks board', icon: ListTodo, href: '/tasks' },
  { label: 'View activity feed', icon: BarChart3, href: '/activity' },
  { label: 'Chat sessions', icon: MessageSquare, href: '/sessions' },
  { label: 'Manage nodes', icon: Server, href: '/nodes' },
  { label: 'Agent roster', icon: UserRound, href: '/agents' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)]"
          type="button"
        >
          Cmd+K Command
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(600px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
          <Command className="flex h-[360px] w-full flex-col">
            <Command.Input
              placeholder="Search actions, tasks, nodes..."
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            />
            <Command.List className="mt-3 flex-1 overflow-y-auto">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Command.Item
                    key={action.href}
                    onSelect={() => {
                      setOpen(false);
                      router.push(action.href);
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-sm text-[var(--foreground)] data-[selected=true]:bg-[var(--accent)] data-[selected=true]:text-[var(--background)]"
                  >
                    <Icon className="h-4 w-4" />
                    {action.label}
                  </Command.Item>
                );
              })}
            </Command.List>
            <div className="mt-2 text-xs text-muted">Tip: Press Cmd+K anytime.</div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
