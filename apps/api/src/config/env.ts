import { z } from 'zod';

/**
 * Environment schema for the API.
 *
 * Validation runs once at boot through ConfigModule's `validate` hook. A
 * missing or malformed variable throws before Nest wires a single provider, so
 * the process dies immediately with a readable list of what is wrong instead of
 * failing later at the first request that needs the value.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /** Postgres connection string, e.g. postgresql://crm:crm@localhost:5432/crm */
  DATABASE_URL: z.string().url(),

  /** Redis connection string, e.g. redis://localhost:6379 */
  REDIS_URL: z.string().url(),

  /** Comma separated list of allowed browser origins for CORS. */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Secret the access tokens are signed with. Rotating it invalidates every
   * issued access token and every outstanding password reset link, because the
   * reset token is signed with this plus the user's current password hash.
   */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /** Access token lifetime. Short by design; the refresh cookie carries the session. */
  JWT_ACCESS_TTL: z.string().default('15m'),

  /** Refresh token lifetime in days. Matches the cookie Max-Age. */
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** Where the web app lives, used to build links inside emails. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  /** Resend API key. Without it, emails are logged instead of sent. */
  RESEND_API_KEY: z.string().optional(),

  /** From address for transactional email. */
  MAIL_FROM: z.string().default('CRM <onboarding@resend.dev>'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * ConfigModule validate hook. Throws with every failing variable listed, not
 * just the first one.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }

  return parsed.data;
}

/** Typed accessor so call sites do not stringly-type their config keys. */
export type ConfigKey = keyof Env;

/** WEB_ORIGIN is a comma separated list; CORS wants an array. */
export function parseOrigins(webOrigin: string): string[] {
  return webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
