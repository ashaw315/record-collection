/**
 * The panels' colours over the wall, as VALUES rather than class names.
 *
 * **The values shipped invisible and nothing could have caught it.** `Panels.tsx`
 * was built against `/plane`'s light workbench page, where `text-foreground` is
 * correctly dark. Giving the panels a near-black ground — the fix for
 * transparent text over spine glyphs — left the value column at L* 6.2 on a
 * ground of L* 6.5: a contrast ratio of **1.02:1**, which reads on screen as a
 * panel of labels with no values.
 *
 * That is the "field of empty labels" failure the panels were told to avoid,
 * reached from the opposite direction. The rows were present, correctly
 * filtered and correctly formatted; the omission logic was right and is
 * untouched. They simply could not be seen.
 *
 * A colour written into a `className` is a string, and no test can ask a string
 * whether it is readable. Here the colours are values and the RELATIONSHIP
 * between them is asserted — swept across every role, because unit 17 found two
 * endpoint assertions can both pass while a band between them collapses.
 *
 * The palette itself is not new: it is the one the CSS implementation used for
 * this same panel on this same dark ground, which was designed and reviewed
 * against it before that path was retired.
 */

/** The panel's own ground. Everything below is measured against this. */
export const PANEL_GROUND = '#141210';

/**
 * What each kind of text is for, and why they differ.
 *
 * The differences carry meaning rather than decoration:
 *
 *   `title`       the record, set brightest — it is what the panel is about
 *   `value`       the facts a collector reads off: catalogue numbers, matrix
 *                 strings, prices. Getting a character wrong is the failure
 *                 mode, so these are the most legible of the rows.
 *   `label`       names the value. Deliberately quieter — a label brighter than
 *                 its value inverts what the eye reads first.
 *   `provenance`  the owner's information, which a real sleeve does not print
 *                 at all, so it is quieter still and comes last.
 *   `muted`       the honest empty state and the panel's asides.
 */
export type PanelRole = 'title' | 'value' | 'label' | 'provenance' | 'muted';

export const PANEL_TEXT: Record<PanelRole, string> = {
  title: '#f0eae0',
  value: '#e8e2d8',
  label: '#a89e92',
  provenance: '#bdb3a6',
  muted: '#a89e92',
};

/**
 * Relative luminance, per WCAG: linearised channels, Rec. 709 weights.
 *
 * Shares its definition with `shelf-surface.relativeLuminance` and is
 * deliberately not imported from it — that one answers "which of these two
 * timbers is lighter" for the wall's lighting order, this one feeds a ratio
 * with a defined threshold. Same formula, two different questions; coupling
 * them would mean a change made for the wall's palette could silently move the
 * panel's readability floor.
 */
function relativeLuminance(hex: string): number {
  const normalised = hex.replace('#', '');
  const channel = (offset: number): number => {
    const value = parseInt(normalised.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/**
 * WCAG contrast ratio between two colours, 1:1 to 21:1.
 *
 * Symmetric by construction — the lighter of the two always takes the
 * numerator — so no caller can change a verdict by swapping its arguments.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);

  return (lighter + 0.05) / (darker + 0.05);
}
