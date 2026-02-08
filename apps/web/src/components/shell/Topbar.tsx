import Link from 'next/link';
import { Bell, Sparkles } from 'lucide-react';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { Badge } from '@/components/ui/badge';

export function Topbar({
  title,
  subtitle,
  actionHref,
  actionLabel,
  rightSlot,
  density = 'default',
}: {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  rightSlot?: React.ReactNode;
  density?: 'default' | 'compact';
}) {
  const compact = density === 'compact';

  return (
    <header className="mc-titlebar flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-3">
          <h1 className={compact ? 'text-lg font-semibold headline sm:text-2xl' : 'text-xl font-semibold headline sm:text-3xl'}>{title}</h1>
          <Badge className="hidden border-none sm:inline-flex">live</Badge>
        </div>
        {!compact && subtitle ? <p className="mt-1 hidden text-sm text-muted sm:block">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {rightSlot ? <div className="no-drag">{rightSlot}</div> : null}
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="no-drag inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent-foreground)] sm:px-4 sm:text-sm"
          >
            <Sparkles className="h-4 w-4" />
            {actionLabel}
          </Link>
        ) : null}
        <button className="no-drag rounded-full border border-[var(--border)] bg-[var(--card)] p-2">
          <Bell className="h-4 w-4" />
        </button>
        <div className="no-drag">
          <CommandPalette variant={compact ? 'icon' : 'default'} />
        </div>
      </div>
    </header>
  );
}
