/**
 * Typed wrapper over the Meta Graph API.
 *
 * Lives in packages/shared because both the api (sending) and the worker
 * (downloading media) need it, and CLAUDE.md requires every outbound Meta call
 * to go through one client rather than a scattering of fetch calls.
 */

/** Shape Meta returns on failure. */
export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Thrown for any non 2xx from Graph, carrying the bits worth logging. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly fbtraceId?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }

  /**
   * Meta's transient failures: rate limits and its own 5xx. Everything else,
   * a bad token or a malformed request, will fail again no matter how many
   * times it is retried.
   */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export interface MetaMediaInfo {
  id: string;
  url: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
}

export interface MetaClientOptions {
  accessToken: string;
  /** Graph API version, e.g. "v20.0". */
  version: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onLog?: (fields: Record<string, unknown>, message: string) => void;
}

const DEFAULT_BASE_URL = 'https://graph.facebook.com';

export class MetaClient {
  private readonly accessToken: string;
  private readonly version: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onLog: (fields: Record<string, unknown>, message: string) => void;

  constructor(options: MetaClientOptions) {
    this.accessToken = options.accessToken;
    this.version = options.version;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onLog = options.onLog ?? ((): void => undefined);
  }

  /** Media metadata, including the short lived download url. */
  async getMedia(mediaId: string): Promise<MetaMediaInfo> {
    const res = await this.fetchImpl(`${this.baseUrl}/${this.version}/${mediaId}`, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });

    await this.throwIfError(res, 'getMedia', { mediaId });

    return (await res.json()) as MetaMediaInfo;
  }

  /**
   * The binary itself. The url from getMedia is on a Meta CDN host but still
   * needs the access token, which is easy to miss: without the header it
   * answers 401 rather than the file.
   */
  async downloadMedia(url: string): Promise<{ body: Buffer; contentType: string | null }> {
    const res = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });

    await this.throwIfError(res, 'downloadMedia', { url });

    const body = Buffer.from(await res.arrayBuffer());
    return { body, contentType: res.headers.get('content-type') };
  }

  private async throwIfError(
    res: Response,
    operation: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    if (res.ok) {
      return;
    }

    // Meta puts the useful detail in the body, not the status text, and the
    // trace id is what their support asks for first.
    const body = (await res.json().catch(() => null)) as MetaErrorBody | null;
    const requestId = res.headers.get('x-fb-request-id') ?? undefined;
    const error = body?.error;

    this.onLog(
      {
        ...context,
        operation,
        status: res.status,
        metaCode: error?.code,
        metaSubcode: error?.error_subcode,
        fbtraceId: error?.fbtrace_id,
        requestId,
        metaMessage: error?.message,
      },
      `Meta ${operation} failed`,
    );

    throw new MetaApiError(
      error?.message ?? `Meta ${operation} failed with ${res.status}`,
      res.status,
      error?.code,
      error?.error_subcode,
      error?.fbtrace_id,
      requestId,
    );
  }
}
