const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
export type ApiError = { error?: { code?: string; message?: string; requestId?: string }; detail?: string };
function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}
export async function apiFetch<T>(path: string, init: RequestInit = {}, retryRefresh = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const csrf = readCookie('csrf_token');
  if (csrf && !headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers, credentials:'include', cache:'no-store' });
  if (response.status === 401 && retryRefresh && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && !path.startsWith('/auth/refresh')) {
    const refreshHeaders = new Headers();
    const refreshCsrf = readCookie('csrf_token');
    if (refreshCsrf) refreshHeaders.set('X-CSRF-Token', refreshCsrf);
    const refresh = await fetch(`${API_BASE}/auth/refresh`, { method:'POST', headers:refreshHeaders, credentials:'include', cache:'no-store' });
    if (refresh.ok) return apiFetch<T>(path, init, false);
  }
  if (!response.ok) {
    let body: ApiError = {};
    try { body = await response.json(); } catch { /* ignore non-JSON response */ }
    const message = body.error?.message ?? (typeof body.detail === 'string' ? body.detail : `Request failed (${response.status}).`);
    throw Object.assign(new Error(message), { status: response.status, code: body.error?.code ?? 'REQUEST_FAILED', requestId: body.error?.requestId });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function getCsrfToken() { return readCookie('csrf_token'); }
export { API_BASE };
