import { describe, expect, it } from 'vitest';
import { cn } from './utils';

/**
 * **`cn` must not treat a §7a role token as a text COLOUR.**
 *
 * `tailwind-merge` resolves conflicts by class-group, and it groups every
 * `text-*` utility it does not recognise as a font-size into the colour group.
 * The role scale's tokens — `text-prose`, `text-label`, `text-display` — are
 * sizes it has never heard of, so it dropped them whenever a colour was merged
 * alongside:
 *
 *     twMerge('text-label text-primary-foreground')  ->  'text-primary-foreground'
 *
 * **Measured in the browser, not inferred.** `/`'s view chips carry
 * `text-label` plus a conditional `text-primary-foreground` when active: the
 * active chip rendered at **16px** — the browser default, with the role gone —
 * and the inactive one at 12.8px. Selecting a control changed its text size by
 * a quarter, and the markup looked correct throughout.
 *
 * Eight call sites had the shape. Fixing them individually would have left the
 * ninth to be written later, so the fix is in `cn` and this is what pins it.
 */
describe('cn keeps role tokens and colours apart', () => {
  const ROLES = [
    'text-display',
    'text-headline',
    'text-title',
    'text-lede',
    'text-prose',
    'text-detail',
    'text-caption',
    'text-label',
    'text-meta',
    'text-typed',
  ] as const;

  const COLOURS = [
    'text-foreground',
    'text-muted-foreground',
    'text-primary-foreground',
    'text-destructive',
    'text-background',
  ] as const;

  for (const role of ROLES) {
    it(`${role} survives being merged with a colour`, () => {
      for (const colour of COLOURS) {
        const out = cn(role, colour);

        expect(out, `${role} + ${colour}`).toContain(role);
        expect(out, `${role} + ${colour}`).toContain(colour);
      }
    });
  }

  /**
   * The behaviour that must NOT regress: two roles genuinely conflict, and the
   * later one wins. A fix that simply stopped merging `text-*` would make every
   * role additive and let an override silently lose to whatever came first.
   */
  it('still resolves one role against another, last wins', () => {
    expect(cn('text-prose', 'text-display')).toBe('text-display');
    expect(cn('text-label', 'text-meta')).toBe('text-meta');
  });

  /** And colours still conflict with each other, as they always did. */
  it('still resolves one colour against another', () => {
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground');
  });
});
