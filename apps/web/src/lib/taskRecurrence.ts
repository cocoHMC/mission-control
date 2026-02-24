import type { TaskRecurrence, TaskRecurrenceFrequency } from '@/lib/types';

const FREQUENCIES = new Set<TaskRecurrenceFrequency>(['hourly', 'daily', 'weekly', 'monthly']);

export const TASK_RECURRENCE_WEEKDAYS: Array<{ value: number; label: string; longLabel: string }> = [
  { value: 0, label: 'Sun', longLabel: 'Sunday' },
  { value: 1, label: 'Mon', longLabel: 'Monday' },
  { value: 2, label: 'Tue', longLabel: 'Tuesday' },
  { value: 3, label: 'Wed', longLabel: 'Wednesday' },
  { value: 4, label: 'Thu', longLabel: 'Thursday' },
  { value: 5, label: 'Fri', longLabel: 'Friday' },
  { value: 6, label: 'Sat', longLabel: 'Saturday' },
];

function toDate(value: unknown) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseIntInRange(value: unknown, min: number, max: number) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.trunc(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
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
      throw new Error('Recurrence must be valid JSON.');
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Recurrence must be an object.');
  }
  return input as Record<string, unknown>;
}

export function normalizeTaskRecurrence(input: unknown, opts?: { fallbackDate?: Date }): TaskRecurrence | null {
  const raw = parseMaybeJsonObject(input);
  if (!raw) return null;

  const fallback = opts?.fallbackDate && Number.isFinite(opts.fallbackDate.getTime()) ? opts.fallbackDate : new Date();
  const fallbackWeekday = fallback.getDay();
  const fallbackMonthday = fallback.getDate();

  const frequency = parseFrequency(raw.frequency);
  if (!frequency) {
    throw new Error('Recurrence frequency must be hourly, daily, weekly, or monthly.');
  }

  const interval = parseIntInRange(raw.interval, 1, 1000);
  if (interval === null) {
    throw new Error('Recurrence interval must be a whole number between 1 and 1000.');
  }

  const modeRaw = String(raw.mode ?? '').trim().toLowerCase();
  if (modeRaw && modeRaw !== 'after_completion') {
    throw new Error('Recurrence mode must be "after_completion".');
  }

  const recurrence: TaskRecurrence = {
    version: 1,
    frequency,
    interval,
    ...(modeRaw ? { mode: 'after_completion' as const } : {}),
  };

  if (frequency === 'weekly') {
    const weekdays = parseWeekdays(raw.weekdays);
    recurrence.weekdays = weekdays.length ? weekdays : [fallbackWeekday];
  }

  if (frequency === 'monthly') {
    const monthday = parseIntInRange(raw.monthday, 1, 31);
    recurrence.monthday = monthday === null ? fallbackMonthday : monthday;
  }

  return recurrence;
}

export function taskRecurrenceSummary(recurrence: unknown) {
  let parsed: TaskRecurrence | null = null;
  try {
    parsed = normalizeTaskRecurrence(recurrence);
  } catch {
    return '';
  }
  if (!parsed) return '';

  const interval = parsed.interval;
  if (parsed.frequency === 'hourly') {
    return interval === 1 ? 'Every hour' : `Every ${interval} hours`;
  }

  if (parsed.frequency === 'daily') {
    return interval === 1 ? 'Every day' : `Every ${interval} days`;
  }

  if (parsed.frequency === 'weekly') {
    const days = (parsed.weekdays || [])
      .map((day) => TASK_RECURRENCE_WEEKDAYS.find((d) => d.value === day)?.label)
      .filter(Boolean)
      .join(', ');
    const base = interval === 1 ? 'Every week' : `Every ${interval} weeks`;
    return days ? `${base} on ${days}` : base;
  }

  const monthday = parsed.monthday || 1;
  if (parsed.frequency === 'monthly') {
    const base = interval === 1 ? 'Every month' : `Every ${interval} months`;
    return `${base} on day ${monthday}`;
  }

  return '';
}

export function fallbackRecurrenceDate(...values: Array<unknown>) {
  for (const value of values) {
    const parsed = toDate(value);
    if (parsed) return parsed;
  }
  return new Date();
}
