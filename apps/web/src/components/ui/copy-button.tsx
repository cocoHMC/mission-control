'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export function CopyButton({
  value,
  label = 'Copy',
  className,
  disabled = false,
}: {
  value: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={onCopy} className={className} disabled={disabled}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
