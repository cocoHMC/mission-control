import { Sidebar } from '@/components/shell/Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-panel p-8">{children}</div>
    </div>
  );
}
