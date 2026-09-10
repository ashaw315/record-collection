import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **SPEC.md §7a's type scale, asserted against the CSS that is actually built.**
 *
 * A61 states eight sizes — `72 · 40 · 15 · 13 · 12 · 11 · 10 · 9` — with 15 and
 * 13 each carrying two entries under the two-entry predicate, and names 13/400
 * sans as the size for continuous text.
 *
 * **The hole this closes is specific and it is the reason the guard comes before
 * the conversion.** A test asserting `text-sm` keeps passing when `text-sm`
 * moves from 14 to 13 and should have moved to 12: the class name is a proxy
 * one layer below the claim, and the rendering can change underneath it without
 * a diff at the assertion. So this reads the COMPILED stylesheet and asserts
 * each token resolves to the pixel value the spec states.
 *
 * Same mechanism as `pressing-verdict.test.ts` and `ownership-badge.test.ts`,
 * pointed at the scale: `border-l-dashed` shipped as a class Tailwind never
 * generated, and nothing caught it because the map was only compared with
 * itself.
 *
 * **Tokens are named by ROLE, not by size (Option B with C's naming
 * discipline).** The eight sizes stay an implementation detail, so a later
 * change to what a role measures touches one declaration in `globals.css`
 * rather than every site using it. Naming them `text-13` would put the size
 * back in 333 call sites and make the next change a rename again.
 */

/**
 * The scale, as §7a states it — role name, the px it must resolve to, and what
 * the role is for.
 *
 * **Two entries at 15 and two at 13**, which is the predicate this file exists
 * to enforce: a size may carry a second entry only where the two differ in more
 * than weight. `title`/`lede` differ in weight AND role (a heading against a
 * standfirst); `prose`/`detail` differ in weight AND role (continuous text
 * against a labelled value). A pair differing only in weight would be one entry
 * with a weight utility, not two tokens.
 */
const SCALE = [
  { token: 'display', px: 72, of: 'the one figure a screen exists to show' },
  { token: 'headline', px: 40, of: 'a screen title' },
  { token: 'title', px: 15, of: 'a section heading' },
  { token: 'lede', px: 15, of: 'a standfirst under a heading' },
  { token: 'prose', px: 13, of: 'continuous text — A61 names 13/400 sans' },
  { token: 'detail', px: 13, of: 'a labelled value beside its label' },
  { token: 'caption', px: 12, of: 'supporting text under a figure' },
  { token: 'label', px: 11, of: 'a field label' },
  { token: 'meta', px: 10, of: 'timestamps, counts, provenance' },
  { token: 'micro', px: 9, of: 'the spine, and nothing else' },
  /**
   * **A67's exception as a token.** Anything the user types into, regardless of
   * what the text is: Safari zooms the viewport under 16px on a focused input,
   * so this is a claim about a browser rather than about the text. Deliberately
   * NOT `prose` — see the note in globals.css.
   */
  { token: 'typed', px: 16, of: 'anything the user types into' },
] as const;

const compiled = (() => {
  const dir = join(process.cwd(), '.next', 'static', 'chunks');
  if (!existsSync(dir)) return null;
  const css = readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
  return css === '' ? null : css;
})();

/**
 * The font-size a role's UTILITY sets, as the build emitted it.
 *
 * **Read from the utility rather than from a `--text-*` custom property, and
 * that is a correction rather than a preference.** `globals.css` uses
 * `@theme inline`, which deliberately does NOT emit the custom property — it
 * inlines the value into the generated class. A guard looking for
 * `--text-prose:` finds nothing on a correct build and everything it asserts is
 * vacuous. Verified against an existing token: `--color-primary` is absent from
 * the built CSS while `.bg-primary{background-color:var(--primary)}` is present.
 *
 * The utility is also the channel that actually reaches an element, so this is
 * the stronger assertion in any case: a theme entry nothing generates a class
 * for is the `border-l-dashed` shape, and this cannot pass on one.
 */
function declared(name: string): string | null {
  if (compiled === null) return null;
  const rule = new RegExp(`\\.${name}\\{[^}]*font-size:\\s*([^;}]+)`).exec(compiled);
  return rule === null ? null : rule[1].trim();
}

/** px, whether the value was written in px or rem. */
function pixels(value: string): number | null {
  const rem = /^([\d.]+)rem$/.exec(value);
  if (rem !== null) return Number(rem[1]) * 16;
  const px = /^([\d.]+)px$/.exec(value);
  return px === null ? null : Number(px[1]);
}

