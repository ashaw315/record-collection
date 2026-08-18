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
};

export type FactPanel = {
  title: string;
  artist: string;
  /** Null when unknown, so the heading can omit it rather than print a blank. */
  year: number | null;
  groups: BackFaceGroup[];
};

export function factPanel(record: PanelInput): FactPanel {
  return {
    title: record.title,
    artist: record.artistName,
    year: record.releaseYear,
    groups: backFaceGroups(record),
  };
}
