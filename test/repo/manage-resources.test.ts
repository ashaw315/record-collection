import { describe, expect, it } from 'vitest';
import { RESOURCES, formFields, resourceByKey } from '@/app/manage/resources';

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

/*
  Design's drop of 12 Oct, manage's open form (5): "Notes, address and
  website join the open form, after the fields the second line shows, in
  that order." Fails against the declaration's own order, which the open
  form used: State / region, Address, Website, Notes for a store, and
  Discogs ID before Notes for an artist.
*/
describe('the order of an open form’s fields below 640', () => {
  const order = (key: string) => formFields(resourceByKey(key) ?? { key, label: '', singular: '', fields: [], sortFields: [] }).map((field) => field.name);

  it('is the name and the second line’s fields, then notes, address and website, then what is left', () => {
    expect(order('stores')).toEqual(['name', 'city', 'country', 'isFavorite', 'notes', 'address', 'website', 'stateRegion']);
    expect(order('artists')).toEqual(['name', 'formedYear', 'originCountry', 'notes', 'discogsArtistId']);
    expect(order('labels')).toEqual(['name', 'discogsLabelId', 'notes']);
  });

  it('drops no field and repeats none', () => {
    for (const resource of RESOURCES) expect(formFields(resource).map((field) => field.name).sort()).toEqual(resource.fields.map((field) => field.name).sort());
  });
});
