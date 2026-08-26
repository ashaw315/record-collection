import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeRelease } from './normalize-release';

/**
 * SPEC.md §5.7's normalized release detail — the payload that prefills the
 * add/edit form.
 *
 * Two fixtures, chosen for what they disagree about:
 *   release-detailed  — 8 Matrix / Runout identifiers, a "Pressed By" company,
 *                       a gatefold text descriptor, 7 images
 *   release-no-matrix — NO identifiers at all, three colour variants
 *
 * §5.7 calls missing matrix data "frequently missing or partial", and the
 * second fixture is what makes that testable rather than assumed.
 */

const detailed = JSON.parse(
  readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8'),
) as unknown;

const noMatrix = JSON.parse(
  readFileSync('test/fixtures/discogs/release-no-matrix.json', 'utf8'),
) as unknown;

describe('matrix / runout', () => {
  /**
   * CLAUDE.md §8 calls the matrix user-authoritative: it is the dead-wax
   * fingerprint, the thing that identifies a pressing when catalog numbers
   * agree. §5.7 types it as an ARRAY, and the real payload shows why — this
   * release carries EIGHT, being two sides across four documented variants.
   * Collapsing them to one would discard the variant the user is holding.
   */
  it('collects every Matrix / Runout identifier, not just the first', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.matrixRunout.length).toBe(8);
    expect(normalized.matrixRunout[0]).toContain('CLAY-LP-3-A2');
  });

  it('is empty rather than absent when Discogs has no runout data', () => {
    // The common real case per §5.7. An empty array lets the form show an
    // empty field the user fills from the dead wax; `undefined` would need a
    // guard at every use site.
    expect(normalizeRelease(noMatrix).matrixRunout).toEqual([]);
  });

  it('keeps non-matrix identifiers separately rather than discarding them', () => {
    // §5.7: `otherIdentifiers` with type, value and description. Barcodes and
    // rights-society codes identify a pressing too, and throwing them away
    // loses information the user cannot recover.
    const normalized = normalizeRelease({
      id: 1,
      identifiers: [
        { type: 'Matrix / Runout', value: 'A1' },
        { type: 'Barcode', value: '5013929100121', description: 'Text' },
      ],
    });

    expect(normalized.matrixRunout).toEqual(['A1']);
    expect(normalized.otherIdentifiers).toEqual([
      { type: 'Barcode', value: '5013929100121', description: 'Text' },
    ]);
  });

  it('matches the identifier type case-insensitively', () => {
    // Discogs' type strings are contributor-entered. "Matrix / Runout" is the
    // canonical form, and a case difference must not silently drop the field
    // this app cares most about.
    const normalized = normalizeRelease({
      id: 1,
      identifiers: [{ type: 'matrix / runout', value: 'A1' }],
    });

    expect(normalized.matrixRunout).toEqual(['A1']);
  });
});

