import Link from 'next/link';
import { Bell, Sparkles } from 'lucide-react';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { Badge } from '@/components/ui/badge';

export function Topbar({ title, subtitle, actionHref, actionLabel }: { title: string; subtitle?: string; actionHref?: string; actionLabel?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold headline sm:text-3xl">{title}</h1>
          <Badge className="hidden border-none bg-[var(--highlight)] text-[var(--foreground)] sm:inline-flex">live</Badge>
        </div>
        {subtitle && <p className="mt-1 hidden text-sm text-muted sm:block">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--background)] sm:px-4 sm:text-sm"
          >
            <Sparkles className="h-4 w-4" />
            {actionLabel}
          </Link>
        ) : null}
        <button className="rounded-full border border-[var(--border)] bg-[var(--card)] p-2">
          <Bell className="h-4 w-4" />
        </button>
        <CommandPalette />
      </div>
    </header>
  );
}
