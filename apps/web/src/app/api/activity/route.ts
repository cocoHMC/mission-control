import { pbFetch } from '@/lib/pbServer';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const taskId = (url.searchParams.get('taskId') || '').trim();
  const type = (url.searchParams.get('type') || '').trim();
  const page = url.searchParams.get('page') || '1';
  const perPage = url.searchParams.get('perPage') || '200';

  const q = new URLSearchParams({
    page,
    perPage,
    sort: '-created',
  });

  const filters: string[] = [];
  if (taskId) filters.push(`taskId = "${taskId}"`);
  if (type) filters.push(`type = "${type}"`);
  if (filters.length) q.set('filter', filters.join(' && '));

  const data = await pbFetch(`/api/collections/activities/records?${q.toString()}`);
  return Response.json(data);
}

