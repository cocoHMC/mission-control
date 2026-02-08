'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

type ThemeMode = 'system' | 'light' | 'dark';

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem('mc_theme');
  if (raw === 'light' || raw === 'dark') return raw;
  return 'system';
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
    window.localStorage.removeItem('mc_theme');
  } else {
    root.dataset.theme = mode;
    window.localStorage.setItem('mc_theme', mode);
  }

  // Tailwind dark: classes in the codebase rely on `.dark` being present.
  const effective =
    mode === 'system' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  root.classList.toggle('dark', effective === 'dark');
}

export function ThemeToggle() {
  const [mode, setMode] = React.useState<ThemeMode>('system');
  const [systemMode, setSystemMode] = React.useState<'light' | 'dark'>('light');

  React.useEffect(() => {
    setMode(getStoredTheme());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemMode(mq.matches ? 'dark' : 'light');
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  React.useEffect(() => {
    if (mode === 'system') applyTheme('system');
  }, [mode, systemMode]);

  function choose(next: ThemeMode) {
    setMode(next);
    applyTheme(next);
  }

  const effective = mode === 'system' ? systemMode : mode;

  return (
    <div className="space-y-3 text-sm text-muted">
      <div>Choose how Mission Control should look on this device.</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === 'system' ? 'default' : 'secondary'} onClick={() => choose('system')}>
          System
        </Button>
        <Button size="sm" variant={mode === 'light' ? 'default' : 'secondary'} onClick={() => choose('light')}>
          Light
        </Button>
        <Button size="sm" variant={mode === 'dark' ? 'default' : 'secondary'} onClick={() => choose('dark')}>
          Dark
        </Button>
      </div>
      <div className="text-xs">Active: {effective}</div>
    </div>
  );
}