describe('runout strings survive VERBATIM (SPEC §12 step 14c)', () => {
  /**
   * **The rule verification-by-display lives or dies by**, pinned as a test
   * rather than left as an intention.
   *
   * Step 14c shows a candidate's runout so the USER'S EYE can compare it
   * against the record in their hands. That makes every character load-bearing:
   * anything this normalizer trims, collapses or strips is discrimination
   * thrown away, and thrown away SILENTLY, because a tidied runout still looks
   * like a runout.
   *
   * **This inverts the usual job of this module.** Every other Discogs string
   * here goes through `meaningful()` and gets trimmed. A runout must not.
   * `bounded()` at §4.2's generous cap stays, as a denial-of-service guard
   * against a hostile 50,000-character value.
   *
   * These are real values, measured live 2026-08-25 from the Rumours and
   * Misfits collision groups. A comment would not fail when someone adds a
   * `.trim()` in good faith; this does.
   *
   * **Every one of these passed on first run**, because the behaviour already
   * existed — which CLAUDE.md §2 says to treat as a defect in the test until
   * shown otherwise. Verified by MUTATION instead: adding
   * `.trim().replace(/\s+/g, ' ')` to the value mapping fails the first three
   * deterministically. The block is a regression guard on behaviour that is
   * currently correct BY ACCIDENT — nothing but this file stops it changing.
   */

  const runout = (value: string) => ({
    id: 1,
    title: 'T',
    identifiers: [{ type: 'Matrix / Runout', value }],
  });

  it('keeps interior double spaces', () => {
    // Real: "JW10 FS7• #2  MASTERED BY CAPITOL  ✲  KP" — the doubled spaces
    // are how the contributor recorded the stamping.
    const value = 'BSK-1-3010 JW10 FS7\u2022 #2  MASTERED BY CAPITOL  \u2733  KP';
    expect(normalizeRelease(runout(value)).matrixRunout[0]).toBe(value);
  });

  it('keeps leading and trailing whitespace', () => {
    /**
     * The likeliest regression: a `.trim()` added for tidiness. Leading space
     * can be how a transcription marks an indented or offset stamp.
     */
    const value = '  BSK-1-3010 F24  ';
    expect(normalizeRelease(runout(value)).matrixRunout[0]).toBe(value);
  });

  it('keeps unicode glyphs — triangle, bullet, six-pointed star', () => {
    // Real: "LW1 F6 4  △21970 4", "FS7•", "✲". These are stamped symbols and
    // are frequently the ONLY difference between two pressings.
    const value = 'BSK-1-3010 LW1 F6 4  \u25B321970 4 \u2733 \u2022';
    const [got] = normalizeRelease(runout(value)).matrixRunout;

    expect(got).toBe(value);
    expect(got).toContain('\u25B3');
    expect(got).toContain('\u2733');
  });

  it('keeps parenthetical transcription notes and strikethrough wording', () => {
    // Real: the "(scratched out)" marks a struck-through stamp, which is
    // itself the identifying feature.
    const value = 'BSK-1-3010 LW2 F12 (scratched out)-W-1 KP SUB #1 MASTERED BY CAPITOL';
    expect(normalizeRelease(runout(value)).matrixRunout[0]).toBe(value);
  });

  it('does not put the value through `meaningful()`', () => {
    /**
     * `meaningful()` maps "none" and "unknown" to null. A runout genuinely
     * reading "NONE" is a real stamping, and dropping it would remove a row's
     * only distinguishing mark while looking like Discogs had nothing.
     */
    expect(normalizeRelease(runout('NONE')).matrixRunout).toEqual(['NONE']);
  });

  it('still bounds a hostile value, because that guard is not about tidiness', () => {
    const [got] = normalizeRelease(runout('x'.repeat(50_000))).matrixRunout;

    expect(got?.length).toBe(1_000);
  });

  it('keeps two runouts that differ ONLY in whitespace as two distinct values', () => {
    /**
     * The defect this whole block exists to prevent, stated end to end: two
     * real Misfits pressings whose runouts differ by a single space. Collapse
     * whitespace and they become the same string — the app would then show two
     * candidates as identical when the object in hand can tell them apart.
     */
    const a = 'JRR-804-B SST 33 UPM';
    const b = 'JRR 804 B SST 33 UPM';

    const got = normalizeRelease({
      id: 1,
      title: 'T',
      identifiers: [
        { type: 'Matrix / Runout', value: a },
        { type: 'Matrix / Runout', value: b },
      ],
    }).matrixRunout;

    expect(got).toEqual([a, b]);
    expect(got[0]).not.toBe(got[1]);
  });
});

describe('pressing plant', () => {
  it('reads the company whose role is pressing, not the first company', () => {
    /**
     * The discriminating fixture, and it is real: this release lists four
     * companies — Clay Records and Intersong ("Published By"), Damont
     * ("Pressed By") and Tape One ("Lacquer Cut At").
     *
     * Taking `companies[0]` yields Clay Records, which is the LABEL. Taking
     * anything matching "cut" yields the mastering studio. Only Damont pressed
     * the record, and §4.2's `pressing_plant` means exactly that.
     */
    expect(normalizeRelease(detailed).pressingPlant).toBe('Damont');
  });

  it('is null when no company pressed it', () => {
    const normalized = normalizeRelease({
      id: 1,
      companies: [{ name: 'Clay Records', entity_type_name: 'Published By' }],
    });

    expect(normalized.pressingPlant).toBeNull();
  });

  it('does not mistake "Lacquer Cut At" for a pressing plant', () => {
    // Both are manufacturing roles and both name a company, but only one pressed
    // the vinyl. A substring match on "Cut" or a role allowlist that included
    // mastering would put the wrong name in the field.
    const normalized = normalizeRelease({
      id: 1,
      companies: [{ name: 'Tape One', entity_type_name: 'Lacquer Cut At' }],
    });

    expect(normalized.pressingPlant).toBeNull();
  });
});

