import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/app/settings/ThemeToggle';
import { WebNotifications } from '@/app/settings/WebNotifications';

export default function SettingsPage() {
  const leadName = process.env.MC_LEAD_AGENT_NAME || process.env.MC_LEAD_AGENT_ID || 'Lead';
  return (
    <AppShell>
      <Topbar title="Settings" subtitle="Local-only configuration and operational notes." />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Headscale + Tailnet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>Keep services bound to loopback or tailnet IP only.</div>
            <div>Use headscale to authenticate devices and route traffic to the gateway host.</div>
            <div>Enable basic auth in the UI even on tailnet.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Agent Bootstrap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>Seed {leadName} as the lead agent in PocketBase.</div>
            <div>Use docs/AGENTS.md and docs/PERSONAS for new agents.</div>
            <div>Configure OpenClaw Tools Invoke token in `.env`.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Shortcuts + Automator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>Use macOS Shortcuts for repetitive tasks to save tokens.</div>
            <div>Registry lives in docs/SHORTCUTS.md with stable names.</div>
            <div>Run via `scripts/shortcuts.sh list` and `scripts/shortcuts.sh run &quot;Shortcut Name&quot;`.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Web Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <WebNotifications />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
