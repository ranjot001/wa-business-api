import { describe, expect, it } from 'vitest';
import { parseOrigins, validateEnv } from '../src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://crm:crm@localhost:5432/crm',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-secret-that-is-at-least-32-characters-long',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv({ ...valid });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.REFRESH_TTL_DAYS).toBe(30);
  });

  it('coerces PORT to a number', () => {
    const env = validateEnv({ ...valid, PORT: '4100' });
    expect(env.PORT).toBe(4100);
  });

  it('throws and names every missing variable', () => {
    expect(() => validateEnv({})).toThrowError(/DATABASE_URL/);
    expect(() => validateEnv({})).toThrowError(/REDIS_URL/);
    expect(() => validateEnv({})).toThrowError(/JWT_SECRET/);
  });

  it('rejects a JWT_SECRET that is too short to be worth signing with', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrowError(
      /at least 32 characters/,
    );
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrowError(
      /Invalid environment variables/,
    );
  });
});

describe('parseOrigins', () => {
  it('splits a comma separated list and trims blanks', () => {
    expect(parseOrigins('http://a.test, http://b.test ,')).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });
});
