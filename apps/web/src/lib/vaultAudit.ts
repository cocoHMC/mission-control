import { pbFetch } from '@/lib/pbServer';

export type VaultAuditActorType = 'human' | 'agent';
export type VaultAuditAction = 'create' | 'update' | 'rotate' | 'disable' | 'enable' | 'delete' | 'resolve' | 'reveal';
export type VaultAuditStatus = 'ok' | 'deny' | 'error';

export async function writeVaultAudit(params: {
  actorType: VaultAuditActorType;
  agentId?: string;
  vaultItemId?: string;
  action: VaultAuditAction;
  status: VaultAuditStatus;
  sessionKey?: string;
  toolName?: string;
  error?: string;
  meta?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    ts: now,
    actorType: params.actorType,
    action: params.action,
    status: params.status,
    ...(params.agentId ? { agent: params.agentId } : {}),
    ...(params.vaultItemId ? { vaultItem: params.vaultItemId } : {}),
    ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
    ...(params.toolName ? { toolName: params.toolName } : {}),
    ...(params.error ? { error: params.error } : {}),
    ...(params.meta ? { meta: params.meta } : {}),
  };

  try {
    await pbFetch('/api/collections/vault_audit/records', { method: 'POST', body: payload });
  } catch {
    // Audit must never break the main flow.
  }
}

