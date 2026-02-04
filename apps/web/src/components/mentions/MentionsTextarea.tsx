'use client';

import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type Mentionable = { id: string; label: string };

function findMentionTrigger(value: string, caret: number) {
  const upto = value.slice(0, caret);
  // Match @mentions only when they are at the start of the string or preceded by a non-word char.
  // This avoids false positives inside email addresses like `name@example.com`.
  const regex = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_-]{0,64})$/;
  const match = regex.exec(upto);
  if (!match) return null;
  const atIndex = (match.index ?? 0) + match[1].length;
  const query = match[2] ?? '';
  return { atIndex, query };
}

export function MentionsTextarea({
  value,
  onChange,
  mentionables,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  mentionables: Mentionable[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [atIndex, setAtIndex] = React.useState<number | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mentionables;
    return mentionables.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q));
  }, [mentionables, query]);

  const updateFromCaret = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const trigger = findMentionTrigger(value, caret);
    if (!trigger) {
      setOpen(false);
      setQuery('');
      setAtIndex(null);
      return;
    }

    setOpen(true);
    setQuery(trigger.query);
    setAtIndex(trigger.atIndex);
    setActiveIndex(0);
  }, [value]);

  React.useEffect(() => {
    if (!open) return;
    if (activeIndex < filtered.length) return;
    setActiveIndex(0);
  }, [open, activeIndex, filtered.length]);

  function insertMention(id: string) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const trigger = findMentionTrigger(value, caret);
    if (!trigger) return;

    const before = value.slice(0, trigger.atIndex);
    const after = value.slice(caret);
    const insert = `@${id} `;
    const next = `${before}${insert}${after}`;

    onChange(next);
    setOpen(false);
    setQuery('');
    setAtIndex(null);

    const nextCaret = before.length + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={(event) => {
          onChange(event.target.value);
          requestAnimationFrame(updateFromCaret);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (!filtered.length) return;

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((i) => (i + 1) % filtered.length);
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
            return;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            const pick = filtered[activeIndex];
            if (pick) insertMention(pick.id);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            return;
          }
        }}
        onClick={() => updateFromCaret()}
        onKeyUp={() => updateFromCaret()}
        onBlur={() => {
          // Don't keep the popover pinned open when you click outside.
          setTimeout(() => setOpen(false), 0);
        }}
      />

      {open && atIndex != null ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
          {filtered.length ? (
            filtered.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
                  idx === activeIndex ? 'bg-[var(--card)] text-[var(--foreground)]' : 'text-muted hover:bg-[var(--card)]/60'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(m.id)}
              >
                <span className="font-medium">@{m.id}</span>
                <span className="text-xs text-muted">{m.label}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted">No matches</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
