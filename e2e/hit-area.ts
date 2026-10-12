import { expect, type Page } from '@playwright/test';

/**
 * **What a finger reaches, for every control on a screen.**
 *
 * §9.3's 44 "is a hit-target floor for every control a finger is expected
 * to hit, not a property of the boxed control", met "by overlay where the
 * drawn link is smaller". An overlay is a pseudo-element, which a box
 * reading cannot see (NOTES: the first band test read each link's box and
 * passed nothing). So this reads what a tap lands on: down the control's
 * middle for the height, and out from each side at its mid-height for how
 * far past the drawn thing a tap still reaches it.
 *
 * The second reading is the handoff's other half: "Blank paper is never a
 * tap target", a hit area reaching halfway to a neighbour and, with no
 * neighbour, 9 past the thing and no further.
 */
export type Reach = {
  name: string;
  kind: string;
  /** The drawn box. */
  width: number;
  height: number;
  /** Rows of pixels down the middle on which a tap reaches the control. */
  tall: number;
  /** Pixels past the drawn box's left and right edges on which a tap still reaches it. */
  left: number;
  right: number;
  /**
   * Pixels across its middle on which a tap reaches the control: the drawn
   * width on its first line and what reaches it from either side. Design,
   * 11 Oct: "Controls side by side on one line meet the floor across as
   * they do down." Read for every control and held to nothing by itself:
   * a box as wide as its column is wide enough, and a slanted solid on the
   * shelf is 142 by its box and 14 by this.
   */
  wide: number;
  /** What a tap landed on instead, on the rows of the 44 about the control's middle that did not reach it: so a short reading says what took the rows. */
  lostTo: string[];
};

/**
 * §T.6, step 127: "The 44 floor applies where the pointer is coarse... where
 * the primary pointer is fine, controls keep their drawn size." A test runs
 * under each; `test.use({ hasTouch })` is what sets it on both engines
 * (measured 11 Oct: desktop Chromium is fine at any width and coarse with
 * touch on; WebKit's iPhone is coarse and fine with touch off).
 */
export const POINTERS = ['coarse', 'fine'] as const;
export type Pointer = (typeof POINTERS)[number];

/** The precondition, asserted and not assumed: the page really has the pointer the test is named for. */
export async function pointerIs(page: Page): Promise<Pointer | 'neither'> {
  return page.evaluate(() => (matchMedia('(pointer: coarse)').matches ? 'coarse' : matchMedia('(pointer: fine)').matches ? 'fine' : 'neither'));
}

/** Under a fine pointer nothing reaches further than it is drawn: the controls a tap reaches over more rows than their box has, or from past their sides. */
export function reachingPastItself(reach: Reach[]): string[] {
  /*
    One pixel a side is the grain of the reading: a box that starts between
    two pixels is reached from the pixel it starts in, and one placed by a
    transform, as the dialog is, from one at each end (a button of 32 read
    34 on WebKit before anything was built, step 128). An overlay adds 12
    rows or more, so two do not hide one.
  */
  return reach.filter((r) => r.tall > Math.ceil(r.height) + 2 || r.left > 1 || r.right > 1).map((r) => `${r.name}: drawn ${r.height} tall, reached over ${r.tall}, ${r.left} left, ${r.right} right`);
}

export const HIT_FLOOR = 44;

/**
 * The controls short of the floor. A control whose own drawn box is 44 or
 * more meets it by its box, whatever the sampled rows say; the sampled rows
 * are the test for an overlay, which a box reading cannot see.
 *
 * Why the box and not the count, for a box: staged on 11 Oct (two branch
 * rows on stats, the second scanned every quarter pixel). A box 44 tall
 * from 480.5 to 524.5 gave its last three quarter-pixel samples (43.25,
 * 43.5, 43.75 down) to the row beneath, on its own and with that row's
 * cutting and its link's overlay each switched off. So it is how the
 * browser gives a point to a box that starts on a half pixel, not anything
 * built here, and it made a row of exactly 44 read 43 about one run in
 * three as the rows above it changed. The box's own height is exact.
 */
export function underFloor(reach: Reach[]): Reach[] {
  return reach.filter((r) => r.tall < HIT_FLOOR && r.height < HIT_FLOOR);
}
/** The handoff's figure: how far a hit area reaches past a thing with no neighbour. */
export const HIT_PAST = 9;

