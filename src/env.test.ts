import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

/**
 * A complete, valid environment. Individual tests clone this and remove or
 * corrupt one key, so that each assertion isolates a single failure.
 */
function validEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://user:pass@ep-test.us-east-2.aws.neon.tech/recorddb',
    TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/record_collection_test',
    APP_PASSWORD_HASH: '$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR',
    SESSION_SECRET: 'a-session-secret-that-is-at-least-32-chars',
    CRON_SECRET: 'a-cron-secret-that-is-at-least-32-characters',
    DISCOGS_TOKEN: 'discogs-personal-access-token',
    ANTHROPIC_API_KEY: 'sk-ant-fake-key-for-tests',
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_faketoken',
    NODE_ENV: 'test',
  };
}

describe('parseEnv', () => {
  it('accepts an environment with every variable present', () => {
    const parsed = parseEnv(validEnv());

    expect(parsed.DATABASE_URL).toBe(
      'postgresql://user:pass@ep-test.us-east-2.aws.neon.tech/recorddb',
    );
    expect(parsed.TEST_DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5433/record_collection_test',
    );
    expect(parsed.DISCOGS_TOKEN).toBe('discogs-personal-access-token');
    expect(parsed.ANTHROPIC_API_KEY).toBe('sk-ant-fake-key-for-tests');
    expect(parsed.BLOB_READ_WRITE_TOKEN).toBe('vercel_blob_rw_faketoken');
  });

  describe('required variables', () => {
    const required = [
      'DATABASE_URL',
      'APP_PASSWORD_HASH',
      'SESSION_SECRET',
      'CRON_SECRET',
      'DISCOGS_TOKEN',
    ] as const;

    for (const key of required) {
      it(`throws and names ${key} when it is missing`, () => {
        const source = validEnv();
        delete source[key];

        expect(() => parseEnv(source)).toThrowError(new RegExp(key));
      });

      it(`throws and names ${key} when it is an empty string`, () => {
        const source = { ...validEnv(), [key]: '' };

        expect(() => parseEnv(source)).toThrowError(new RegExp(key));
      });
    }

    it('names every missing variable when several are absent at once', () => {
      const source = validEnv();
      delete source.DATABASE_URL;
      delete source.SESSION_SECRET;

      let message = '';
      try {
        parseEnv(source);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('SESSION_SECRET');
    });
  });

  describe('optional variables', () => {
    // Per build plan: these are not needed until steps 8 and 12, so the dev
    // server must start without them.
    it('parses without ANTHROPIC_API_KEY', () => {
      const source = validEnv();
      delete source.ANTHROPIC_API_KEY;

      const parsed = parseEnv(source);

      expect(parsed.ANTHROPIC_API_KEY).toBeUndefined();
      expect(parsed.DATABASE_URL).toBeDefined();
    });

    it('parses without BLOB_READ_WRITE_TOKEN', () => {
      const source = validEnv();
      delete source.BLOB_READ_WRITE_TOKEN;

      const parsed = parseEnv(source);

      expect(parsed.BLOB_READ_WRITE_TOKEN).toBeUndefined();
    });

    it('parses without TEST_DATABASE_URL', () => {
      const source = validEnv();
      delete source.TEST_DATABASE_URL;

      const parsed = parseEnv(source);

      expect(parsed.TEST_DATABASE_URL).toBeUndefined();
    });
  });

  describe('DATABASE_URL validation', () => {
    it('rejects a DATABASE_URL that is not a URL at all', () => {
      const source = { ...validEnv(), DATABASE_URL: 'not-a-url' };

      expect(() => parseEnv(source)).toThrowError(/DATABASE_URL/);
    });

    it('rejects a DATABASE_URL with a non-postgres scheme', () => {
      const source = { ...validEnv(), DATABASE_URL: 'mysql://user:pass@localhost:3306/db' };

      expect(() => parseEnv(source)).toThrowError(/DATABASE_URL/);
    });

    it('rejects a DATABASE_URL missing a host', () => {
      const source = { ...validEnv(), DATABASE_URL: 'postgresql:///recorddb' };

      expect(() => parseEnv(source)).toThrowError(/DATABASE_URL/);
    });

    it('accepts the postgres:// scheme as well as postgresql://', () => {
      const source = { ...validEnv(), DATABASE_URL: 'postgres://user:pass@localhost:5432/db' };

      expect(parseEnv(source).DATABASE_URL).toBe('postgres://user:pass@localhost:5432/db');
    });

    it('rejects a malformed TEST_DATABASE_URL when one is supplied', () => {
      const source = { ...validEnv(), TEST_DATABASE_URL: 'not-a-url' };

      expect(() => parseEnv(source)).toThrowError(/TEST_DATABASE_URL/);
    });
  });

  describe('secret strength', () => {
    it('rejects a SESSION_SECRET shorter than 32 characters', () => {
      const source = { ...validEnv(), SESSION_SECRET: 'too-short' };

      expect(() => parseEnv(source)).toThrowError(/SESSION_SECRET/);
    });

    it('rejects a CRON_SECRET shorter than 32 characters', () => {
      const source = { ...validEnv(), CRON_SECRET: 'too-short' };

      expect(() => parseEnv(source)).toThrowError(/CRON_SECRET/);
    });
  });

  it('rejects unknown keys silently rather than failing', () => {
    // process.env always carries dozens of unrelated keys (PATH, HOME, ...),
    // so the schema must ignore extras instead of rejecting them.
    const source = { ...validEnv(), PATH: '/usr/bin', HOME: '/Users/someone' };

    expect(() => parseEnv(source)).not.toThrow();
  });
});
