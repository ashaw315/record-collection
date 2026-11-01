import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { login } from './sign-in';

/**
 * **The harness says which build it is, where a screenshot catches it.** Two days
 * of diagnosis on 31 Oct and 1 Nov rested on screenshots of a pre-fix worktree
 * read as the fix, because nothing on the page could say otherwise. The expected
 * value comes from git in the directory the server runs in, so a stale or
 * hardcoded stamp fails.
 */
test('the harness prints the commit it was served from', async ({ page }) => {
  await login(page);
  await page.goto('/wall/probe/labelled?count=22');
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  await expect(page.getByTestId('build-stamp')).toContainText(head);
  await expect(page.getByTestId('build-stamp')).toBeInViewport();
});