/**
 * SPEC.md §12 step 14c — verification-by-display needs two facts the existing
 * fields deliberately discard, and BOTH omissions are correct for their own
 * purpose. These are additions, not corrections:
 *
 *   - `pressingPlant` is one name for §4.2's `pressing_plant` COLUMN, so it
 *     narrows four companies to the one that pressed the record;
 *   - `matrixRunout` is the deadwax strings for the form field, so it drops the
 *     per-side descriptions.
 *
 * The evidence panel compares releases rather than filling a column, and the
 * committed collision pair is the proof it needs more: it separates on
 * `Lacquer Cut At: Tape One` and on identifier descriptions — the exact two
 * things the fields above throw away.
 */
describe('manufacturing companies, for the evidence panel', () => {
  it('carries EVERY manufacturing role, not just the pressing plant', () => {
    // The same fixture the `pressingPlant` test uses, read for what that field
    // discards: taking one company answers §4.2's column and cannot separate
    // two pressings that share a plant.
    const roles = normalizeRelease(detailed).manufacturingCompanies.map((c) => c.role);

    expect(roles).toContain('Pressed By');
    expect(roles).toContain('Lacquer Cut At');
  });

  it('keeps the role attached to the name', () => {
    const [company] = normalizeRelease({
      id: 1,
      companies: [{ name: 'Lyntone Recordings Ltd.', entity_type_name: 'Pressed By' }],
    }).manufacturingCompanies;

    expect(company).toEqual({ role: 'Pressed By', name: 'Lyntone Recordings Ltd.' });
  });

  /**
   * A company with no manufacturing role is not evidence about the OBJECT.
   * "Published By" is a rights fact and appears on both members of the
   * collision pair, so including it would add noise to a comparison without
   * adding discrimination.
   */
  it('excludes non-manufacturing roles', () => {
    const roles = normalizeRelease({
      id: 1,
      companies: [
        { name: 'Clay Music', entity_type_name: 'Published By' },
        { name: 'Pinnacle (3)', entity_type_name: 'Distributed By' },
        { name: 'Damont', entity_type_name: 'Mastered At' },
      ],
    }).manufacturingCompanies.map((c) => c.role);

    expect(roles).toEqual(['Mastered At']);
  });

  it('is empty rather than absent when a release lists no companies', () => {
    expect(normalizeRelease({ id: 1 }).manufacturingCompanies).toEqual([]);
  });
});

describe('runout descriptions, for the evidence panel', () => {
  /**
   * **Measured on the committed collision pair**: releases 4878030 and
   * 10405725 carry BYTE-IDENTICAL runout values, and 4878030 alone labels them
   * "Runout side A" / "Runout side B". Without the description the panel shows
   * two identical lists for two different records.
   */
  it('carries the per-side description alongside the value', () => {
    const [first] = normalizeRelease({
      id: 1,
      identifiers: [
        { type: 'Matrix / Runout', value: 'CLAY-LP-3-A2', description: 'Runout side A' },
      ],
    }).matrixRunoutDetail;

    expect(first).toEqual({ value: 'CLAY-LP-3-A2', description: 'Runout side A' });
  });

  it('is null-described rather than dropped when Discogs has no description', () => {
    const [first] = normalizeRelease({
      id: 1,
      identifiers: [{ type: 'Matrix / Runout', value: 'CLAY-LP-3-A2' }],
    }).matrixRunoutDetail;

    expect(first).toEqual({ value: 'CLAY-LP-3-A2', description: null });
  });

  /**
   * The verbatim rule (§12 step 14c) applies to the new field too. A guard on
   * `matrixRunout` alone would leave the field the PANEL actually reads
   * unprotected — which is the whole hazard the prompt names at the render
   * layer, arriving one field earlier.
   */
  it('preserves the value verbatim, exactly as matrixRunout does', () => {
    const value = '  BSK-1-3010  LW2 (scratched out) △21970  ';

    const [detail] = normalizeRelease({
      id: 1,
      identifiers: [{ type: 'Matrix / Runout', value }],
    }).matrixRunoutDetail;

    expect(detail.value).toBe(value);
  });

  it('agrees with matrixRunout on which identifiers are runouts', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.matrixRunoutDetail.map((d) => d.value)).toEqual(normalized.matrixRunout);
  });
});

