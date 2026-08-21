import type { FactPanel } from './panel';
import type { BackFaceGroup } from '../shelf/back-face';

/**
 * **The card beside a pulled record, reduced to a summary.**
 *
 * The three size candidates each reserved a fraction of the frame for facts,
 * and that reservation was a GUESS ABOUT CONTENT: the seeded record's card is
 * three lines with a large void beneath it, while a fully-documented record —
 * label, catalogue number, pressing year and plant, condition, purchase price
 * and store — overflows the same space.
 *
 * A summary has a **constant height**, so the reservation stops being a guess
 * and the record can take everything else. That is what makes the size question
 * answerable at all: "how big, given a known small reservation" rather than
 * "how much should be reserved".
 *
 * ## What it contains, and why not the spine's three fields
 *
 * §10b puts **artist, title and catalogue number** on the spine itself. A
 * summary repeating those exactly would add nothing to a record the reader is
 * already looking at.
 *
 * So the summary is **artist, title and RELEASE YEAR**, and the year is the
 * field that earns its place:
 *
 * - `release_year` is "the album's original release year, **not** this
 *   pressing's year" (§4, and the schema says so in those words). The spine
 *   carries the catalogue number, which identifies the PRESSING. So the pair
 *   answers two different questions — *what record is this* and *which copy* —
 *   and neither is recoverable from the other.
 * - It is the one field of the four that a collector cannot read off the object
 *   in their hand.
 *
 * Artist and title repeat the spine deliberately: the pulled record shows its
 * COVER, not its spine, and a card whose heading did not name the record it sits
 * under would be a caption for something else.
 *
 * ## The rest is a tap away
 *
 * `/records/[id]` already carries the full facts, the journal, price history,
 * images and the snippet. A modal would be a second surface showing the same
 * data and drifting from it — the two-producers shape recorded three times in
 * this project (`genreSubtree`, `hasGatefold`, and `panel.ts`'s own comment
 * about not reimplementing `backFaceGroups`).
 *
 * **The keyboard path already went there.** `WallScene`'s accessible list links
 * every record to `/records/[id]`, so this is the same destination reached a
 * second way rather than a new one — a consistency worth naming, because it
 * means the tap affordance and the screen-reader affordance cannot drift.
 */

export type RecordSummary = {
  title: string;
  artist: string;
  /** Null when unknown, so the line can omit it rather than print a blank. */
  year: number | null;
  /** Where the rest of the facts live. */
  href: string;
  /**
   * How many further facts the detail page would show.
   *
   * **The tap needs to promise something specific.** "More" is a control that
   * does not say what it does; a count says whether the trip is worth taking,
   * and distinguishes a record with nothing else recorded from one with a
   * dozen fields. Absence is ordinary (§10b), so zero is a real answer and the
   * affordance says so rather than hiding.
   */
  furtherFacts: number;
  /**
   * **The generated synopsis, with its label — separate from the facts (A33c).**
   *
   * The snippet is the app's own claim about the music (§10b), carried as
   * `{ text, generated }` since 13c precisely so it can never be rendered as a
   * fact. The expanded panel shows it above the fact list, labelled, with a
   * boundary between — and keeping it a distinct field here is what makes that
   * boundary enforceable rather than a hope. Null when there is no snippet,
   * which is most records.
   */
  snippet: { text: string; generated: boolean } | null;
  /**
   * The entered and imported facts, as `backFaceGroups` produced them — a
   * SEPARATE field from `snippet`, so the two cannot merge in the panel.
   */
  factGroups: BackFaceGroup[];
};

export function recordSummary(panel: FactPanel, recordId: string): RecordSummary {
  /*
    Counted from the panel's own groups rather than re-derived from the record:
    `backFaceGroups` already decides which fields exist and drops empty groups,
    and counting them again from the source would be the second producer this
    module's own doc warns about.
  */
  const furtherFacts = panel.groups.reduce((total, group) => total + group.rows.length, 0);

  return {
    title: panel.title,
    artist: panel.artist,
    year: panel.year,
    href: `/records/${recordId}`,
    furtherFacts,
    /* Passed through with its flag intact — never flattened into the facts. */
    snippet: panel.snippet,
    factGroups: panel.groups,
  };
}

/**
 * The summary's line count — **the quantity the size rule reserves room for.**
 *
 * Two lines, always, whatever the record holds:
 *
 *   1. the title
 *   2. artist, and the year when there is one
 *
 * plus the link. The year joins line 2 rather than taking a third, which is
 * what keeps this constant when it is absent.
 *
 * **This is a claim the layout has to honour**, not a description of it: if the
 * card's rendered height varies with how much is recorded, the reservation is a
 * guess again and the size rule built on it is wrong. `e2e/summary-card.spec.ts`
 * measures both extremes against each other.
 */
export const SUMMARY_LINES = 2;
