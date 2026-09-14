/**
 * Seed script placeholder.
 *
 * Run with `pnpm db:seed`. Real seed data (a demo workspace, user and a few
 * contacts) arrives with the tasks that introduce those models.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('seed: nothing to seed yet');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
