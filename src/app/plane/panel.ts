import { backFaceGroups, type BackFaceGroup, type BackFaceInput } from '../shelf/back-face';

/**
 * The facts that sit beside the record (§10b, A19e).
 *
 * **A thin heading over `backFaceGroups`, deliberately.** That function already
 * decides which fields exist, how each is formatted, and what absence means —
 * and it drops a group whose fields are all missing rather than printing a
 * heading with nothing beneath it. Reimplementing any of that here would make
 * two producers of one fact set, which is the shape NOTES records under
 * `genreSubtree` and again under `hasGatefold`.
 *
 * What it does NOT supply is artist, title and year: those were the face's
 * heading in the CSS version, and nothing produces them for a panel. That gap
 * is the whole of this module.
 *
 * **Absence is ordinary, not an error.** Most records have no purchase price,
 * no store, no condition and no pressing — a panel of mostly-empty labelled
 * rows is the "form" failure that made the old back face read badly.
 */

export type PanelInput = BackFaceInput & {
  title: string;
  artistName: string;
  releaseYear: number | null;
  /** §10b's generated note. Null is ordinary — most records have none. */
  snippet: string | null;
  /** §4.2: non-null means the USER wrote it, so it is not labelled generated. */
  snippetEditedAt: Date | null;
};

export type FactPanel = {
  title: string;
  artist: string;
  /** Null when unknown, so the heading can omit it rather than print a blank. */
  year: number | null;
  groups: BackFaceGroup[];
  /**
   * §10b's snippet, WITH the flag that decides its label.
   *
   * **Never the bare string.** The wall puts this where liner notes sit, so it
   * must not read as liner notes — §10b requires the same register as "Discogs
   * estimates", and nothing in the pipeline verified the text. Pairing the text
   * with `generated` makes it impossible to render one without the other, which
   * a bare `snippet: string | null` would have allowed.
   *
   * Null when there is nothing to show: §10b's "no placeholder invites one".
   */
  snippet: { text: string; generated: boolean } | null;
};

export function factPanel(record: PanelInput): FactPanel {
  return {
    title: record.title,
    artist: record.artistName,
    year: record.releaseYear,
    groups: backFaceGroups(record),
    /*
     * `generated` is false once the user has edited it: the text is then theirs
     * (§7.8), and labelling their writing as the model's is the same
     * misattribution as the reverse.
     */
    snippet:
      record.snippet === null
        ? null
        : { text: record.snippet, generated: record.snippetEditedAt === null },
  };
}
