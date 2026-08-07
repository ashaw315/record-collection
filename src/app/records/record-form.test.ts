import { describe, expect, it } from 'vitest';
import { buildCreateBody, buildPatchBody, type FormValues } from './record-form';

/**
 * Turning form strings into an API payload (SPEC.md §5.2).
 *
 * This is the highest-risk conversion in the app, and every Zod coercion trap
 * recorded in NOTES.md originated in exactly this shape: an HTML input only
 * ever yields a STRING, `''` for empty, and `''` has to mean different things
 * depending on the field and the verb.
 *
 * The three states the API distinguishes, which the form must be able to
 * produce:
 *
 *   absent  → leave the stored value alone   (PATCH only)
 *   null    → clear the stored value
 *   value   → set it
 *
 * A form that always submits every field can never express the first, and
 * PATCH's absent-vs-[] distinction becomes decorative — the API keeps a
 * capability no UI can reach.
 */

const EMPTY: FormValues = {
  title: '',
  artistId: '',
  labelId: '',
  formatId: '',
  storeId: '',
  releaseYear: '',
  conditionMedia: '',
  conditionSleeve: '',
  purchasePrice: '',
  purchaseDate: '',
  notes: '',
  genreIds: [],
  tagIds: [],
};

const ARTIST = '11111111-2222-4333-8444-555555555555';
const LABEL = '99999999-8888-4777-8666-555555555555';
const GENRE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('buildCreateBody', () => {
  it('sends only what was filled in', () => {
    const body = buildCreateBody({ ...EMPTY, title: 'Hear Nothing', artistId: ARTIST });

    // NOT `{ title, artistId, labelId: null, ... }`. POST creates a row whose
    // columns already default to null; sending explicit nulls for every blank
    // field is noise the endpoint has to validate.
    expect(body).toEqual({ title: 'Hear Nothing', artistId: ARTIST });
  });

  it('trims a title rather than storing surrounding space', () => {
    const body = buildCreateBody({ ...EMPTY, title: '  Hear Nothing  ', artistId: ARTIST });

    expect(body.title).toBe('Hear Nothing');
  });

  it('sends a year as a NUMBER, not the string the input produced', () => {
    // §5.2 types releaseYear as an integer. Sending "1982" fails validation,
    // and that is the failure mode a form is most likely to ship with.
    const body = buildCreateBody({ ...EMPTY, title: 'X', artistId: ARTIST, releaseYear: '1982' });

    expect(body.releaseYear).toBe(1982);
  });

  /**
   * The coercion trap from NOTES, in the direction a form produces it: an
   * untouched year input yields `''`, and `Number('')` is 0. A record created
   * with releaseYear 0 would pass the column and be wrong forever.
   */
  it('omits an empty year rather than coercing it to zero', () => {
    const body = buildCreateBody({ ...EMPTY, title: 'X', artistId: ARTIST, releaseYear: '' });

    expect(body).not.toHaveProperty('releaseYear');
  });

  it('omits a whitespace-only year', () => {
    expect(buildCreateBody({ ...EMPTY, title: 'X', artistId: ARTIST, releaseYear: '   ' })).not
      .toHaveProperty('releaseYear');
  });

  it('sends a price as the STRING the column expects', () => {
    /**
     * purchase_price is NUMERIC(10,2) carried as a string end to end so it
     * never routes through a float (§4.2). A form that helpfully parses it
     * reintroduces exactly the precision loss the column type prevents.
     */
    const body = buildCreateBody({ ...EMPTY, title: 'X', artistId: ARTIST, purchasePrice: '24.50' });

    expect(body.purchasePrice).toBe('24.50');
  });

  it('omits an empty price rather than sending zero or an empty string', () => {
    const body = buildCreateBody({ ...EMPTY, title: 'X', artistId: ARTIST, purchasePrice: '' });

    expect(body).not.toHaveProperty('purchasePrice');
  });

  it('omits empty nested arrays rather than sending []', () => {
    // On CREATE the two are equivalent, but sending [] here and relying on it
    // is how the PATCH distinction gets eroded by copy-paste.
    const body = buildCreateBody({ ...EMPTY, title: 'X', artistId: ARTIST });

    expect(body).not.toHaveProperty('genreIds');
    expect(body).not.toHaveProperty('tagIds');
  });

  it('sends nested arrays when something is selected', () => {
    const body = buildCreateBody({ ...EMPTY, title: 'X', artistId: ARTIST, genreIds: [GENRE] });

    expect(body.genreIds).toEqual([GENRE]);
  });
});

