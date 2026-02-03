import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthConfigured, isPlaceholderSecret } from '@/app/api/setup/_shared';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const configured = isAdminAuthConfigured();
  const host = req.headers.get('host') || '';
  const hostname = host.split(':')[0] || '';
  const setupAllowed = !configured; // real enforcement happens on apply

  return NextResponse.json({
    configured,
    setupAllowed,
    hostname,
    defaults: {
      mcAdminUser: process.env.MC_ADMIN_USER && !isPlaceholderSecret(process.env.MC_ADMIN_USER) ? process.env.MC_ADMIN_USER : 'admin',
      leadAgentId: process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'main',
      leadAgentName: process.env.MC_LEAD_AGENT_NAME || 'Coco (Main)',
      pbUrl: process.env.PB_URL || 'http://127.0.0.1:8090',
      pbAdminEmail: process.env.PB_ADMIN_EMAIL || 'admin@example.com',
      pbServiceEmail: process.env.PB_SERVICE_EMAIL || 'service@example.com',
      openclawGatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789',
      gatewayHostHint: process.env.MC_GATEWAY_HOST_HINT || '',
      gatewayPortHint: process.env.MC_GATEWAY_PORT_HINT || '18789',
    },
  });
}