/** `except` leaves out the controls inside anything matching it: a part of the screen held for a ruling is named, not silently skipped. */
export async function readReach(page: Page, within = 'main', except?: string): Promise<Reach[]> {
  /*
    The dev server's own badge stands over the page's bottom left corner and
    takes the taps there: the last row of a page read 14 of 44 under it
    (stats at 320, step 127). It is not the app's and is not in a build.
  */
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  return page.evaluate(([selector, held]) => {
    const root = document.querySelector(selector ?? 'main');
    if (root === null) throw new Error(`no ${selector}`);
    const shown = (el: Element) => (held === null || el.closest(held) === null) && el.getClientRects().length > 0 && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    const out: Reach[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('button, a, select, input:not([type=hidden]), textarea, summary')).filter(shown)) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      /* Centring a control can leave the page scrolled to a fraction of a pixel; the reading is taken from a whole one. */
      window.scrollTo(window.scrollX, Math.round(window.scrollY));
      /*
        A box inside its own label (a chip, whose box is not drawn at all,
        or a checkbox with its words) is drawn as the label: the chip or
        the box and its words are the thing a finger aims at, and how far
        a tap reaches is measured from that and not from a box of 1 or 16
        inside it (the record form, step 129).
      */
      /* A select inside its own label likewise: manage's Under and its select are one label, and the word is the select's to a pointer (step 133). */
      const drawn = (el.tagName === 'INPUT' || el.tagName === 'SELECT' ? el.closest('label') : null) ?? el;
      const r = drawn.getBoundingClientRect();
      const reaches = (x: number, y: number) => {
        const at = document.elementFromPoint(x, y);
        if (at === null) return false;
        if (at === el || el.contains(at) || (at.contains(el) && (at.tagName === 'A' || at.tagName === 'LABEL'))) return true;
        /* A field's own label: a tap on it goes to the field, so it is the field's to a finger. */
        const label = at.closest('label');
        return label !== null && el.id !== '' && label.htmlFor === el.id;
      };
      /*
        Read on the control's first line. A link that takes two lines is a
        box a line, and the middle of the box round them all can be a place
        the link is not: at 320 it fell on the Edit that follows a title's
        last word, and the title read 43 for the rows Edit's own hit area
        took (step 127). For a control on one line this is its own box.
      */
      /* The whole first line: a link can be several boxes on one line (an arrow in another font and then its words, the record form's way back, Chromium), and its first box alone is not the link. */
      const boxes = Array.from(drawn.getClientRects());
      const line = boxes.filter((each) => Math.abs(each.top - (boxes[0]?.top ?? 0)) < 1);
      const first = line.length === 0 ? r : new DOMRect(Math.min(...line.map((each) => each.left)), Math.min(...line.map((each) => each.top)), Math.max(...line.map((each) => each.right)) - Math.min(...line.map((each) => each.left)), Math.max(...line.map((each) => each.bottom)) - Math.min(...line.map((each) => each.top)));
      const x = first.left + first.width / 2;
      const y = first.top + first.height / 2;
      let tall = 0;
      /*
        From the middle itself and not the pixel nearest it: a row of exactly
        44 that starts between two pixels holds 43 whole ones, which is what
        a rounded middle counted (stats at 320, one engine, step 126).

        A quarter of a pixel off the middle, for the same reason at the
        other end. Boxes here start on whole and half pixels, and a sample
        that lands exactly half way between two pixel rows is given to the
        row below: with the middle on a whole pixel and samples half a
        pixel off it, the last sample inside a row of 44 (at 443.5 of a box
        from 400 to 444) landed on the row beneath, caught by `lostTo`
        (stats at 320, both engines, about one run in three as the rows
        above it changed). A quarter is on neither a whole nor a half.
      */
      const lostTo = new Set<string>();
      for (let dy = -40; dy < 40; dy += 1) {
        if (reaches(x, y + dy + 0.25)) { tall += 1; continue; }
        if (dy < -22 || dy >= 22) continue;
        const at = document.elementFromPoint(x, y + dy + 0.25);
        lostTo.add(at === null ? `nothing at ${dy}` : `${at.tagName.toLowerCase()}${at.getAttribute('data-testid') === null ? '' : `[${at.getAttribute('data-testid')}]`} "${(at.textContent ?? '').trim().slice(0, 24)}" at ${dy} (its box ${Math.round(at.getBoundingClientRect().top * 100) / 100} to ${Math.round(at.getBoundingClientRect().bottom * 100) / 100}; this one ${Math.round(first.top * 100) / 100} to ${Math.round(first.bottom * 100) / 100})`);
      }
      let left = 0;
      while (left < 40 && reaches(first.left - left - 1, y)) left += 1;
      let right = 0;
      while (right < 40 && reaches(first.right + right + 1, y)) right += 1;
      /* Across the middle, pixel by pixel between the two reaches; counted to 44 and no further, which is all the floor asks. */
      let wide = 0;
      for (let at = Math.floor(first.left) - left; at <= Math.ceil(first.right) + right && wide < 44; at += 1) if (reaches(at + 0.25, y)) wide += 1;
      const name = ((drawn.textContent ?? '').trim() || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.id || el.tagName).slice(0, 90);
      out.push({ name, kind: el.tagName.toLowerCase(), width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10, tall, left, right, wide, lostTo: [...lostTo] });
    }
    return out;
  }, [within, except ?? null] as const);
}

