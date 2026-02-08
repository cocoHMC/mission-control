import { Sidebar } from '@/components/shell/Sidebar';
import { MobileNav } from '@/components/shell/MobileNav';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { headers } from 'next/headers';
import { cn } from '@/lib/utils';

export async function AppShell({
  children,
  scroll = 'auto',
  padding = 'default',
}: {
  children: React.ReactNode;
  scroll?: 'auto' | 'none';
  padding?: 'default' | 'dense' | 'none';
}) {
  const h = await headers();
  const ua = h.get('user-agent') || '';
  const isDesktop = /electron/i.test(ua) || h.get('x-mc-desktop') === '1';

  const paddingClass =
    padding === 'none'
      ? 'p-0'
      : padding === 'dense'
        ? 'p-3 sm:p-4 lg:p-5'
        : 'p-3 sm:p-6 lg:p-8';

  return (
    <div className={cn('app-shell', isDesktop && 'app-shell-desktop')}>
      <div className="hidden min-h-0 lg:block">
        {isDesktop ? <DesktopSidebar /> : <Sidebar />}
      </div>
      <div className={cn('app-panel', isDesktop && 'app-panel-desktop')}>
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--card)] p-2 lg:hidden">
          <MobileNav />
        </div>
        <div className={cn('min-h-0 flex-1', scroll === 'none' ? 'overflow-hidden' : 'overflow-auto mc-scroll')}>
          <div className={cn('h-full min-h-0', paddingClass)}>{children}</div>
        </div>
      </div>
    </div>
  );
}
