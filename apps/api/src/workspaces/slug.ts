import { randomBytes } from 'node:crypto';
import { prisma } from '@crm/db';

/** "Ranjot's Team!" -> "ranjot-s-team" */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug.length > 0 ? slug : 'workspace';
}

/**
 * A slug nobody is using yet. Slugs are unique across the whole table, so two
 * workspaces called "Demo" cannot both take "demo"; the second gets a short
 * random suffix rather than a counter, which would leak how many exist.
 */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
    const taken = await prisma.workspace.findUnique({ where: { slug: candidate } });
    if (!taken) {
      return candidate;
    }
  }

  return `${base}-${randomBytes(6).toString('hex')}`;
}
