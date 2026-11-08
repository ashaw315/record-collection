import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **The upload route and the capture's seeding name one post-upload function (the coordinator, 8 Nov).** A capture
 * that seeds image rows shows the page only as far as the seed reaches: on 8 Nov the covers-group capture skipped
 * the route's colour and Design reviewed a state no real record can be in. So the route's work after its row exists
 * is `afterImageStored`, and the capture runs that same function through `scripts/after-image-stored.mts`. A step
 * the route gains later goes inside that function and reaches the captures with nobody remembering.
 *
 * A source check, and named as one: it holds the wiring, that the route does its post-row work through the shared
 * function and not beside it, and that the capture calls the script. What the function does is
 * `test/integration/after-image-stored.test.ts`.
 */
const read = (path: string) => readFileSync(path, 'utf8');

describe('the upload route and the capture name the same post-upload function (a source check)', () => {
  it('the route calls afterImageStored and nothing after its row directly', () => {
    const route = read('src/app/api/records/[id]/images/route.ts');
    expect(route).toMatch(/await afterImageStored\(/);
    expect(route).not.toMatch(/rederiveSpineColour/);
  });

  it('the script runs afterImageStored', () => {
    expect(read('scripts/after-image-stored.mts')).toMatch(/await afterImageStored\(/);
  });

  it('the covers-group capture runs the script after it seeds its covers', () => {
    expect(read('e2e/capture/covers-group-165.capture.ts')).toMatch(/scripts\/after-image-stored\.mts/);
  });
});
