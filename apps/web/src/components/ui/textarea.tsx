import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[120px] w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-offset-background placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