/**
 * PATCH is where the three-state logic matters. The form is given what the
 * record currently holds, and sends only what the user actually changed.
 */
describe('buildPatchBody', () => {
  const original: FormValues = {
    ...EMPTY,
    title: 'Hear Nothing',
    artistId: ARTIST,
    labelId: LABEL,
    releaseYear: '1982',
    conditionMedia: 'VG+',
    purchasePrice: '24.50',
    genreIds: [GENRE],
  };

  it('sends nothing when nothing changed', () => {
    // An unmodified save must not rewrite every column — that is how an
    // updated_at changes for no reason and an audit trail lies.
    expect(buildPatchBody(original, original)).toEqual({});
  });

  it('sends only the changed field', () => {
    const body = buildPatchBody(original, { ...original, title: 'Why' });

    expect(body).toEqual({ title: 'Why' });
  });

  /**
   * THE DISTINCTION. Clearing a field that had a value sends explicit `null`,
   * which the API reads as "clear it". Leaving it alone sends nothing at all.
   * A form that always submits `labelId` can only ever express one of these.
   */
  it('sends null when a field with a value is cleared', () => {
    const body = buildPatchBody(original, { ...original, labelId: '' });

    expect(body).toEqual({ labelId: null });
  });

  it('does not send a field that was empty and stayed empty', () => {
    // storeId was never set. Sending `storeId: null` would be a write that
    // changes nothing, and would make "nothing changed" untrue.
    const body = buildPatchBody(original, { ...original, title: 'Why' });

    expect(body).not.toHaveProperty('storeId');
  });

  it('clears a year to null rather than to zero', () => {
    const body = buildPatchBody(original, { ...original, releaseYear: '' });

    expect(body).toEqual({ releaseYear: null });
  });

  /**
   * The number conversion on the PATCH path, which the create tests do NOT
   * cover — found by mutation: removing the explicit conversion here failed
   * NOTHING, because every other year test only clears it to null. A patched
   * year would have gone as the STRING "1990" and been rejected by §5.2's
   * z.number(), so a user could create a record with a year and then never
   * change it.
   */
  it('sends a CHANGED year as a number, not the string the input produced', () => {
    const body = buildPatchBody(original, { ...original, releaseYear: '1990' });

    expect(body).toEqual({ releaseYear: 1990 });
  });

  it('sends a year added to a record that had none, as a number', () => {
    const noYear = { ...original, releaseYear: '' };

    expect(buildPatchBody(noYear, { ...noYear, releaseYear: '1977' })).toEqual({
      releaseYear: 1977,
    });
  });

  it('clears a price to null rather than to an empty string', () => {
    const body = buildPatchBody(original, { ...original, purchasePrice: '' });

    expect(body).toEqual({ purchasePrice: null });
  });

  it('clears a condition to null rather than to an empty enum value', () => {
    // '' is not in the enum, so sending it would be a 400 — a save that fails
    // because the user cleared a dropdown.
    const body = buildPatchBody(original, { ...original, conditionMedia: '' });

    expect(body).toEqual({ conditionMedia: null });
  });

  /**
   * The nested-array half of the same distinction, and the one NOTES records
   * as already having produced silent data loss once.
   */
  it('sends [] when every genre is removed', () => {
    const body = buildPatchBody(original, { ...original, genreIds: [] });

    expect(body).toEqual({ genreIds: [] });
  });

  it('does not send genreIds when the selection is unchanged', () => {
    const body = buildPatchBody(original, { ...original, title: 'Why' });

    expect(body).not.toHaveProperty('genreIds');
  });

  it('ignores the ORDER of a nested selection', () => {
    // Checkbox order is a UI artefact. Reordering is not an edit, and treating
    // it as one makes every save rewrite the junction rows.
    const second = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const before = { ...original, genreIds: [GENRE, second] };
    const after = { ...original, genreIds: [second, GENRE] };

    expect(buildPatchBody(before, after)).toEqual({});
  });

  it('sends several changes together', () => {
    const body = buildPatchBody(original, {
      ...original,
      title: 'Why',
      labelId: '',
      genreIds: [],
    });

    expect(body).toEqual({ title: 'Why', labelId: null, genreIds: [] });
  });

  it('treats a whitespace-only title as unchanged from its trimmed original', () => {
    const body = buildPatchBody(original, { ...original, title: '  Hear Nothing  ' });

    expect(body).toEqual({});
  });
});
