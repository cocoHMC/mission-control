type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkVaultRateLimit(key: string, opts?: { limit?: number; windowMs?: number }) {
  const limit = opts?.limit ?? 300;
  const windowMs = opts?.windowMs ?? 60_000;
  const now = Date.now();

  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true as const, retryAfterMs: 0 };
  }

  if (current.count >= limit) {
    return { allowed: false as const, retryAfterMs: Math.max(0, current.resetAt - now) };
  }

  current.count += 1;
  return { allowed: true as const, retryAfterMs: 0 };
}

