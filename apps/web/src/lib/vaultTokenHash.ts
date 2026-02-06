import crypto from 'node:crypto';

const TOKEN_PREFIX = 'mcva_';

function base64Url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function generateVaultAccessToken() {
  const rand = crypto.randomBytes(4).toString('hex');
  const tokenPrefix = `${TOKEN_PREFIX}${rand}`;
  const tokenSecret = base64Url(crypto.randomBytes(32));
  const token = `${tokenPrefix}.${tokenSecret}`;
  return { token, tokenPrefix };
}

export function parseVaultTokenPrefix(token: string) {
  const raw = String(token || '').trim();
  const idx = raw.indexOf('.');
  if (idx <= 0) return null;
  const prefix = raw.slice(0, idx);
  if (!prefix.startsWith(TOKEN_PREFIX)) return null;
  return prefix;
}

export function hashVaultAccessToken(token: string) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(token, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyVaultAccessToken(token: string, stored: string) {
  const raw = String(stored || '').trim();
  const parts = raw.split('$');
  if (parts.length !== 3) return false;
  const [algo, saltB64, hashB64] = parts;
  if (algo !== 'scrypt') return false;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.scryptSync(token, salt, expected.length, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    // Constant-time compare.
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

