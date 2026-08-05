import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyPassword, verifyCronSecret } from './password';

// Generated with bcrypt cost 10 for "correct-horse-battery-staple".
const CORRECT = 'correct-horse-battery-staple';
const HASH = bcrypt.hashSync(CORRECT, 10);

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    await expect(verifyPassword(CORRECT, HASH)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    await expect(verifyPassword('wrong-password', HASH)).resolves.toBe(false);
  });

  it('rejects an empty password', async () => {
    await expect(verifyPassword('', HASH)).resolves.toBe(false);
  });

  it('rejects a password that differs only in case', async () => {
    await expect(verifyPassword(CORRECT.toUpperCase(), HASH)).resolves.toBe(false);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    // A misconfigured APP_PASSWORD_HASH must fail closed, never crash the route
    // into a 500 that leaks which env var is wrong.
    await expect(verifyPassword(CORRECT, 'not-a-bcrypt-hash')).resolves.toBe(false);
  });

  it('returns false on an empty hash', async () => {
    await expect(verifyPassword(CORRECT, '')).resolves.toBe(false);
  });
});

describe('verifyCronSecret', () => {
  const SECRET = 'a-cron-secret-that-is-at-least-32-characters';

  it('accepts a correct bearer token', () => {
    expect(verifyCronSecret(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it('rejects an incorrect bearer token', () => {
    expect(verifyCronSecret('Bearer wrong-secret', SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyCronSecret(null, SECRET)).toBe(false);
  });

  it('rejects the raw secret without the Bearer scheme', () => {
    expect(verifyCronSecret(SECRET, SECRET)).toBe(false);
  });

  it('rejects a token that is a prefix of the secret', () => {
    expect(verifyCronSecret(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
  });

  it('rejects a token with trailing content', () => {
    expect(verifyCronSecret(`Bearer ${SECRET}extra`, SECRET)).toBe(false);
  });
});
