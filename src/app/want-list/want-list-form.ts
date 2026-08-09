import { BEST_DIG_LABEL, MAX_PRICE_LABEL } from './want-list-format';

/**
 * The want-list form's structure (SPEC.md §10), as data.
 *
 * §10 states §7.2's separation as a SCREEN requirement: "`best_dig_notes` and
 * `max_price` are visually and structurally separate — never one section, never
 * one label."
 *
 * It is stated there because this form is the likeliest place to collapse them.
 * The two fields are adjacent in the schema, both optional, both about "what I
 * want" — and a section headed "Wishlist details" holding both would read
 * perfectly well while teaching the user that the best dig is a price.
 * CLAUDE.md §8: "best dig" means the highest-fidelity pressing worth hunting
 * for, not the cheapest or the best deal.
 *
 * So the sections are DATA and the separation is a property a test can assert,
 * rather than a layout decision living in JSX where nothing constrains it.
 */

export type WantListFormValues = {
  title: string;
  artistId: string;
  labelId: string;
  priority: string;
  targetPressingId: string;
  bestDigNotes: string;
  maxPrice: string;
};

export type FormSection = {
  key: string;
  heading: string;
  /** Explains what the section is for, in the user's terms. */
  hint?: string;
  fields: Array<keyof WantListFormValues>;
  labels: Partial<Record<keyof WantListFormValues, string>>;
};

/**
 * Four sections, and the last two exist SEPARATELY on purpose.
 *
 * The labels come from `want-list-format.ts`, which is where they are tested —
 * that "best dig" never mentions price, deals or value, and that the ceiling
 * reads as the user's own limit rather than an appraisal. Restating them here
 * would put a second copy out from under those assertions, which is what
 * happened with the ownership badge and with create-schema.
 */
export const FORM_SECTIONS: FormSection[] = [
  {
    key: 'record',
    heading: 'The record',
    fields: ['title', 'artistId', 'labelId'],
    labels: { title: 'Title', artistId: 'Artist', labelId: 'Label' },
  },
  {
    key: 'priority',
    heading: 'How much you want it',
    hint: '1 is highest, 5 is lowest.',
    fields: ['priority'],
    labels: { priority: 'Priority' },
  },
  {
    /**
     * About the PRESSING. §7.2's best dig is the specific pressing being
     * hunted, so the target pressing belongs here with the notes describing
     * it — and nothing about money does.
     */
    key: 'best-dig',
    heading: 'The dig',
    hint: 'Which pressing you are hunting, and how to recognise it.',
    fields: ['targetPressingId', 'bestDigNotes'],
    labels: { targetPressingId: 'Target pressing', bestDigNotes: BEST_DIG_LABEL },
  },
  {
    /**
     * The user's own ceiling, and a section of its own. Never grouped with the
     * dig: this app never values a record, and a heading that put a price
     * beside "the pressing to hunt for" would imply it does.
     */
    key: 'ceiling',
    heading: 'What you will pay',
    hint: 'Your own limit — this app never estimates what a record is worth.',
    fields: ['maxPrice'],
    labels: { maxPrice: MAX_PRICE_LABEL },
  },
];

/**
 * The §5.3 POST body, carrying only what was filled in.
 *
 * An empty optional field is ABSENT, not an empty string: the API distinguishes
 * "not set" from "set to nothing", and sending `''` where the schema expects a
 * uuid or a decimal is a 400 the user cannot act on.
 */
export function buildWantListBody(values: WantListFormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: values.title.trim(),
    artistId: values.artistId,
  };

  if (values.labelId !== '') body.labelId = values.labelId;
  if (values.targetPressingId !== '') body.targetPressingId = values.targetPressingId;

  // An integer, because the column is one (§4.2: 1 = highest, 5 = lowest).
  if (values.priority.trim() !== '') body.priority = Number(values.priority);

  if (values.bestDigNotes.trim() !== '') body.bestDigNotes = values.bestDigNotes.trim();

  /**
   * A STRING, always. NUMERIC(10,2) is carried as a string end to end (§4.2) —
   * `Number('40.00')` is 40 and the cents are gone before the request is even
   * sent.
   */
  if (values.maxPrice.trim() !== '') body.maxPrice = values.maxPrice.trim();

  return body;
}
