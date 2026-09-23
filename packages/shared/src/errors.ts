/**
 * Canonical application error codes. Every error response body uses one of
 * these in { error: { code, message, details } }.
 */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // auth and workspace membership
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  WORKSPACE_REQUIRED: 'WORKSPACE_REQUIRED',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  LAST_OWNER: 'LAST_OWNER',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_ALREADY_ACCEPTED: 'INVITATION_ALREADY_ACCEPTED',
  PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Cursor paginated list shape used by every list endpoint. */
export interface Paginated<T> {
  data: T[];
  next_cursor: string | null;
}
