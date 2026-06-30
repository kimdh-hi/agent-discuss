import { getToken, clearAuth } from './storage';

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function handleError(res: Response): Promise<never> {
  let message = `요청 실패 (${res.status})`;
  try {
    const data = (await res.json()) as { message?: string };
    if (data.message) message = data.message;
  } catch {
    // ignore
  }
  if (res.status === 401) {
    clearAuth();
    window.location.reload();
  }
  throw new ApiError(res.status, message);
}

export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { method = 'GET', body } = options;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return handleError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = getToken();
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  if (!res.ok) return handleError(res);
  return res.json() as Promise<T>;
}

export async function apiStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return handleError(res);
  return res;
}

export async function apiStreamGet(path: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: authHeaders(),
    signal,
  });
  if (!res.ok) return handleError(res);
  return res;
}

export async function* parseSse(
  res: Response,
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const block of parts) {
      const ev = (block.match(/event: (.*)/) ?? [])[1];
      const dataStr = (block.match(/data: (.*)/) ?? [])[1];
      if (ev && dataStr) {
        try {
          yield { event: ev, data: JSON.parse(dataStr) as Record<string, unknown> };
        } catch {
          // ignore malformed SSE block
        }
      }
    }
  }
}
