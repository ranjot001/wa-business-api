import { ApiError, getApiUrl } from './api';

/** Where the active workspace id is remembered between visits. */
export const ACTIVE_WORKSPACE_KEY = 'crm.active_workspace_id';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface SessionWorkspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'agent';
}

/**
 * Browser side API client.
 *
 * The access token lives in this object and nowhere else: not localStorage,
 * not a readable cookie, so a cross site script cannot lift it out of storage.
 * It survives a reload only because the httpOnly refresh cookie can mint a new
 * one, which is what `refresh()` does on boot.
 */
export class AuthClient {
  private accessToken: string | null = null;

  /** In flight refresh, so ten parallel 401s cause one refresh and not ten. */
  private refreshing: Promise<string | null> | null = null;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  hasAccessToken(): boolean {
    return this.accessToken !== null;
  }

  /** Exchange the refresh cookie for a new access token. Null when signed out. */
  async refresh(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });

    return this.refreshing;
  }

  private async doRefresh(): Promise<string | null> {
    const res = await fetch(`${getApiUrl()}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      this.accessToken = null;
      return null;
    }

    const body = (await res.json()) as { access_token: string };
    this.accessToken = body.access_token;
    return body.access_token;
  }

  /**
   * One authenticated request. A 401 triggers exactly one refresh and one
   * retry; a second 401 means the session is really gone and the error
   * propagates so the provider can send the user to /login.
   */
  async request<T>(path: string, init: RequestInit & { workspaceId?: string } = {}): Promise<T> {
    const { workspaceId, ...rest } = init;

    const send = async (token: string | null): Promise<Response> =>
      fetch(`${getApiUrl()}/v1${path}`, {
        ...rest,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
          ...rest.headers,
        },
      });

    let res = await send(this.accessToken);

    if (res.status === 401) {
      const token = await this.refresh();
      if (token) {
        res = await send(token);
      }
    }

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

    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  /** Unauthenticated POST, for register, login and the rest of /v1/auth. */
  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${getApiUrl()}/v1${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      throw new ApiError(
        payload?.error?.code ?? 'INTERNAL_ERROR',
        payload?.error?.message ?? res.statusText,
        res.status,
      );
    }

    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }
}
