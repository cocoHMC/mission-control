import { describe, expect, test } from 'vitest';

import { decryptSecret, encryptSecret } from '../vaultCrypto';

// Fixed master key for deterministic test behavior.
process.env.MC_VAULT_MASTER_KEY_B64 = Buffer.alloc(32, 7).toString('base64');

describe('vaultCrypto', () => {
  test('roundtrip encrypt/decrypt', () => {
    const agentId = 'main';
    const handle = 'github_pat';
    const type = 'api_key';

    const enc = encryptSecret('super-secret', { agentId, handle, type });
    const dec = decryptSecret(enc, { agentId, handle, type });
    expect(dec).toBe('super-secret');
  });

  test('decrypt fails when handle changes (AAD binding)', () => {
    const agentId = 'main';
    const handle = 'stripe_key';
    const type = 'secret';

    const enc = encryptSecret('abc123', { agentId, handle, type });
    expect(() => decryptSecret(enc, { agentId, handle: 'other_handle', type })).toThrow(/Vault decrypt failed/);
  });

  test('decrypt fails when agent changes (per-agent key)', () => {
    const enc = encryptSecret('abc123', { agentId: 'agentA', handle: 'pw', type: 'secret' });
    expect(() => decryptSecret(enc, { agentId: 'agentB', handle: 'pw', type: 'secret' })).toThrow(/Vault decrypt failed/);
  });
});

