import { formatMarketPrice } from './normalize-market';

/**
 * SPEC.md §10a layer 3 — "does pressing matter here?"
 *
 * Computed from the spread of `lowest_price` across a master's versions, which
 * no single release can supply: "versions spanning £8 to £400 mean the pressing
 * matters more than the price; everything between £10 and £25 means it barely
 * does."
 *
 * **Pure, because the partial case is a judgement rather than a fetch.** One
 * call per version against a 60/minute budget means a spread can run out
 * half-finished, and what may honestly be said from an incomplete sample is the
 * decision this module encodes.
 */

export type VersionPrice = { discogsId: number; lowestPrice: number | null };

/**
 * The media a spread may compare across — one family per physical medium.
 *
 * **Vinyl sizes are deliberately ONE family.** A 7", 10" and 12" of the same
 * album are all vinyl and all real pressing choices; the size lives in the
 * descriptors, not here.
 *
 * Matched against Discogs' `major_formats`, which is a controlled vocabulary
 * ("Vinyl", "CD", "Cassette", "8-Track Cartridge", "Reel-To-Reel", "File") —
 * unlike `format`, which is free-ish prose. Anything not listed is treated as
 * an unknown medium rather than forced into a family.
 */
const FORMAT_FAMILIES = [
  'vinyl',
  'cd',
  'cassette',
  '8-track cartridge',
  'reel-to-reel',
  'file',
  'dvd',
  'blu-ray',
  'shellac',
  'minidisc',
] as const;

function mediumOf(formats: readonly string[]): string | null {
  for (const format of formats) {
    const found = FORMAT_FAMILIES.find((family) => family === format.trim().toLowerCase());
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Whether a version is the same KIND of object as the release being viewed.
 *
 * §10a layer 3 asks "does pressing matter here?" — a question about pressings
 * of one medium. QA found the Carpenters master (SP-3502) pricing 8-track
 * cartridges and cassettes beside LPs, so the spread was measuring the format
 * and reporting it as pressing variance. Comparing a quadraphonic 8-track to a
 * US LP is not a pressing comparison.
 *
 * **An unknown medium is KEPT, not dropped.** `major_formats` is sometimes
 * absent on user-submitted data, and absence of a medium is not evidence of a
 * different one — dropping those would shrink the sample worst on exactly the
 * releases with the poorest data.
 */
export function sameFormatFamily(
  versionFormats: readonly string[],
  viewedFormats: readonly string[],
): boolean {
  const viewed = mediumOf(viewedFormats);
  const version = mediumOf(versionFormats);

  if (viewed === null || version === null) return true;

  return viewed === version;
}

export type SpreadVerdict = 'pressing-matters' | 'pressing-barely-matters';

export type SpreadSummary = {
  range: { low: number; high: number } | null;
  /** `null` whenever the sample cannot support a conclusion — see below. */
  verdict: SpreadVerdict | null;
  partial: boolean;
  text: string;
};

/**
 * Wide enough that the pressing is the thing to get right.
 *
 * A RATIO, not a difference. $10–$25 and $400–$415 are both a $15 spread and
 * completely different facts: the first is 2.5× and worth knowing, the second is
 * 4% on an expensive record and is noise. An absolute threshold would label
 * every expensive master "pressing matters" — the reverse of useful, since those
 * are exactly the ones a collector already knows about.
 */
const WIDE_RATIO = 3;

export function spreadVerdict(range: { low: number; high: number } | null): SpreadVerdict | null {
  // One price is not a spread, and calling it "barely matters" would claim a
  // comparison nobody made.
  if (range === null || range.low <= 0 || range.high === range.low) return null;

  return range.high / range.low >= WIDE_RATIO ? 'pressing-matters' : 'pressing-barely-matters';
}

export function summariseSpread(input: {
  checked: VersionPrice[];
  /** How many versions the master has, so a partial sample can say so. */
  total: number;
  currency: string;
}): SpreadSummary {
  // A version nobody is selling has NO price — not a price of zero, which would
  // drag every low end to nothing and make each master look like it spans
  // everything.
  const prices = input.checked
    .map((version) => version.lowestPrice)
    .filter((price): price is number => price !== null);

  // `>=` rather than `===`: a master gaining a version between the count and the
  // fetch must not render "12 of 11".
  const partial = input.checked.length < input.total;

  if (input.checked.length === 0) {
    return {
      range: null,
      verdict: null,
      partial,
      text: 'Could not check the other pressings just now.',
    };
  }

  if (prices.length === 0) {
    return {
      range: null,
      verdict: null,
      partial,
      text: 'None of the pressings checked are for sale right now.',
    };
  }

  const range = { low: Math.min(...prices), high: Math.max(...prices) };

  /**
   * **Partial evidence is decisive in ONE direction, and the rule follows the
   * direction rather than the sample size** (§10a as amended).
   *
   * A price range only ever GROWS as more versions are checked. So:
   *
   *   - already wide → "pressing matters" is safe on partial evidence. The
   *     unchecked versions cannot bring the ratio back down.
   *   - currently narrow → "barely matters" is a guess. Any unchecked version
   *     could be the £400 one, which reverses it completely.
   *
   * The earlier rule withheld BOTH on anything partial. That looked like the
   * cautious choice and was worse: `MAX_VERSIONS_PRICED` caps every fetch at
   * fifteen, so every master with more versions than that was permanently
   * partial and layer 3 said nothing at all about it — and those are the
   * popular records, where pressing choice matters most. QA caught it at 15 of
   * 100 versions spanning $5.69–$20.69: a 3.64× spread, conclusive, reported as
   * silence.
   */
  const candidate = spreadVerdict(range);
  const verdict = !partial || candidate === 'pressing-matters' ? candidate : null;

  const money = (value: number) => formatMarketPrice(value, input.currency);
  const spread = range.low === range.high ? money(range.low) : `${money(range.low)}–${money(range.high)}`;

  /**
   * One phrasing for both, so a verdict reads identically whether the sample
   * was complete or not — the sample size is reported separately and honestly,
   * rather than being encoded in how confident the sentence sounds.
   */
  const conclusion =
    verdict === 'pressing-matters'
      ? ' Which pressing you get matters more than the price.'
      : verdict === 'pressing-barely-matters'
        ? ' The pressing barely changes the price.'
        : '';

  if (partial) {
    return {
      range,
      verdict,
      partial,
      text: `${input.checked.length} of ${input.total} pressings checked so far — ${spread}.${conclusion}`,
    };
  }

  return {
    range,
    verdict,
    partial,
    text: `${input.total} pressing${input.total === 1 ? '' : 's'}, ${spread}.${conclusion}`,
  };
}
