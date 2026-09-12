/**
 * Which of the detail grid's modules hold content, and how an empty one is
 * marked (7a §1.1, §1.3, §1.4).
 *
 * **The diagonal marks modules, not fields, and that is the limit.** Counted
 * against all seventeen real records, a field-level diagonal gives the modal
 * record five marks: the page reads as one that failed to load, and the four
 * small ones fail §5's area floor at 3.3% of the grid between them. At cell
 * level the same record produces two, each above the floor. So absent fields
 * inside a populated cell render nothing at all.
 *
 * **An empty cell must be bounded on all four sides (§1.1).** The absent-rule
 * instruction that joins provenance to journal applies only while both have
 * content; when either empties the hairline returns, because a diagonal with no
 * cell to belong to reads as a line struck through the block above it rather
 * than as a marker in its own module.
 *
 * That is also what saves the 6px vertical: **a drawn cell is a terminus.** §7
 * predicted the structural rule would run into an empty cell and lose its
 * terminus, and it does not, because the diagonal gives the rule something to
 * run against.
 *
 * Pure, so the compositions can be asserted without rendering.
 */

/** What a module's absence means, when it is absent. */
export type Diagonal =
  /** Populated — no mark. */
  | 'none'
  /** Not recorded: the owner can fill it. */
  | 'single'
  /** Not applicable: the owner cannot. */
  | 'crossed';

export type ModuleInput = {
  catalogNumber: string | null;
  labelName: string | null;
  formatName: string | null;
  countryPressed: string | null;
  releaseYear: number | null;
  yearPressed: number | null;
  genres: ReadonlyArray<{ id: string; name: string }>;
  purchasePrice: string | null;
  storeName: string | null;
  conditionMedia: string | null;
  conditionSleeve: string | null;
  marketMedian: string | null;
  marketLow: string | null;
  marketHigh: string | null;
  marketFetchedAt: Date | null;
  /**
   * Whether the pressing has a Discogs release at all.
   *
   * This is what separates the market module's two absences: no release means
   * no figure can ever exist, which is `crossed`; a release with no price yet
   * is `single`.
   */
  hasDiscogsRelease: boolean;
  journalEntry: { entry: string; entryDate: string } | null;
};

type Module = { empty: boolean; diagonal: Diagonal };

export type GridModules = {
  /** The facts side. Carries the genres line, per §1.1. */
  pressing: Module & { genres: ReadonlyArray<{ id: string; name: string }>; pressedSameYear: boolean };
  provenance: Module;
  market: Module;
  journal: Module;
};

export function gridModules(input: ModuleInput): GridModules {
  const pressingPopulated =
    input.catalogNumber !== null ||
    input.labelName !== null ||
    input.formatName !== null ||
    input.countryPressed !== null ||
    input.releaseYear !== null ||
    /*
      `yearPressed` counts. Without it, a record whose only pressing fact is the
      year it was pressed drew a "not recorded" diagonal over a fact it had
      recorded — and §1.2 folds the matching case into the display band's label,
      so a DIFFERENT pressed year has nowhere else to appear.
    */
    input.yearPressed !== null ||
    input.genres.length > 0;

  /*
    `purchase_date` is deliberately absent from this list and from `ModuleInput`
    (§1.4): it is unset on all seventeen records, so a marker for it would never
    vary — and a mark whose value is constant is texture rather than
    information. If it is ever populated it joins the provenance line as text.
  */
  const provenancePopulated =
    input.purchasePrice !== null ||
    input.storeName !== null ||
    input.conditionMedia !== null ||
    input.conditionSleeve !== null;

  const marketPopulated = input.marketMedian !== null;

  return {
    pressing: {
      empty: !pressingPopulated,
      diagonal: pressingPopulated ? 'none' : 'single',
      genres: input.genres,
      /*
        §1.2's line: "Released · pressed the same year". One line rather than
        two fields saying the same thing — §6 drops labels that duplicate their
        content. An unknown pressing year is not a claim of sameness.
      */
      pressedSameYear:
        input.releaseYear !== null &&
        input.yearPressed !== null &&
        input.releaseYear === input.yearPressed,
    },
    provenance: {
      empty: !provenancePopulated,
      diagonal: provenancePopulated ? 'none' : 'single',
    },
    market: {
      empty: !marketPopulated,
      /*
        The distinction §1.3 draws on the emptiest record: without a Discogs
        release the figure is not applicable rather than not recorded, and the
        reader should not be invited to fill something they cannot.
      */
      diagonal: marketPopulated ? 'none' : input.hasDiscogsRelease ? 'single' : 'crossed',
    },
    journal: {
      empty: input.journalEntry === null,
      /* Always fillable: an entry is the owner's to write. */
      diagonal: input.journalEntry === null ? 'single' : 'none',
    },
  };
}
