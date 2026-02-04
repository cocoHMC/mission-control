import { Sidebar } from '@/components/shell/Sidebar';
import { MobileNav } from '@/components/shell/MobileNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <div className="app-panel">
        <div className="border-b border-[var(--border)] bg-[var(--card)] p-2 lg:hidden">
          <MobileNav />
        </div>
        <div className="p-3 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
