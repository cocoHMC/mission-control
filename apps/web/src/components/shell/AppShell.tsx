import { Sidebar } from '@/components/shell/Sidebar';
import { MobileNav } from '@/components/shell/MobileNav';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { headers } from 'next/headers';
import { cn } from '@/lib/utils';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const ua = h.get('user-agent') || '';
  const isDesktop = /electron/i.test(ua) || h.get('x-mc-desktop') === '1';

  return (
    <div className={cn('app-shell', isDesktop && 'app-shell-desktop')}>
      <div className="hidden lg:block">
        {isDesktop ? <DesktopSidebar /> : <Sidebar />}
      </div>
      <div className={cn('app-panel', isDesktop && 'app-panel-desktop')}>
        <div className="border-b border-[var(--border)] bg-[var(--card)] p-2 lg:hidden">
          <MobileNav />
        </div>
        <div className="p-3 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
