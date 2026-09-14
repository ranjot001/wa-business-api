import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * PrismaClient singleton.
 *
 * A single instance per process. In development the Next.js and Nest watchers
 * reload modules, so the client is cached on globalThis to avoid exhausting
 * the Postgres connection pool with a new client on every reload.
 */
const globalForPrisma = globalThis as unknown as { __crmPrisma?: PrismaClient };

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.__crmPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__crmPrisma = prisma;
}

/** Cheap liveness probe used by GET /v1/ready. */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
