import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * **`tailwind-merge` has to be told that §7a's role tokens are FONT SIZES.**
 *
 * It resolves conflicts by class-group, and every `text-*` utility it does not
 * recognise as a size falls into the colour group. The role scale's tokens are
 * sizes it has never heard of, so merging a colour alongside one dropped it:
 *
 *     twMerge('text-label text-primary-foreground')  ->  'text-primary-foreground'
 *
 * **Found in the browser rather than by reading.** `/`'s view chips carry
 * `text-label` plus a conditional `text-primary-foreground` when active. The
 * active chip rendered at 16px — the browser default, with the role gone — and
 * the inactive one at 12.8px, so selecting a control changed its text size by a
 * quarter. The markup looked correct at every point, which is why nothing
 * caught it: the class was in the source, absent from the output, and no test
 * read a rendered size.
 *
 * Eight call sites had that shape. Fixing them one by one would have left the
 * ninth for whoever wrote it next, so the knowledge lives here instead —
 * `src/lib/utils.test.ts` pins every role against every colour.
 *
 * The tokens are listed rather than derived because `@theme` is CSS and this is
 * TypeScript; `type-scale.test.ts` asserts the same ten against the compiled
 * stylesheet, so a role added there and forgotten here fails that file.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "headline",
            "title",
            "lede",
            "prose",
            "detail",
            "caption",
            "label",
            "meta",
            "typed",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
