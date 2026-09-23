import type { PrismaClient } from '@crm/db';

/**
 * Base class for every repository over a workspace scoped table.
 *
 * The rule from CLAUDE.md is that every business table has workspace_id and
 * every query filters by it. This class is how that rule is kept mechanical:
 * subclasses never write a bare where clause, they call `scope()`, which folds
 * the workspace id in and, because it is spread last, cannot be overridden by
 * caller supplied filters.
 */
export abstract class WorkspaceScopedRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  /** Fold workspaceId into a where clause. Always wins over caller filters. */
  protected scope<T extends object>(workspaceId: string, where?: T): T & { workspaceId: string } {
    return { ...((where ?? {}) as T), workspaceId };
  }
}