describe('format descriptors', () => {
  it('parses the colour variant from the format text', () => {
    // §5.7: "colorVariant — parsed from format descriptors". The no-matrix
    // fixture is a coloured-vinyl release: three entries with text
    // "Blue/Green", "Blue/Purple", "Yellow/Orange".
    expect(normalizeRelease(noMatrix).colorVariant).toBe('Blue/Green');
  });

  it('does not treat a non-colour text descriptor as a colour', () => {
    /**
     * This release's format text is "Gatefold" — a sleeve property, not a
     * vinyl colour. Writing it into `color_variant` would put "Gatefold" in a
     * colour field on every gatefold record, which is wrong in the confident
     * direction: it looks entered.
     */
    expect(normalizeRelease(detailed).colorVariant).toBeNull();
  });

  it('reads an explicit gram descriptor', () => {
    // §5.7: "vinylWeightGrams — parsed from format descriptors when present".
    // A descriptor is a CLAIM ABOUT THE PRESSING, made by a contributor
    // looking at the record.
    const normalized = normalizeRelease({
      id: 1,
      formats: [{ name: 'Vinyl', descriptions: ['LP', '180 Gram'] }],
    });

    expect(normalized.vinylWeightGrams).toBe(180);
  });

  it('does NOT fall back to estimated_weight, which is a shipping guess', () => {
    /**
     * FOUND IN REAL USE, and the reason this test exists.
     *
     * `estimated_weight` is Discogs' guess at the weight of the PACKAGE — 230
     * on this release. Vinyl weights are 140, 180 or 200g, so 230 is not a
     * plausible value for the column at all, and the form was prefilling it
     * into a field labelled "Weight (g)" where nobody would question it.
     *
     * Unit 6 correctly noted the estimate is a shipping guess and then used it
     * as a fallback anyway — the knowledge was in the comment and not in the
     * code. §5.7 says "parsed from format descriptors when present", and when
     * it is not present the honest answer is nothing.
     *
     * An empty field asks the user to weigh the record. A fabricated one tells
     * them it has already been done.
     */
    expect(normalizeRelease(detailed).vinylWeightGrams).toBeNull();
  });

  it('prefers a descriptor over the estimate when both exist', () => {
    const normalized = normalizeRelease({
      id: 1,
      estimated_weight: 230,
      formats: [{ name: 'Vinyl', descriptions: ['LP', '180 Gram'] }],
    });

    expect(normalized.vinylWeightGrams).toBe(180);
  });

  it.each([
    ['140 Gram', 140],
    ['180 Gram', 180],
    ['200 Gram', 200],
  ])('reads %s as a real vinyl weight', (descriptor, expected) => {
    // The three weights actually pressed. A rule that accepted any number
    // would let "12 Inch" or "45 RPM" through as a weight.
    const normalized = normalizeRelease({
      id: 1,
      formats: [{ name: 'Vinyl', descriptions: ['LP', descriptor] }],
    });

    expect(normalized.vinylWeightGrams).toBe(expected);
  });

  it('does not read a speed or a size as a weight', () => {
    // "45 RPM" and "12 Inch" sit in the same descriptor list. A digits-anywhere
    // rule turns both into a weight.
    const normalized = normalizeRelease({
      id: 1,
      formats: [{ name: 'Vinyl', descriptions: ['12\"', '45 RPM'] }],
    });

    expect(normalized.vinylWeightGrams).toBeNull();
  });

  it('keeps the descriptors themselves', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.formats).toContain('Vinyl');
    expect(normalized.formats).toContain('LP');
    expect(normalized.formats).toContain('Album');
  });
});

