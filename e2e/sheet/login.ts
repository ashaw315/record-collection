import { expect, type Page } from '@playwright/test';
import { assertServerCannotWrite } from './write-probe';

/*
  Two ways in, neither of which is the test hash. `E2E_PASSWORD` is the
  collection's password, read at run time and nowhere else. `SHEET_SESSION_FILE`
  names a file holding a session token minted locally from the signing secret
  the server itself reads (`createSessionToken`), for an operator who has the
  server's environment and not the password; the token is read from the file
  and never printed. With neither, the sheet refuses to start.
*/
const password = process.env.E2E_PASSWORD;
const sessionFile = process.env.SHEET_SESSION_FILE;
if ((password === undefined || password === '') && (sessionFile === undefined || sessionFile === '')) {
  throw new Error('Neither E2E_PASSWORD nor SHEET_SESSION_FILE is set. The contact sheet logs in to the collection and never falls back to the test hash: run as  E2E_PASSWORD=\'…\' npx playwright test --config playwright.sheet.config.ts');
}
const PASSWORD: string = password ?? '';

async function signIn(page: Page) {
  if (sessionFile !== undefined && sessionFile !== '') {
    const { readFileSync } = await import('node:fs');
    const token = readFileSync(sessionFile, 'utf8').trim();
    const origin = new URL(process.env.SHEET_BASE_URL ?? `http://localhost:${process.env.SHEET_PORT ?? '3200'}`);
    await page.context().addCookies([{ name: 'rc_session', value: token, domain: origin.hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await page.goto('/');
    await expect(page, 'the minted session signs in').toHaveURL('/', { timeout: 15_000 });
    return;
  }
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page, 'the password in E2E_PASSWORD signs in').toHaveURL('/', { timeout: 15_000 });
}

/**
 * Signs in, then asks the server it signed in to whether it can write, and
 * throws if it can or if that cannot be told. Every sheet comes through
 * here, so a server the config did not start is asked the same as one it
 * did (`test/repo/sheets-read-only.test.ts`).
 */
export async function login(page: Page) {
  await signIn(page);
  await assertServerCannotWrite(page.request);
}
