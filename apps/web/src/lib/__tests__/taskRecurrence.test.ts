import { describe, expect, test } from 'vitest';

import { normalizeTaskRecurrence, taskRecurrenceSummary } from '../taskRecurrence';

describe('taskRecurrence', () => {
  test('returns null when recurrence is empty', () => {
    expect(normalizeTaskRecurrence(null)).toBeNull();
    expect(normalizeTaskRecurrence('')).toBeNull();
  });

  test('normalizes weekly recurrence and sorts/dedupes weekdays', () => {
    const recurrence = normalizeTaskRecurrence({
      frequency: 'weekly',
      interval: 2,
      weekdays: [5, 1, 5, 3],
      mode: 'after_completion',
    });

    expect(recurrence).toEqual({
      version: 1,
      frequency: 'weekly',
      interval: 2,
      weekdays: [1, 3, 5],
      mode: 'after_completion',
    });
  });

  test('uses fallback monthday when monthly day is omitted', () => {
    const recurrence = normalizeTaskRecurrence(
      {
        frequency: 'monthly',
        interval: 1,
      },
      { fallbackDate: new Date('2026-02-24T10:00:00.000Z') }
    );

    expect(recurrence).toEqual({
      version: 1,
      frequency: 'monthly',
      interval: 1,
      monthday: 24,
    });
  });

  test('parses recurrence from JSON string', () => {
    const recurrence = normalizeTaskRecurrence('{"frequency":"hourly","interval":3,"mode":"after_completion"}');
    expect(recurrence).toEqual({
      version: 1,
      frequency: 'hourly',
      interval: 3,
      mode: 'after_completion',
    });
  });

  test('throws on invalid recurrence payload', () => {
    expect(() => normalizeTaskRecurrence({ frequency: 'yearly', interval: 1 })).toThrow(/frequency/i);
    expect(() => normalizeTaskRecurrence({ frequency: 'daily', interval: 0 })).toThrow(/interval/i);
  });

  test('builds readable summaries', () => {
    expect(taskRecurrenceSummary({ frequency: 'hourly', interval: 1 })).toBe('Every hour');
    expect(taskRecurrenceSummary({ frequency: 'daily', interval: 3 })).toBe('Every 3 days');
    expect(taskRecurrenceSummary({ frequency: 'weekly', interval: 1, weekdays: [1, 3] })).toBe('Every week on Mon, Wed');
    expect(taskRecurrenceSummary({ frequency: 'monthly', interval: 2, monthday: 15 })).toBe('Every 2 months on day 15');
  });
});
