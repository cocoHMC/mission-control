export type InboxMode = 'all' | 'mc' | 'dm' | 'group' | 'cron' | 'other';

export const inboxFilters: Array<{ id: InboxMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mc', label: 'Tasks' },
  { id: 'dm', label: 'DMs' },
  { id: 'group', label: 'Groups' },
  { id: 'cron', label: 'Cron' },
  { id: 'other', label: 'Other' },
];

