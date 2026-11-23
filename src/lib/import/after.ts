import 'server-only';
import { after } from 'next/server';

/**
 * **Work after the response, inside the same function's duration (import fires drafting, 22 Nov).** Next's `after()`
 * keeps the function alive past the response up to its `maxDuration`, 300 seconds on this plan under Fluid compute; it
 * needs a request scope, which a handler called directly in a test does not have, so the route reaches it through this
 * one seam and the tests fake the seam to run the work inline and hand its promise back. Nothing else here.
 */
export function runAfter(work: () => Promise<void>): void {
  after(work);
}
