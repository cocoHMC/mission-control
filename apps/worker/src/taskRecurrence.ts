export type TaskRecurrenceFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type TaskRecurrence = {
  version: 1;
  frequency: TaskRecurrenceFrequency;
  interval: number;
  weekdays?: number[];
  monthday?: number;
  mode?: 'after_completion';
};

const FREQUENCIES = new Set<TaskRecurrenceFrequency>(['hourly', 'daily', 'weekly', 'monthly']);

function parseIntInRange(value: unknown, min: number, max: number) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  const int = Math.trunc(n);
  if (int < min || int > max) return null;
  return int;
}

function parseMaybeJsonObject(input: unknown) {
  if (input == null || input === '') return null;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function parseFrequency(value: unknown): TaskRecurrenceFrequency | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (!FREQUENCIES.has(raw as TaskRecurrenceFrequency)) return null;
  return raw as TaskRecurrenceFrequency;
}

function parseWeekdays(raw: unknown) {
  if (!Array.isArray(raw)) return [] as number[];
  const out = new Set<number>();
  for (const value of raw) {
    const day = parseIntInRange(value, 0, 6);
    if (day === null) continue;
    out.add(day);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function normalizeTaskRecurrence(input: unknown, fallbackDate = new Date()): TaskRecurrence | null {
  const raw = parseMaybeJsonObject(input);
  if (!raw) return null;

  const frequency = parseFrequency(raw.frequency);
  if (!frequency) return null;

  const interval = parseIntInRange(raw.interval, 1, 1000);
  if (interval === null) return null;

  const modeRaw = String(raw.mode ?? '').trim().toLowerCase();
  if (modeRaw && modeRaw !== 'after_completion') return null;

  const recurrence: TaskRecurrence = {
    version: 1,
    frequency,
    interval,
    ...(modeRaw ? { mode: 'after_completion' as const } : {}),
  };

  if (frequency === 'weekly') {
    const weekdays = parseWeekdays(raw.weekdays);
    recurrence.weekdays = weekdays.length ? weekdays : [fallbackDate.getDay()];
  }

  if (frequency === 'monthly') {
    const monthday = parseIntInRange(raw.monthday, 1, 31);
    recurrence.monthday = monthday === null ? fallbackDate.getDate() : monthday;
  }

  return recurrence;
}

function addHours(base: Date, hours: number) {
  const d = new Date(base.getTime());
  d.setHours(d.getHours() + hours);
  return d;
}

function addDays(base: Date, days: number) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function addMonthsClamped(base: Date, months: number, monthday: number) {
  const targetMonthIndex = base.getMonth() + months;
  const yearOffset = Math.floor(targetMonthIndex / 12);
  const year = base.getFullYear() + yearOffset;
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const maxDay = daysInMonth(year, month);
  const day = Math.max(1, Math.min(monthday, maxDay));
  return new Date(
    year,
    month,
    day,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  );
}

function nextWeekly(base: Date, interval: number, weekdays: number[]) {
  const sorted = weekdays.length
    ? Array.from(new Set(weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b)
    : [base.getDay()];

  const currentDay = base.getDay();
  for (const day of sorted) {
    if (day > currentDay) {
      return addDays(base, day - currentDay);
    }
  }

  const first = sorted[0] ?? currentDay;
  const daysUntilFirst = interval * 7 - (currentDay - first);
  return addDays(base, daysUntilFirst <= 0 ? interval * 7 : daysUntilFirst);
}

export function nextRecurrenceAt(base: Date, recurrence: TaskRecurrence) {
  const interval = Math.max(1, Math.trunc(recurrence.interval));

  switch (recurrence.frequency) {
    case 'hourly': {
      return addHours(base, interval);
    }
    case 'daily': {
      return addDays(base, interval);
    }
    case 'weekly': {
      return nextWeekly(base, interval, recurrence.weekdays || []);
    }
    case 'monthly': {
      const monthday = recurrence.monthday && recurrence.monthday >= 1 && recurrence.monthday <= 31 ? recurrence.monthday : base.getDate();
      return addMonthsClamped(base, interval, monthday);
    }
    default: {
      return addDays(base, 1);
    }
  }
}