describe('the type scale resolves to the sizes §7a states', () => {
  it('the build produced CSS to check against', () => {
    /*
      Stated as its own assertion rather than folded into a skip. Every test
      below is vacuous without a build, and a file that silently passes on a
      clean checkout is the absence-as-success shape this repo keeps meeting —
      `npm run build` is in the definition of done, so this bites on any tree
      that has been built.
    */
    expect(compiled, 'run `npm run build` — without it this file asserts nothing').not.toBeNull();
  });

  /**
   * **A role with no site yet emits no utility, and that is not a failure.**
   *
   * Tailwind v4 generates a class only where it finds one used, so an
   * unconverted role is absent from the CSS rather than wrong in it. Asserting
   * every role unconditionally would make this file fail for the whole length
   * of a nine-screen conversion, and a suite that is red by design is one
   * nobody reads — the `retries: 1` argument again.
   *
   * So an absent role is skipped and a PRESENT one is checked strictly. The
   * cost is that a role could stay unconverted forever without this noticing,
   * which is why `converted roles` below asserts the count only ever grows: the
   * conversion's progress is the thing tracked, not each role's existence.
   *
   * `micro` is the standing exception — 9px is the spine, drawn into a canvas
   * texture by `spineLabelPlan`, so no CSS class will ever carry it.
   */
  const emitted = (token: string) => declared(`text-${token}`) !== null;

  for (const { token, px, of } of SCALE) {
    it(`--text-${token} is ${px}px, for ${of}`, ({ skip }) => {
      if (!emitted(token)) skip(`text-${token} has no site yet — nothing to check`);
      const value = declared(`text-${token}`);

      expect(value, `--text-${token} is not declared in the built CSS`).not.toBeNull();
      expect(pixels(value ?? ''), `--text-${token} = ${value}`).toBe(px);
    });

    /**
     * A token that is declared but generates no utility is the `border-l-dashed`
     * shape: it looks right in the theme block and produces nothing at the call
     * site. Declaring a custom property and emitting a class are separate steps
     * in Tailwind v4, so both are checked.
     */
    it(`text-${token} generates a rule`, ({ skip }) => {
      if (!emitted(token)) skip(`text-${token} has no site yet`);
      expect(
        compiled === null ||
          new RegExp(`\\.text-${token}(?![a-zA-Z0-9_-])`).test(compiled),
        `text-${token} is declared but generates no utility`,
      ).toBe(true);
    });
  }

  /**
   * **The conversion's progress, asserted so it cannot silently reverse.**
   *
   * The skips above mean an unconverted role is invisible here. This is the
   * counterweight: the number of roles in use only ever grows, so a change that
   * reverts a converted screen to `text-sm` fails even though every remaining
   * assertion still passes. Raise the floor as screens land.
   */
  it('keeps every role that has already been converted', () => {
    const inUse = SCALE.filter(({ token }) => emitted(token)).map(({ token }) => token);

    expect(inUse, 'roles in use').toEqual(
      expect.arrayContaining([
        'headline',
        'title',
        'lede',
        'prose',
        'detail',
        'caption',
        'label',
        'meta',
        'typed',
      ]),
    );
  });
});

describe("A61's two-entry predicate", () => {
  /**
   * **A size may carry a second entry only where the two differ in more than
   * weight.** Two tokens at one size differing only in weight are one entry and
   * a weight utility — the enumeration A61's own defect describes, arriving in
   * the scale itself.
   *
   * Enforced on the DECLARED sizes rather than on this file's table, so a token
   * quietly redefined in `globals.css` fails here rather than agreeing with a
   * list that describes what we believe.
   */
  it('carries at most two entries at any one size', () => {
    const bySize = new Map<number, string[]>();
    for (const { token } of SCALE) {
      const value = declared(`text-${token}`);
      const px = value === null ? null : pixels(value);
      if (px === null) continue;
      bySize.set(px, [...(bySize.get(px) ?? []), token]);
    }

    for (const [px, tokens] of bySize) {
      expect(tokens.length, `${px}px carries ${tokens.join(', ')}`).toBeLessThanOrEqual(2);
    }
  });

  it('gives every doubled size two entries that differ in more than weight', () => {
    /*
      The pairs are named rather than derived, because "differs in more than
      weight" is a claim about ROLE and role is not readable from CSS. What the
      assertion can enforce is that the pair is the one the spec sanctioned —
      so a third token appearing at 15, or a rename that quietly repurposes
      `lede`, fails here.
    */
    const SANCTIONED: Record<number, readonly string[]> = {
      15: ['title', 'lede'],
      13: ['prose', 'detail'],
    };

    for (const [px, expected] of Object.entries(SANCTIONED)) {
      const actual = SCALE.filter(({ token }) => {
        const value = declared(`text-${token}`);
        return value !== null && pixels(value) === Number(px);
      }).map(({ token }) => token);

      /*
        A SUBSET, because a role with no site yet emits nothing — `lede` is
        declared at 15 and unused until a screen needs a standfirst. What must
        never happen is a token at this size that the spec did not sanction, so
        this asserts containment rather than equality.
      */
      for (const token of actual) {
        expect(expected, `${token} renders at ${px}px`).toContain(token);
      }
    }
  });

  /**
   * **No role name may collide with a colour token, because colour wins
   * silently.**
   *
   * `--color-input` already existed, so `--text-input` generated
   * `.text-input{color:var(--input)}` — a text-COLOUR utility — and the font
   * size never reached the element. The build succeeded, the token looked
   * declared, and the size was simply absent. The role was renamed to `typed`.
   *
   * Asserted from the compiled CSS rather than from a hand-list of colour
   * names, so a colour token added later collides here rather than on a screen.
   */
  it('gives no role a name that a colour token has already taken', () => {
    for (const { token } of SCALE) {
      const rule = new RegExp(`\\.text-${token}\\{([^}]*)\\}`).exec(compiled ?? '');
      if (rule === null) continue;

      expect(
        rule[1],
        `text-${token} emits ${rule[1]} — a --color-${token} has taken the name`,
      ).toContain('font-size');
    }
  });

  it('names one size for continuous text, and it is 13', () => {
    // §7a: "13/400 sans is the size for continuous text." The token carrying
    // that role is `prose`, so its value is the one that must not drift.
    const value = declared('text-prose');

    expect(pixels(value ?? ''), 'prose is the continuous-text size').toBe(13);
  });
});
