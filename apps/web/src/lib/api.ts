import { deliverFile, isNative } from './platform';

const TOKEN_KEY = 'bnhs.token';
const SERVER_KEY = 'bnhs.server';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ token + server address

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: the session simply will not survive a reload */
  }
}

export const getToken = (): string | null => read(TOKEN_KEY);
export const setToken = (t: string | null): void => write(TOKEN_KEY, t);

/** Address of the school server. Empty on the web (same origin), set by the user in the Android app. */
export function getServerUrl(): string {
  return (read(SERVER_KEY) ?? '').replace(/\/+$/, '');
}
export function setServerUrl(url: string): void {
  write(SERVER_KEY, url.trim().replace(/\/+$/, '') || null);
}
/** The Android app cannot guess where the school server is. */
export const needsServerSetup = (): boolean => isNative() && !getServerUrl();

export function normalizeServerUrl(input: string): string {
  let u = input.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
}

// ------------------------------------------------------------------ requests

const UNAUTHORIZED_EVENT = 'bnhs:unauthorized';
export const onUnauthorized = (fn: () => void): (() => void) => {
  window.addEventListener(UNAUTHORIZED_EVENT, fn);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, fn);
};

async function request(path: string, init: RequestInit = {}, base = getServerUrl()): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${base}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the school server. Check your connection and the server address.', 'NETWORK');
  }
  if (!res.ok) {
    let body: { error?: string; code?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    if (res.status === 401 && token && path !== '/auth/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code, body.details);
  }
  return res;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await request(path, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  return (await res.json()) as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });

/** Checks that an address really is a BNHS grading server. Used by the connect screen. */
export async function pingServer(base: string): Promise<{ name: string; version: string }> {
  const res = await request('/health', {}, base);
  const data = (await res.json()) as { ok?: boolean; name?: string; version?: string };
  if (!data.ok) throw new ApiError(0, 'That address answered, but it is not the grading server.');
  return { name: data.name ?? '', version: data.version ?? '' };
}

/** Downloads a report (PDF or Excel) with the user's login and delivers it. */
export async function downloadReport(path: string, filename: string): Promise<void> {
  // open the tab now (inside the click) so pop-up blockers stay quiet; PDFs load into it later
  const tab = !isNative() && filename.endsWith('.pdf') ? window.open('', '_blank') : null;
  try {
    const res = await request(path);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? filename;
    await deliverFile(blob, name, tab);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
