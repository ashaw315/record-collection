import { describe, expect, it } from 'vitest';
import { RESOURCES } from '@/app/manage/resources';

/**
 * SPEC.md §10's `/manage` row: "CRUD for genres (incl. hierarchy editor),
 * labels, formats, tags, artists, influences. **Not pressings**."
 *
 * The Pressings tab was scope creep from building `/api/pressings` early, and
 * it was unusable in isolation — nobody enters a catalog number with no record
 * in mind. Pressing fields are entered on the record form instead (§10).
 *
 * Asserted rather than assumed: the tab is exactly the kind of thing that comes
 * back when someone adds a resource by copying the one next to it.
 */
describe('the /manage resource list matches SPEC.md §10', () => {
  const keys = RESOURCES.map((resource) => resource.key);

  it('does not offer pressings', () => {
    expect(keys).not.toContain('pressings');
  });

  it('offers exactly the resources §10 names', () => {
    // Exact, not a subset: a resource appearing here that §10 does not list is
    // the same defect as pressings was.
    expect([...keys].sort()).toEqual(
      ['artists', 'formats', 'genres', 'labels', 'stores', 'tags'].sort(),
    );
  });
});