describe('the rest of the §5.7 detail shape', () => {
  it('carries images with their type', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.images.length).toBe(7);
    expect(normalized.images[0].type).toBe('primary');
    expect(normalized.images[0].url).toMatch(/^https:\/\//);
  });

  it('carries the tracklist with positions', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.tracklist[0].position).toBe('A1');
    expect(normalized.tracklist[0].title).toBe('Hear Nothing See Nothing Say Nothing');
  });

  it('reports an empty duration as absent rather than as an empty string', () => {
    // `duration: ""` is Discogs' absence again, in the tracklist.
    expect(normalizeRelease(detailed).tracklist[0].duration).toBeNull();
  });

  it('keeps genres and styles separate, as the search normalizer does', () => {
    // CLAUDE.md §8, at the endpoint that prefills the form — this is where a
    // flattened genre would be written into the database.
    const normalized = normalizeRelease(detailed);

    expect(normalized.genres).toEqual(['Rock']);
    expect(normalized.styles).toContain('Hardcore');
    expect(normalized.styles).toContain('Punk');
  });

  it('carries the marketplace figures as information only', () => {
    /**
     * §5.7 lists these; CLAUDE.md §8 forbids anything that sells. They are
     * displayed, never linked.
     *
     * **Asserted as PROPERTIES, not as readings.** These are live market
     * figures: re-capturing the fixture moved `lowest_price` from 43.96 to
     * 55.59 and the hardcoded assertion failed for a change in the market
     * rather than a change in the code. `num_for_sale` passed only by
     * coincidence and would have broken the same way next capture.
     *
     * The behaviour under test is that the normalizer CARRIES these fields
     * through — which is what a mutation dropping them would break, and which
     * no specific number is needed to state.
     */
    const normalized = normalizeRelease(detailed);

    // Narrowed at the point of use: the fixture is deliberately `unknown` so
    // nothing in this file can assume a shape the payload does not have.
    const raw = detailed as { num_for_sale: number; lowest_price: number };

    expect(normalized.numForSale).toBe(raw.num_for_sale);
    expect(normalized.lowestPrice).toBe(raw.lowest_price);
    expect(typeof normalized.numForSale, 'present, whatever the market says').toBe('number');
    expect(typeof normalized.lowestPrice).toBe('number');
  });

  it('carries the identifying fields for the form', () => {
    const normalized = normalizeRelease(detailed);

    expect(normalized.discogsId).toBe(381756);
    expect(normalized.masterId).toBe(50683);
    expect(normalized.title).toBe('Hear Nothing See Nothing Say Nothing');
    expect(normalized.artist).toBe('Discharge');
    expect(normalized.label).toBe('Clay Records');
    expect(normalized.catalogNumber).toBe('CLAY LP 3');
    expect(normalized.country).toBe('UK');
    expect(normalized.year).toBe(1982);
  });

  it('reports NO year when Discogs has none, rather than inventing one', () => {
    /**
     * FOUND IN REAL USE. The US 1971 Carpenters LP (release 12856557) carries
     * `year: 0` and NO `released` field at all — Discogs simply does not record
     * a year on that release. The 1971 the user sees comes from the MASTER.
     *
     * `toYear` rejecting 0 is correct: a year of zero is not a date, and
     * writing it into `release_year` would put a record from 1971 in the year
     * nought. The gap is that the release alone cannot answer the question —
     * which is what the prefill's master fallback exists for.
     *
     * I could not construct this shape when I first looked for it: I paired
     * `year: 0` with a valid `released` every time, and every variation
     * recovered the year correctly. Reproduced only by reading the actual
     * cached payload.
     */
    const normalized = normalizeRelease({ id: 12856557, year: 0, title: 'Carpenters' });

    expect(normalized.year).toBeNull();
  });

  it('reads the artist from artists[0], not from a combined title', () => {
    // Release detail sends `title` as the TITLE ALONE and the artist
    // separately — the opposite of search results, where they are combined.
    // Splitting on " - " here would truncate a title containing a hyphen.
    const normalized = normalizeRelease({
      id: 1,
      title: 'Why - The Singles',
      artists: [{ name: 'Discharge' }],
    });

    expect(normalized.artist).toBe('Discharge');
    expect(normalized.title).toBe('Why - The Singles');
  });

  it('keeps the notes, which carry pressing detail nothing else does', () => {
    // This release's notes say "Pay no more than £3.99" and "Gatefold sleeve
    // with lyrics" — sleeve facts a collector uses to identify a pressing.
    expect(normalizeRelease(detailed).notes).toMatch(/Gatefold sleeve/);
  });
});
