import { describe, expect, it } from 'vitest';
import { buildImportBody, saveDestination } from './save-destination';

/**
 * Where a save goes, as a pure decision (SPEC.md §5.7).
 *
 * §5.7: "Import is a two-stage flow… the client renders it into the add/edit
 * form; the user verifies and corrects; **only then is `/api/discogs/import`
 * called with the user's edited values in `overrides`**."
 *
 * The form was posting every create to `/api/records`, which skipped stage two
 * entirely — so §6's genre mapping, implemented and tested inside the import
 * transaction, was never reached by anything a user could do. Extracted rather
 * than inlined because four destinations chosen by three conditions is a rule,
 * and a rule buried in a submit handler can only be tested through a browser.
 */

const RELEASE_ID = 381756;

describe('saveDestination', () => {
  it('PATCHes the record when editing', () => {
    expect(saveDestination({ editing: true, recordId: 'abc' })).toEqual({
      method: 'PATCH',
      path: '/api/records/abc',
      shape: 'record',
    });
  });

  it('posts a manual create to /api/records', () => {
    // §10: "or blank for manual entry". No release id, no import.
    expect(saveDestination({ editing: false })).toEqual({
      method: 'POST',
      path: '/api/records',
      shape: 'record',
    });
  });

  it('posts a Discogs create to the IMPORT endpoint, per §5.7 stage two', () => {
    expect(saveDestination({ editing: false, discogsReleaseId: RELEASE_ID })).toEqual({
      method: 'POST',
      path: '/api/discogs/import',
      shape: 'import',
    });
  });

  it('keeps the acquire endpoint even when the record came from Discogs', () => {
    /**
     * The discriminating case, and the one most likely to be got wrong.
     *
     * §7.3: acquiring creates the record and marks the want-list row in ONE
     * transaction. Routing a want-list acquisition to the import endpoint would
     * create the record and leave the want-list item unacquired — the half-
     * application §7.3 forbids. Acquire outranks import.
     */
    expect(
      saveDestination({
        editing: false,
        discogsReleaseId: RELEASE_ID,
        acquiresWantListId: 'want-1',
      }),
    ).toEqual({
      method: 'POST',
      path: '/api/want-list/want-1/acquire',
      shape: 'record',
    });
  });

  it('does not import when editing a record that has a release id', () => {
    // An edit is a PATCH of an existing row. Re-importing would create a
    // second record for the same release — duplicates are legal (§4), which is
    // exactly why nothing may create one by accident.
    expect(
      saveDestination({ editing: true, recordId: 'abc', discogsReleaseId: RELEASE_ID }),
    ).toEqual({
      method: 'PATCH',
      path: '/api/records/abc',
      shape: 'record',
    });
  });

  it('reports the shape, so the caller knows which body to build', () => {
    // `record` and `import` take different payloads — `{...values}` versus
    // `{discogsReleaseId, target, overrides}`. Returning the shape keeps that
    // choice tied to the path rather than re-derived beside it.
    const shapes = [
      saveDestination({ editing: false }).shape,
      saveDestination({ editing: false, discogsReleaseId: RELEASE_ID }).shape,
    ];

    expect(shapes).toEqual(['record', 'import']);
  });
});

describe('buildImportBody', () => {
  /**
   * §5.7: the user's corrections travel as `overrides`, which "take precedence
   * over the Discogs values for every field they cover".
   *
   * The endpoint derives artist, label, pressing, genres and styles from the
   * release itself — so this sends only what the USER can have changed, and
   * every field the form offers must appear or it is silently discarded.
   */
  const RECORD_BODY = {
    title: 'Hear Nothing',
    artistId: 'a-1',
    labelId: 'l-1',
    formatId: 'f-1',
    storeId: 's-1',
    releaseYear: 1982,
    conditionMedia: 'VG+',
    conditionSleeve: 'VG',
    purchasePrice: '24.50',
    purchaseDate: '2026-01-02',
    notes: 'from the shop on the corner',
    genreIds: ['g-1'],
    tagIds: ['t-1'],
  };

  it('sends the release id and the record target', () => {
    const body = buildImportBody(RELEASE_ID, RECORD_BODY);

    expect(body.discogsReleaseId).toBe(RELEASE_ID);
    expect(body.target).toBe('record');
  });

  it('carries every field the form can set into overrides', () => {
    /**
     * The discriminating assertion. A field the form offers and this omits is
     * one the user edits, sees a 201 for, and loses — the tagIds defect from
     * step 6 in a new place.
     */
    const body = buildImportBody(RELEASE_ID, RECORD_BODY);

    expect(body.overrides).toEqual({
      title: 'Hear Nothing',
      labelId: 'l-1',
      formatId: 'f-1',
      storeId: 's-1',
      releaseYear: 1982,
      conditionMedia: 'VG+',
      conditionSleeve: 'VG',
      purchasePrice: '24.50',
      purchaseDate: '2026-01-02',
      notes: 'from the shop on the corner',
      genreIds: ['g-1'],
      tagIds: ['t-1'],
    });
  });

  it('does not send artistId, which the import resolves from the release', () => {
    // §5.7 find-or-creates the artist by Discogs id then by name. Sending the
    // form's selection would be a second, conflicting source for one field.
    const body = buildImportBody(RELEASE_ID, RECORD_BODY);

    expect(body.overrides).not.toHaveProperty('artistId');
  });

  it('omits absent fields rather than sending nulls', () => {
    // An absent key means "Discogs' value stands"; an explicit null means
    // "make it empty". A blank form field must not clear a Discogs value.
    const body = buildImportBody(RELEASE_ID, { title: 'Only a title' });

    expect(body.overrides).toEqual({ title: 'Only a title' });
  });

  it('carries the pressing fields the user corrected', () => {
    // These decide whether the import keeps the release id (§10) — sending
    // them is what lets the endpoint see a correction at all.
    const body = buildImportBody(RELEASE_ID, {
      catalogNumber: 'CLAY LP 3 (misprint)',
      countryPressed: 'UK',
      yearPressed: 1982,
      matrixRunout: 'A1/B1',
      pressingPlant: 'Damont',
    });

    expect(body.overrides).toEqual({
      catalogNumber: 'CLAY LP 3 (misprint)',
      countryPressed: 'UK',
      yearPressed: 1982,
      matrixRunout: 'A1/B1',
      pressingPlant: 'Damont',
    });
  });

  it('never sends pressingId, which would contradict the import’s own pressing', () => {
    // The form resolves a pressing via /api/pressings on the /api/records path.
    // The import creates its own; sending both would attach one and create the
    // other, leaving an orphan.
    const body = buildImportBody(RELEASE_ID, { ...RECORD_BODY, pressingId: 'p-1' });

    expect(body.overrides).not.toHaveProperty('pressingId');
  });
});
