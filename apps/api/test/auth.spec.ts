import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as argon2 from 'argon2';

/**
 * The database is mocked rather than migrated. These tests are about the auth
 * and guard wiring, not about Prisma, and CI runs them before any migration
 * has been applied to its Postgres service.
 */
const db = vi.hoisted(() => {
  const user = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const refreshToken = {
    create: vi.fn(async () => ({})),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  const workspaceMember = { findUnique: vi.fn(), findFirst: vi.fn() };
  const workspace = { update: vi.fn(), findFirst: vi.fn() };
  return { prisma: { user, refreshToken, workspaceMember, workspace }, pingDatabase: vi.fn() };
});

vi.mock('@crm/db', () => db);

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AuthModule } from '../src/auth/auth.module';
import { AuditModule } from '../src/audit/audit.module';
import { AuditRepository } from '../src/audit/audit.repository';
import { WorkspacesModule } from '../src/workspaces/workspaces.module';
import { MeModule } from '../src/me/me.module';

const PASSWORD = 'correct-horse-battery';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function makeUser(passwordHash: string) {
  return {
    id: USER_ID,
    email: 'agent@example.com',
    name: 'Agent',
    avatarUrl: null,
    passwordHash,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('auth and guards', () => {
  let app: INestApplication;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
              JWT_ACCESS_TTL: '15m',
              REFRESH_TTL_DAYS: 30,
              APP_URL: 'http://localhost:3000',
              MAIL_FROM: 'CRM <test@example.com>',
            }),
          ],
        }),
        PassportModule,
        JwtModule.register({}),
        // The real limit is 10 a minute; these tests sign in far more often
        // than that and the throttler is not what they are checking.
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }]),
        AuditModule,
        AuthModule,
        MeModule,
        WorkspacesModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    })
      .overrideProvider(AuditRepository)
      .useValue({ record: vi.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Register, then use the returned access token to reach a guarded route. */
  async function signIn(): Promise<string> {
    db.prisma.user.findUnique.mockResolvedValue(makeUser(passwordHash));
    db.prisma.user.update.mockResolvedValue(makeUser(passwordHash));

    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'agent@example.com', password: PASSWORD })
      .expect(200);

    return (res.body as { access_token: string }).access_token;
  }

  describe('POST /v1/auth/register', () => {
    it('creates the account, returns an access token and sets the refresh cookie', async () => {
      db.prisma.user.findUnique.mockResolvedValue(null);
      db.prisma.user.create.mockResolvedValue(makeUser(passwordHash));

      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'agent@example.com', password: PASSWORD, name: 'Agent' })
        .expect(201);

      const body = res.body as { user: { email: string }; access_token: string };
      expect(body.user.email).toBe('agent@example.com');
      expect(body.access_token).toEqual(expect.any(String));
      expect(body).not.toHaveProperty('user.passwordHash');

      const cookie = res.headers['set-cookie'] as unknown as string[];
      expect(cookie.join(';')).toContain('refresh_token=');
      expect(cookie.join(';')).toContain('HttpOnly');
    });

    it('rejects an email that already exists with EMAIL_TAKEN', async () => {
      db.prisma.user.findUnique.mockResolvedValue(makeUser(passwordHash));

      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'agent@example.com', password: PASSWORD, name: 'Agent' })
        .expect(409);

      expect((res.body as { error: { code: string } }).error.code).toBe('EMAIL_TAKEN');
    });

    it('rejects a short password with VALIDATION_FAILED', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'agent@example.com', password: 'short', name: 'Agent' })
        .expect(400);

      expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /v1/auth/login', () => {
    it('returns an access token for the right password', async () => {
      const token = await signIn();
      expect(token).toEqual(expect.any(String));
    });

    it('rejects the wrong password with INVALID_CREDENTIALS', async () => {
      db.prisma.user.findUnique.mockResolvedValue(makeUser(passwordHash));

      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'agent@example.com', password: 'not-the-password' })
        .expect(401);

      expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
    });

    it('gives the same answer for an unknown email, so accounts cannot be probed', async () => {
      db.prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('JwtAuthGuard', () => {
    it('rejects a request with no access token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/me').expect(401);
      expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a garbage access token', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);

      expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('WorkspaceGuard', () => {
    it('rejects a workspace scoped route with no X-Workspace-Id header', async () => {
      const token = await signIn();
      db.prisma.user.findUnique.mockResolvedValue(makeUser(passwordHash));

      const res = await request(app.getHttpServer())
        .get('/v1/workspaces/current')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect((res.body as { error: { code: string } }).error.code).toBe('WORKSPACE_REQUIRED');
    });

    it('rejects a workspace the caller is not a member of', async () => {
      const token = await signIn();
      db.prisma.user.findUnique.mockResolvedValue(makeUser(passwordHash));
      db.prisma.workspaceMember.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/v1/workspaces/current')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Workspace-Id', WORKSPACE_ID)
        .expect(403);

      expect((res.body as { error: { code: string } }).error.code).toBe('NOT_A_MEMBER');
    });
  });

  describe('RolesGuard', () => {
    /** Membership as an agent, which is below the admin floor on PATCH. */
    function asAgent(): void {
      db.prisma.user.findUnique.mockResolvedValue(makeUser(passwordHash));
      db.prisma.workspaceMember.findUnique.mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        role: 'agent',
        createdAt: new Date(),
        updatedAt: new Date(),
        workspace: {
          id: WORKSPACE_ID,
          name: 'Demo',
          slug: 'demo',
          timezone: 'UTC',
          plan: 'trial',
          subscriptionStatus: 'trialing',
          trialEndsAt: new Date(),
          businessHours: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    it('lets an agent read the workspace', async () => {
      const token = await signIn();
      asAgent();

      const res = await request(app.getHttpServer())
        .get('/v1/workspaces/current')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Workspace-Id', WORKSPACE_ID)
        .expect(200);

      expect((res.body as { slug: string }).slug).toBe('demo');
    });

    it('refuses an agent updating the workspace with FORBIDDEN', async () => {
      const token = await signIn();
      asAgent();

      const res = await request(app.getHttpServer())
        .patch('/v1/workspaces/current')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Workspace-Id', WORKSPACE_ID)
        .send({ name: 'Renamed' })
        .expect(403);

      expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
      expect(db.prisma.workspace.update).not.toHaveBeenCalled();
    });
  });
});
