'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

function initialsForLabel(label: string) {
  const parts = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => {
      const m = String(p).match(/[A-Za-z0-9]/);
      return m ? m[0].toUpperCase() : '';
    })
    .join('');
}

export function AgentAvatar({
  id,
  label,
  size = 24,
  className,
}: {
  id: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const src = `/api/agents/avatar/${encodeURIComponent(id)}`;
  const initials = initialsForLabel(label) || 'A';
  const [loaded, setLoaded] = React.useState(false);

  // Reset when switching agents so we don't "stick" loaded state.
  React.useEffect(() => setLoaded(false), [src]);

  return (
    <span
      className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--card)]', className)}
      style={{ width: size, height: size }}
      title={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-150', loaded ? 'opacity-100' : 'opacity-0')}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />
      {!loaded ? (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-muted" aria-hidden="true">
          {initials}
        </span>
      ) : null}
    </span>
  );
}
