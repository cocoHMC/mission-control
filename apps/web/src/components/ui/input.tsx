import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] outline-none ring-offset-background placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--ring)]',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
