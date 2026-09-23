/**
 * Seed script. Run with `pnpm db:seed`.
 *
 * Creates the one user and one workspace task 02 asks for. Idempotent: running
 * it twice leaves the same single owner of the same single workspace, so it is
 * safe against a database that has already been seeded.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'ranjot@example.com';
const SEED_PASSWORD = process.env.SEED_PASSWORD;
const SEED_WORKSPACE = process.env.SEED_WORKSPACE ?? 'Demo';

async function main(): Promise<void> {
  if (!SEED_PASSWORD) {
    throw new Error('SEED_PASSWORD is required. Set it in packages/db/.env before seeding.');
  }

  const passwordHash = await argon2.hash(SEED_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: SEED_EMAIL },
    create: { email: SEED_EMAIL, name: 'Ranjot', passwordHash },
    update: { passwordHash },
  });

  const slug = SEED_WORKSPACE.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const workspace = await prisma.workspace.upsert({
    where: { slug },
    create: {
      name: SEED_WORKSPACE,
      slug,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    update: {},
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: { workspaceId: workspace.id, userId: user.id, role: 'owner' },
    update: { role: 'owner' },
  });

  // eslint-disable-next-line no-console
  console.log(`seed: ${user.email} owns "${workspace.name}" (${workspace.slug})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
