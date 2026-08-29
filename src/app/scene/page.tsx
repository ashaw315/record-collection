import { notFound } from 'next/navigation';
import { SceneHarness } from './SceneHarness';

/**
 * **Development-only.** `routeAuthMode` exempts `/scene` from §3's password gate
 * outside production; this is the second half of that rule, so the page does not
 * exist at all on a production build even if the middleware were changed.
 *
 * Two independent guards because a harness that renders app components without
 * a login is a hole in the auth boundary if it ever ships, and one guard is one
 * edit away from being removed.
 */
export const dynamic = 'force-dynamic';

export default function ScenePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <SceneHarness />;
}
