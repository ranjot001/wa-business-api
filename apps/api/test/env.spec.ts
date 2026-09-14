import { describe, expect, it } from 'vitest';
import { parseOrigins, validateEnv } from '../src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://crm:crm@localhost:5432/crm',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv({ ...valid });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces PORT to a number', () => {
    const env = validateEnv({ ...valid, PORT: '4100' });
    expect(env.PORT).toBe(4100);
  });

  it('throws and names every missing variable', () => {
    expect(() => validateEnv({})).toThrowError(/DATABASE_URL/);
    expect(() => validateEnv({})).toThrowError(/REDIS_URL/);
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
