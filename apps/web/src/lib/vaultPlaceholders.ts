export const DEFAULT_VAULT_PLACEHOLDER_PREFIX = 'vault';

const KNOWN_FIELDS = new Set(['username', 'user', 'password', 'secret', 'value', 'token', 'api_key']);

export type VaultPlaceholderRef = {
  handle: string;
  field?: string;
};

export function parseVaultPlaceholderRef(spec: string): VaultPlaceholderRef | null {
  const raw = String(spec || '').trim();
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length > 1) {
    const field = parts[parts.length - 1] || '';
    if (KNOWN_FIELDS.has(field)) {
      const handle = parts.slice(0, -1).join('.');
      if (!handle) return null;
      return { handle, field };
    }
  }

  return { handle: raw };
}

export type VaultPlaceholderMatch = {
  raw: string;
  ref: VaultPlaceholderRef;
};

export function findVaultPlaceholdersInString(input: string, prefix: string = DEFAULT_VAULT_PLACEHOLDER_PREFIX) {
  const text = String(input || '');
  const safePrefix = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(`\\{\\{\\s*${safePrefix}:([^}]+?)\\s*\\}\\}`, 'g');

  const out: VaultPlaceholderMatch[] = [];
  for (const match of text.matchAll(re)) {
    const raw = match[0] || '';
    const inner = match[1] || '';
    const ref = parseVaultPlaceholderRef(inner);
    if (!raw || !ref) continue;
    out.push({ raw, ref });
  }
  return out;
}

