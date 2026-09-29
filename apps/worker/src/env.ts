import { z } from 'zod';

/** Same fail-fast contract as the API: validate once, at boot, or die. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** How many jobs this process runs at once. */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),

  /**
   * Same AES-256-GCM key the api uses. The worker decrypts Meta access tokens
   * to download media, so the two processes must share this exactly.
   */
  ENCRYPTION_KEY: z.string().min(1),

  /** Graph API version every outbound Meta call uses. */
  META_GRAPH_VERSION: z.string().default('v20.0'),

  // Cloudflare R2. All four are optional so local development and CI can run
  // without object storage; media downloads then fail with a clear reason
  // instead of the process refusing to boot.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }

  return parsed.data;
}
