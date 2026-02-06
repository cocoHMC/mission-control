'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';
import type { Agent } from '@/lib/types';

type DrawerProps = {
  open: boolean;
  agents: Agent[];
  onClose: () => void;
  defaultAgentId?: string;
};

function agentIdFromAgent(agent: Agent) {
  return agent.openclawAgentId || agent.id;
}

export function SessionCreateDrawer({ open, agents, onClose, defaultAgentId }: DrawerProps) {
  const router = useRouter();
  const TRANSITION_MS = 220;
  const [rendered, setRendered] = React.useState(open);
  const [visible, setVisible] = React.useState(open);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [newAgent, setNewAgent] = React.useState('');
  const [newSessionKey, setNewSessionKey] = React.useState('');
  const [newMessage, setNewMessage] = React.useState('');
  const [resetSession, setResetSession] = React.useState(true);
  const [autoKey, setAutoKey] = React.useState(true);

  const agentIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      const id = agentIdFromAgent(a);
      if (id) set.add(id);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [agents]);

  const agentLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      const id = agentIdFromAgent(a);
      if (!id) continue;
      map.set(id, a.displayName || id);
    }
    return map;
  }, [agents]);

  React.useEffect(() => {
    if (!newAgent && agentIds.length) setNewAgent(agentIds[0]);
  }, [agentIds, newAgent]);

  React.useEffect(() => {
    if (!open) return;
    const preferred = String(defaultAgentId || '').trim();
    if (!preferred) return;
    if (!agentIds.includes(preferred)) return;
    setNewAgent(preferred);
    setAutoKey(true);
  }, [open, defaultAgentId, agentIds]);

  React.useEffect(() => {
    if (!autoKey) return;
    if (!newAgent) return;
    setNewSessionKey(`agent:${newAgent}:main`);
  }, [autoKey, newAgent]);

  React.useLayoutEffect(() => {
    if (open) {
      setRendered(true);
      setVisible(false);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  React.useEffect(() => {
    if (open) return;
    setVisible(false);
    const timeout = setTimeout(() => setRendered(false), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  React.useEffect(() => {
    if (!rendered) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [rendered]);

  React.useEffect(() => {
    if (!rendered) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rendered, onClose]);

  async function createSession() {
    const key = newSessionKey.trim();
    if (!key) {
      setError('Session key required.');
      return;
    }
    const trimmedMessage = newMessage.trim();
    const message = resetSession ? `/new${trimmedMessage ? `\n${trimmedMessage}` : ''}` : trimmedMessage;
    if (!message) {
      setError('Add a message or enable reset.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: key, message, timeoutSeconds: 0 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to start session');
      setNewMessage('');
      setAutoKey(true);
      onClose();
      router.push(`/sessions/${encodeURIComponent(key)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to start session');
    } finally {
      setCreating(false);
    }
  }

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close drawer"
        className={cn(
          'absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200',
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out will-change-transform',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted">New</div>
            <div className="text-lg font-semibold">Session</div>
          </div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Agent</label>
              <select
                value={newAgent}
                onChange={(e) => {
                  setNewAgent(e.target.value);
                  setAutoKey(true);
                }}
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
              >
                {agentIds.map((id) => (
                  <option key={id} value={id}>
                    {(() => {
                      const label = agentLabelById.get(id);
                      return label && label !== id ? `${label} (${id})` : id;
                    })()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Session key</label>
              <Input
                value={newSessionKey}
                onChange={(e) => {
                  setAutoKey(false);
                  setNewSessionKey(e.target.value);
                }}
                placeholder="agent:main:main"
                className="mt-2"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Message</label>
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Add a first message to kick things off."
                className="mt-2 min-h-[120px]"
              />
              <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={resetSession} onChange={(e) => setResetSession(e.target.checked)} />
                Start fresh (/new)
              </label>
            </div>

            {error ? <div className="text-xs text-red-600">{error}</div> : null}

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => void createSession()} disabled={creating}>
                {creating ? 'Starting…' : 'Start session'}
              </Button>
              <Button size="sm" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
