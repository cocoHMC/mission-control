import crypto from 'node:crypto';

const MASTER_KEY_ENV = 'MC_VAULT_MASTER_KEY_B64';
const HKDF_SALT = Buffer.from('mc-vault-v1', 'utf8');
const AES_ALGO = 'aes-256-gcm';
const KEY_VERSION = 1;

let cachedMasterKey: Buffer | null = null;

function normalizeBase64(input: string) {
  // Accept base64url for convenience.
  let s = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
}

function decodeMasterKeyB64(value: string) {
  const decoded = Buffer.from(normalizeBase64(value), 'base64');
  if (decoded.length !== 32) {
    throw new Error(
      `${MASTER_KEY_ENV} must decode to 32 bytes (got ${decoded.length}). Generate with: openssl rand -base64 32`
    );
  }
  return decoded;
}

export function isVaultConfigured() {
  const raw = String(process.env[MASTER_KEY_ENV] || '').trim();
  if (!raw) return false;
  try {
    decodeMasterKeyB64(raw);
    return true;
  } catch {
    return false;
  }
}

export function requireVaultMasterKey() {
  if (cachedMasterKey) return cachedMasterKey;
  const raw = String(process.env[MASTER_KEY_ENV] || '').trim();
  if (!raw) throw new Error(`Missing ${MASTER_KEY_ENV}.`);
  cachedMasterKey = decodeMasterKeyB64(raw);
  return cachedMasterKey;
}

export function deriveAgentKey(agentId: string) {
  const master = requireVaultMasterKey();
  const info = Buffer.from(String(agentId || '').trim(), 'utf8');
  // hkdfSync(hash, ikm, salt, info, keylen)
  const derived = crypto.hkdfSync('sha256', master, HKDF_SALT, info, 32);
  return Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
}

export function vaultAad(params: { agentId: string; handle: string; type: string; keyVersion?: number }) {
  const version = params.keyVersion ?? KEY_VERSION;
  const stable = ['mc-vault', `v${version}`, String(params.agentId || ''), String(params.type || ''), String(params.handle || '')]
    .map((s) => s.trim())
    .join('|');
  return Buffer.from(stable, 'utf8');
}

export type EncryptedSecretParts = {
  ciphertextB64: string;
  ivB64: string;
  tagB64: string;
  keyVersion: number;
};

export function encryptSecret(plaintext: string, params: { agentId: string; handle: string; type: string }): EncryptedSecretParts {
  const key = deriveAgentKey(params.agentId);
  const iv = crypto.randomBytes(12);
  const aad = vaultAad({ ...params, keyVersion: KEY_VERSION });

  const cipher = crypto.createCipheriv(AES_ALGO, key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext ?? ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertextB64: ciphertext.toString('base64'),
    ivB64: iv.toString('base64'),
    tagB64: tag.toString('base64'),
    keyVersion: KEY_VERSION,
  };
}

export function decryptSecret(
  parts: EncryptedSecretParts,
  params: { agentId: string; handle: string; type: string }
): string {
  const keyVersion = parts.keyVersion ?? KEY_VERSION;
  const key = deriveAgentKey(params.agentId);
  const iv = Buffer.from(String(parts.ivB64 || ''), 'base64');
  const tag = Buffer.from(String(parts.tagB64 || ''), 'base64');
  const ciphertext = Buffer.from(String(parts.ciphertextB64 || ''), 'base64');
  const aad = vaultAad({ ...params, keyVersion });

  try {
    const decipher = crypto.createDecipheriv(AES_ALGO, key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new Error('Vault decrypt failed.');
  }
}
