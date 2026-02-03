import { redirect } from 'next/navigation';
import { SetupClient } from '@/app/setup/setup-client';

export const dynamic = 'force-dynamic';

function isPlaceholder(value?: string) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === 'change-me' || normalized === 'changeme';
}

export default function SetupPage() {
  const user = process.env.MC_ADMIN_USER;
  const pass = process.env.MC_ADMIN_PASSWORD;
  const configured = Boolean(user && pass && !isPlaceholder(user) && !isPlaceholder(pass));
  if (configured) redirect('/settings');
  return <SetupClient />;
}

