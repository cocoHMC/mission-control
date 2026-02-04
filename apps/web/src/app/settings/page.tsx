import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/app/settings/ThemeToggle';
import { WebNotifications } from '@/app/settings/WebNotifications';
import { SetupChecklist } from '@/app/settings/SetupChecklist';
import { TailscaleStatusCard } from '@/app/settings/TailscaleStatus';
import { DesktopUpdates } from '@/app/settings/DesktopUpdates';
import { OpenClawIntegration } from '@/app/settings/OpenClawIntegration';
import { DesktopNotifications } from '@/app/settings/DesktopNotifications';

export default function SettingsPage() {
  const leadName = process.env.MC_LEAD_AGENT_NAME || process.env.MC_LEAD_AGENT_ID || 'Lead';
  const leadId = process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco';
  const webHost = process.env.MC_BIND_HOST || '127.0.0.1';
  const webPort = process.env.MC_WEB_PORT || '4010';
  const pbUrl = process.env.PB_URL || 'http://127.0.0.1:8090';
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
  const gatewayHostHint = process.env.MC_GATEWAY_HOST_HINT || '<gateway-tailnet-ip>';
  const gatewayPortHint = process.env.MC_GATEWAY_PORT_HINT || '18789';
  return (
    <AppShell>
      <Topbar title="Settings" subtitle="Local-only configuration and operational notes." />
      <div className="mt-4 grid gap-6 sm:mt-8 lg:grid-cols-2">
        <SetupChecklist
          leadAgentId={leadId}
          leadAgentName={leadName}
          webUrl={`http://${webHost}:${webPort}`}
          pbUrl={pbUrl}
          gatewayUrl={gatewayUrl}
          gatewayHostHint={gatewayHostHint}
          gatewayPortHint={gatewayPortHint}
        />
        <TailscaleStatusCard webPort={webPort} />
        <OpenClawIntegration />
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
            <CardTitle>Desktop App</CardTitle>
          </CardHeader>
          <CardContent>
            <DesktopUpdates />
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
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <DesktopNotifications />
              <div className="h-px bg-[var(--border)]" />
              <WebNotifications />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
