import type { MetaSendPayload, MetaSendResponse } from './outbound';

/**
 * Typed wrapper over the Meta Graph API.
 *
 * Lives in packages/shared because both the api and the worker (downloading
 * media, sending messages) need it, and CLAUDE.md requires every outbound Meta
 * call to go through one client rather than a scattering of fetch calls.
 */

/** Shape Meta returns on failure. */
export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    /** Where Meta puts the specific reason, e.g. which parameter is invalid. */
    error_data?: { details?: string };
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

/** The one field of an account the send and upload calls need. */
export interface MetaSenderAccount {
  phoneNumberId: string;
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

  /**
   * Send one message from this account's number. Returns Meta's message id,
   * which is what every later status webhook refers to.
   */
  async sendMessage(
    account: MetaSenderAccount,
    payload: MetaSendPayload,
  ): Promise<{ waMessageId: string; response: MetaSendResponse }> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/${this.version}/${account.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    await this.throwIfError(res, 'sendMessage', {
      phoneNumberId: account.phoneNumberId,
      type: payload.type,
    });

    const response = (await res.json()) as MetaSendResponse;
    const waMessageId = response.messages?.[0]?.id;

    if (!waMessageId) {
      // A 200 without an id would leave the row unmatchable by every status
      // webhook that follows. Treat it as a failure rather than store a sent
      // message nobody can track.
      throw new MetaApiError('Meta accepted the message but returned no message id', res.status);
    }

    return { waMessageId, response };
  }

  /**
   * Upload a binary to Meta so it can be sent by id. The id is tied to this
   * phone number and, per Meta, lives for 30 days.
   */
  async uploadMedia(
    account: MetaSenderAccount,
    body: Buffer,
    mimeType: string,
    filename = 'upload',
  ): Promise<{ id: string }> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([body], { type: mimeType }), filename);

    // No content-type header: fetch sets multipart/form-data with the boundary
    // itself, and setting it by hand drops the boundary.
    const res = await this.fetchImpl(
      `${this.baseUrl}/${this.version}/${account.phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.accessToken}` },
        body: form,
      },
    );

    await this.throwIfError(res, 'uploadMedia', {
      phoneNumberId: account.phoneNumberId,
      mimeType,
      bytes: body.byteLength,
    });

    const result = (await res.json()) as { id?: string };

    if (!result.id) {
      throw new MetaApiError('Meta accepted the upload but returned no media id', res.status);
    }

    return { id: result.id };
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
        metaDetails: error?.error_data?.details,
      },
      `Meta ${operation} failed`,
    );

    // The top level message is often generic ("(#100) Invalid parameter") and
    // the useful part is in error_data.details, so keep both: this text is
    // what ends up in messages.error_message for the agent to read.
    const summary = error?.message ?? `Meta ${operation} failed with ${res.status}`;
    const details = error?.error_data?.details;

    throw new MetaApiError(
      details && details !== summary ? `${summary}: ${details}` : summary,
      res.status,
      error?.code,
      error?.error_subcode,
      error?.fbtrace_id,
      requestId,
    );
  }
}
