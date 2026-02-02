import Link from 'next/link';
import { Bell, Sparkles } from 'lucide-react';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { Badge } from '@/components/ui/badge';

export function Topbar({ title, subtitle, actionHref, actionLabel }: { title: string; subtitle?: string; actionHref?: string; actionLabel?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold headline">{title}</h1>
          <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">live</Badge>
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            <Sparkles className="h-4 w-4" />
            {actionLabel}
          </Link>
        ) : null}
        <button className="rounded-full border border-[var(--border)] bg-white p-2">
          <Bell className="h-4 w-4" />
        </button>
        <CommandPalette />
      </div>
    </header>
  );
}
