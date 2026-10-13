import { expect, test } from '@playwright/test';
import { login } from './sign-in';

/**
 * **Cleanup against a request still in flight** (the coordinator, 13 Oct,
 * the third sighting of cleanup racing in-flight work). In the gate on
 * `88a0e7e` a suggestions test ran past its 30s, the timeout tore it down,
 * its cleanup deleted the artist it had made, and the body's still-pending
 * `POST /api/records` was then answered `400 No artist with that id
 * exists`: an artifact that read as the product refusing a good request,
 * and cost a diagnosis.
 *
 * The proposed fix was for the cleanup hook to dispose the context's
 * request client before its deletes, so that such a request would be
 * interrupted there and the artifact would say so. **Staged, it is not
 * so:** on Playwright 1.62 `dispose()` discards stored responses and
 * leaves a request in flight to complete; this request, sent to a probe
 * that answers after six seconds, was answered 200 after the client was
 * disposed. So the hook cannot put its deletes after a pending request's
 * answer by that route, and the shape stays one to recognise. This test
 * holds the fact the decision rests on, so a later Playwright that does
 * interrupt is noticed and the fix becomes available.
 *
 * The race itself, a body cut off by its timeout while the hook runs,
 * cannot be staged under this runner: a timed-out test reports
 * `timedOut`, which `test.fail` does not accept as the failure it expects.
 */
test('disposing the request client does not interrupt a request in flight (Playwright 1.62), so the cleanup hook cannot abort one that way', async ({ page }) => {
  await login(page);
  await page.context().addCookies([{ name: 'error-probe', value: 'sleep', url: new URL(page.url()).origin }]);
  /* The probe answers after six seconds while the cookie says `sleep`: the request is in flight when the client is disposed. */
  const pending = page.request.get('/error-probe').then(
    (response) => `answered ${response.status()}`,
    (error: Error) => `interrupted: ${error.message}`,
  );
  await page.request.dispose();
  expect(await pending, 'what the request became after the client was disposed').toBe('answered 200');
});
