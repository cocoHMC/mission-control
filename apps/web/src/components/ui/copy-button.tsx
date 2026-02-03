'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={onCopy} className={className}>
      {copied ? 'Copied' : label}
    </Button>
  );
}