/** The shared dialog (`src/components/ui/dialog.tsx`), which a record's delete, a want-list row's delete and manage's delete each open. */
export const DIALOG = '[data-slot="dialog-content"]';
/** What its three controls are drawn under a mouse, as they were before step 128. */
const DIALOG_DRAWN = { Cancel: 32, Delete: 32, Close: 28 } as const;

/**
 * Step 128, the handoff: "bring Cancel, Delete and Close to the floor under
 * a coarse pointer". Read on an open dialog. Coarse: each is 44 to a finger
 * and reaches no more than 9 past itself. Fine: each is the size it was and
 * reaches no further.
 */
export async function expectDialogControls(page: Page, pointer: Pointer, where: string): Promise<void> {
  expect(await pointerIs(page), 'the precondition: the page has the pointer this test is named for').toBe(pointer);
  await page.locator(DIALOG).waitFor();
  /* The dialog opens on a 100ms zoom, and a box read part way through it is not its box. */
  await page.locator(DIALOG).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  const reach = await readReach(page, DIALOG);
  expect(reach.map((r) => r.name).sort(), `${where}: the dialog’s controls`).toEqual(['Cancel', 'Close', 'Delete']);
  if (pointer === 'coarse') {
    expect.soft(underFloor(reach).map((r) => `${r.name}: ${r.tall}`), `${where}: controls under ${HIT_FLOOR} to a finger`).toEqual([]);
    expect.soft(reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).map((r) => `${r.name}: ${r.left} left, ${r.right} right`), `${where}: controls a tap reaches from more than ${HIT_PAST} past them`).toEqual([]);
    /* Close is an overlay on the cross it was; the two buttons are boxes and are 44 in the box. */
    expect.soft(reach.find((r) => r.name === 'Close')?.height, `${where}: Close is drawn as it was`).toBe(DIALOG_DRAWN.Close);
  } else {
    expect.soft(reachingPastItself(reach), `${where}: controls a mouse reaches from outside their drawn box`).toEqual([]);
    for (const r of reach) expect.soft(r.height, `${where}: ${r.name} is drawn as it was under a mouse`).toBe(DIALOG_DRAWN[r.name as keyof typeof DIALOG_DRAWN]);
  }
}

/**
 * A screen's controls held to the floor under the pointer the page has.
 * Coarse: every one is 44 to a finger and reaches no more than 9 past
 * itself. Fine: every one is its drawn size and reaches no further. Returns
 * the reading, so a test can hold what is drawn as well.
 */
export async function expectFloor(page: Page, pointer: Pointer, where: string, within = 'main', except?: string): Promise<Reach[]> {
  expect(await pointerIs(page), 'the precondition: the page has the pointer this test is named for').toBe(pointer);
  const reach = await readReach(page, within, except);
  expect(reach.length, `${where}: there are controls to read`).toBeGreaterThan(0);
  if (pointer === 'coarse') {
    expect.soft(underFloor(reach).map((r) => `${r.name}: ${r.tall}`), `${where}: controls under ${HIT_FLOOR} to a finger, of ${reach.length}`).toEqual([]);
    expect.soft(reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).map((r) => `${r.name}: ${r.left} left, ${r.right} right`), `${where}: controls a tap reaches from more than ${HIT_PAST} past them`).toEqual([]);
  } else {
    /*
      A field is left out of the two readings of height, and held from side
      to side only. Its own label is its target under any pointer and always
      was, so a field with its label over its middle reads taller than it is
      drawn before anything is built: 54 for a field of 36 on the want
      list's form, 57 for the rail's search (measured on the unbuilt
      screens, step 130). What a field is DRAWN is held by each test.
    */
    const field = (r: Reach) => r.kind === 'input' || r.kind === 'select' || r.kind === 'textarea';
    expect.soft(reachingPastItself(reach.filter((r) => !field(r))), `${where}: controls a mouse reaches from outside their drawn box`).toEqual([]);
    expect.soft(reach.filter((r) => field(r) && (r.left > 1 || r.right > 1)).map((r) => `${r.name}: ${r.left} left, ${r.right} right`), `${where}: fields a mouse reaches from past their sides`).toEqual([]);
    expect.soft(reach.filter((r) => !field(r) && r.tall >= HIT_FLOOR && r.height < HIT_FLOOR).map((r) => `${r.name}: ${r.tall}`), `${where}: controls 44 tall under a mouse that were not drawn so`).toEqual([]);
  }
  return reach;
}
