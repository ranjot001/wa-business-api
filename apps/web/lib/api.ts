/**
 * Small typed fetch wrapper for the API. Every response that is not 2xx is
 * assumed to carry the standard { error: { code, message, details } } body.
 */

/**
 * Base URL of the API, without a trailing slash and without the /v1 suffix.
 *
 * Read on every call rather than captured in a module level constant, because
 * `NEXT_PUBLIC_API_URL` is inlined into the bundle when the app is built. A
 * value set on the host after that build never reaches the running process.
 * The server only `API_URL` is read from the real environment at request time,
 * so changing it needs a restart and not a rebuild, and it wins when both are
 * set. `NEXT_PUBLIC_API_URL` stays as the fallback because it is the only one
 * of the two that survives into the browser bundle.
 */
export function getApiUrl(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

/**
 * What the browser calls instead of the API's own origin.
 *
 * Relative on purpose. The rewrite in next.config.mjs forwards it to API_URL
 * server side, which keeps the API's hostname out of the client bundle and
 * keeps the refresh cookie on the same site as the app. Server side code uses
 * getApiUrl() and talks to the API directly, with no proxy hop.
 */
export const BROWSER_API_BASE = '/api/v1';

export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiUrl()}/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? res.statusText,
      res.status,
    );
  }

  return (await res.json()) as T;
}
