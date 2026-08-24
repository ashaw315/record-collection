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
    // 60 characters exactly: `$2b$12$` plus 53 of bcrypt's base64 alphabet.
    // This read `...MNOPQR` and was SIXTY-ONE characters — not a bcrypt hash,
    // and accepted only because the schema checked `.min(1)`. Corrected when
    // the shape check landed; a test below asserts the length so the fixture
    // cannot drift back.
    APP_PASSWORD_HASH: '$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ',
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

    /**
     * The existing cases assert only that the variable is NAMED, which left the
     * reason entirely unconstrained — the `issue.code === 'invalid_type' ? 'is
     * missing'` branch could be deleted with no test failing. That is the same
     * shape as the dead isUniqueViolation: live code, confident comment, no
     * coverage. These pin the reason text.
     */
    it('says "is missing" for an absent variable, not a raw Zod message', () => {
      const source = validEnv();
      delete source.SESSION_SECRET;

      expect(() => parseEnv(source)).toThrowError(/SESSION_SECRET is missing/);
    });

    it('gives a present-but-invalid variable its real reason, not "is missing"', () => {
      // A value that is present but too short is NOT missing, and saying so
      // sends an operator looking for an unset variable that is in fact set.
      const source = { ...validEnv(), SESSION_SECRET: 'too-short' };

      const run = () => parseEnv(source);
      expect(run).toThrowError(/SESSION_SECRET/);
      expect(run).not.toThrowError(/SESSION_SECRET is missing/);
    });

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

  /**
   * Every test here fails against `APP_PASSWORD_HASH: z.string().min(1)` in
   * src/lib/env/schema.ts — the line these replace.
   *
   * The failure this closes is not hypothetical and not a wrong password. A
   * malformed hash boots green, renders a normal /login, and rejects the
   * CORRECT password forever with 401 "Incorrect password" and no log line,
   * because bcryptjs returns false rather than throwing and the login route is
   * not wrapped in withErrorHandling. Every other misconfiguration in this
   * schema announces itself; this one produces a deploy that looks healthy.
   */
  describe('APP_PASSWORD_HASH shape', () => {
    /**
     * Built from a real hash's structure rather than pasted, and asserted to be
     * 60 characters, because the precondition is the whole point: the fixture
     * that used to sit in validEnv() was 61 characters and therefore not a
     * bcrypt hash at all, so a test using it would have passed whatever the
     * schema did.
     */
    const VALID = `$2b$12$${'a'.repeat(53)}`;

    it('the fixture used here is genuinely 60 characters', () => {
      expect(VALID).toHaveLength(60);
      expect(validEnv().APP_PASSWORD_HASH).toHaveLength(60);
    });

    it('accepts a well-formed bcrypt hash', () => {
      const source = { ...validEnv(), APP_PASSWORD_HASH: VALID };

      expect(() => parseEnv(source)).not.toThrow();
    });

    it.each(['$2a$', '$2b$', '$2y$'])('accepts the %s prefix', (prefix) => {
      const source = { ...validEnv(), APP_PASSWORD_HASH: `${prefix}10$${'b'.repeat(53)}` };

      expect(() => parseEnv(source)).not.toThrow();
    });

    /**
     * The two env loaders disagree, and these pin the resolution.
     *
     * `.env.test` and `.env.local` must escape the hash as `\$2b\$10\$` because
     * Next expands `$VAR` in env values. dotenv — which vitest and drizzle-kit
     * use — neither expands nor unescapes, so it hands over 63 characters with
     * the backslashes intact. Before the transform, that made every integration
     * test fail with "Invalid environment configuration": 902 of them.
     */
    it('accepts the escaped form dotenv hands over verbatim', () => {
      const escaped = `\\$2b\\$12\\$${'a'.repeat(53)}`;
      expect(escaped).toHaveLength(63);

      const parsed = parseEnv({ ...validEnv(), APP_PASSWORD_HASH: escaped });

      // Normalised, so bcrypt.compare receives a real hash rather than one
      // carrying backslashes it would never match.
      expect(parsed.APP_PASSWORD_HASH).toBe(VALID);
      expect(parsed.APP_PASSWORD_HASH).toHaveLength(60);
    });

    it('leaves an unescaped Vercel-style value untouched', () => {
      const parsed = parseEnv({ ...validEnv(), APP_PASSWORD_HASH: VALID });

      expect(parsed.APP_PASSWORD_HASH).toBe(VALID);
    });

    /**
     * Unescaping must not become a way to smuggle a bad hash past the check —
     * that would rebuild the defect this whole unit exists to close.
     */
    it('still rejects a truncated hash written in the escaped form', () => {
      const escapedTruncation = `\\$2b\\$12\\$${'a'.repeat(39)}`;

      expect(() =>
        parseEnv({ ...validEnv(), APP_PASSWORD_HASH: escapedTruncation }),
      ).toThrowError(/APP_PASSWORD_HASH/);
    });

    /**
     * THE case. Next expands $VAR references in env values, which silently
     * truncates an unescaped 60-character hash to 46 — the trap .env.example
     * documents in full and the schema did not enforce. R6 reproduced it: 46
     * characters passed boot, and bcryptjs returned false rather than throwing.
     */
    it('rejects the 46-character truncation an unescaped $ produces', () => {
      const source = { ...validEnv(), APP_PASSWORD_HASH: VALID.slice(0, 46) };

      expect(() => parseEnv(source)).toThrowError(/APP_PASSWORD_HASH/);
    });

    it.each([
      ['a plaintext password', 'hunter2'],
      ['a single space', ' '],
      // 62 characters: what .env.example carried until the shape check landed.
      ['a hash two characters too long', '$2b$12$replace.this.with.a.real.bcrypt.hash.value.0123456789ab'],
      ['an unknown algorithm prefix', `$2x$12$${'a'.repeat(53)}`],
      ['a non-numeric cost', `$2b$xx$${'a'.repeat(53)}`],
      ['one character too few', `$2b$12$${'a'.repeat(52)}`],
      ['one character too many', `$2b$12$${'a'.repeat(54)}`],
      ['a character outside bcrypt base64', `$2b$12$${'a'.repeat(52)}!`],
    ])('rejects %s', (_label, hash) => {
      const source = { ...validEnv(), APP_PASSWORD_HASH: hash };

      expect(() => parseEnv(source)).toThrowError(/APP_PASSWORD_HASH/);
    });

    /**
     * A file-text assertion, and it is the right instrument here because the
     * property IS about a file: `.env.example` is copied by hand, so a
     * placeholder of the wrong shape teaches the wrong shape. It carried a
     * 62-character value until the shape check landed. No behavioural test can
     * see this, because nothing imports `.env.example`.
     */
    it('.env.example ships a placeholder of the right shape', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');

      const text = readFileSync(join(import.meta.dirname, '..', '.env.example'), 'utf-8');
      const line = text.split('\n').find((l) => l.startsWith('APP_PASSWORD_HASH='));

      expect(line, 'APP_PASSWORD_HASH is missing from .env.example').toBeDefined();

      // Passed through the schema AS WRITTEN: it is escaped for Next's
      // expander, and the transform is what reconciles that.
      const written = (line ?? '').slice('APP_PASSWORD_HASH='.length);

      const parsed = parseEnv({ ...validEnv(), APP_PASSWORD_HASH: written });
      expect(parsed.APP_PASSWORD_HASH).toHaveLength(60);
    });

    /**
     * The message reaches deploy logs, so it must say what is wrong without
     * echoing the value — a hash is a credential even when it is malformed.
     */
    it('explains the shape without echoing the value', () => {
      const secret = VALID.slice(0, 46);
      const source = { ...validEnv(), APP_PASSWORD_HASH: secret };

      expect(() => parseEnv(source)).toThrowError(/bcrypt/i);
      try {
        parseEnv(source);
        expect.unreachable('parseEnv should have thrown');
      } catch (error) {
        expect((error as Error).message).not.toContain(secret);
      }
    });
  });

  it('rejects unknown keys silently rather than failing', () => {
    // process.env always carries dozens of unrelated keys (PATH, HOME, ...),
    // so the schema must ignore extras instead of rejecting them.
    const source = { ...validEnv(), PATH: '/usr/bin', HOME: '/Users/someone' };

    expect(() => parseEnv(source)).not.toThrow();
  });
});
