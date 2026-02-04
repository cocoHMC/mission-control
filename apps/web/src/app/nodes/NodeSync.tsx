'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function NodeSync() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/nodes/sync', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Sync failed (${res.status})`);
      const count = typeof json?.upserted === 'number' ? json.upserted : null;
      setResult(count !== null ? `Synced (${count})` : 'Synced');
      router.refresh();
    } catch (err: any) {
      setResult(err?.message || 'Sync failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" type="button" onClick={sync} disabled={loading}>
        {loading ? 'Syncing…' : 'Sync from OpenClaw'}
      </Button>
      {result ? (
        <Badge className={result.startsWith('Sync failed') ? 'border-none bg-red-600 text-white' : 'border-none bg-emerald-600 text-white'}>
          {result}
        </Badge>
      ) : null}
    </div>
  );
}

