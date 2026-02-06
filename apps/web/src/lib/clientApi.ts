'use client';

// In some environments (notably when navigating to `http://user:pass@host/...`),
// relative fetch URLs inherit credentials from the document URL. Browsers then
// reject the request with:
//   "Request cannot be constructed from a URL that includes credentials"
// Build absolute URLs from `window.location.origin` to avoid that.

export function mcApiUrl(path: string) {
  if (!path.startsWith('/')) return path;
  try {
    const base = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`;
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

export async function mcFetch(input: string, init?: RequestInit) {
  return fetch(mcApiUrl(input), init);
}
