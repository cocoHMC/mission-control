import { SetupClient } from '@/app/setup/setup-client';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  // /setup is available both for first-run setup and for re-running the wizard.
  // First-run enforcement is handled in /api/setup/apply; reconfigure uses /api/setup/reconfigure.
  return <SetupClient />;
}
