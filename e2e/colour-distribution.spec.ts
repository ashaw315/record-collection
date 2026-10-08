import { expect, test, type Page } from '@playwright/test';
import { renderedArea } from './svg-area';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

/**
 * §5.5's colour rule: **a floor per mark, absolute.**
 *
 * Two rules were withdrawn before this one, and the same defect killed both.
 * The area budget (12–18% of the page) could be met by one big rectangle, so it
 * could not distinguish a keyed composition from one large mark plus rounding.
 * The share-of-coloured-area ceiling (no mark above 40%) was a RATIO, and the
 * measurement that proved it was 72.3% on the emptiest record: no mark grew,
 * the arcs suppressed, and the rule tightened hardest on the record with least
 * colour. Both were defined over an axis correlated with the signal.
 *
 * **The diagnosis inverts.** The year field at two-thirds is not the defect — it
 * is the ANCHOR, the one mark guaranteed on every record and the 72's ground.
 * The defect is the five marks under 1.5%, and the journal edge at 0.07% is the
 * clearest case.
 *
 * So: **every base-step mark other than the year field is at least 0.5% of the
 * page, two per band.** Per-mark and absolute, so it does not move when the page
 * empties and suppression cannot game it. Neither the field shrinks nor the
 * construction becomes a colour field.
 *
 * **The construction is ONE base mark**, however many of its faces carry colour
 * — one object seen from three sides. That matters for the count and for the
 * floor, and it is the last place the plural could slip.
 */

/**
 * **Every mark's KIND, because the floor governs base FIELD marks only.**
 *
 * The floor is an area rule. The journal edge is LINEAR — a 2px border — and the
 * sleeve bar is TINT, so neither was ever in its scope; widening them collided
 * with §3's "only 2px edge" and with the cover being the source rather than a
 * mark, and those collisions were the tell that the rule was reaching past its
 * subject.
 *
 * Classified by kind rather than exempted by name: a test that exempts
 * `journalEdge` by name passes the moment a second linear mark appears, and a
 * test that exempts linear marks catches it.
 */
type MarkKind = 'baseField' | 'linear' | 'tint' | 'ink';

/* Partial on purpose: a lookup miss must be observable, so the guard below can
   fire. A total Record would make `unclassified` unreachable and TypeScript
   says so — which is the vacuity check proving itself impossible. */
const MARK_KIND: Partial<Record<string, MarkKind>> = {
  releaseYearField: 'baseField',
  /* §45 (step 53): the leftover between the title and the pressing block takes the tint step as a field. Tint, so the area floor does not govern it. */
  identityField: 'tint',
  construction: 'baseField',
  /* Linear: an area floor cannot govern a 2px rule. */
  journalEdge: 'linear',
  /* Tint: ground, and the sleeve bar frames the source rather than being one. */
  sleeveBar: 'tint',
  provenanceArc: 'tint',
  disc: 'tint',
  /* Fixed ink, never derived — they anchor the construction. */
  sleeveBlock: 'ink',
  /*
    §5.4's second rendered still: record-independent artwork that never
    recolours, so it is off the ladder like the black marks. Not a base field
    mark, so the area floor does not govern it.
  */
  matrixSolid: 'ink',
};

/** The coloured area of each mark, in px², with the two cell-property marks handled. */
/** The page's own `renderedArea` (`svg-area.ts`), shipped as source: the evaluate cannot import. */
const RENDERED_AREA = renderedArea.toString();

const colouredAreas = (page: Page) =>
  page.evaluate(([renderedAreaSource]) => {
    const rendered = new Function('return ' + renderedAreaSource)() as typeof renderedArea;
    const areas: Array<{ name: string; area: number }> = [];

    for (const mark of document.querySelectorAll('[data-mark]')) {
      const name = mark.getAttribute('data-mark') ?? '?';
      /* Counted with the construction below, not as a mark of its own. */
      if (name === 'disc') continue;
      const box = mark.getBoundingClientRect();

      /*
        Two of the seven are properties of a cell rather than elements: the
        release-year field IS the cell's background, and the journal edge is a
        2px border. Counting the journal cell's box gave 11.74% for a hairline,
        which is what exposed the first measurement as wrong.
      */
      let area: number;
      if (name === 'journalEdge') area = 2 * box.height;
      else if (name.endsWith('Arc') || name === 'disc') area = box.width * box.height * (Math.PI / 4);
      else area = box.width * box.height;

      areas.push({ name, area });
    }

    /* The construction's coloured faces, from the SVG's own geometry. */
    const svg = document.querySelector('[data-testid="construction-still"]');
    if (svg !== null) {
      const svgBox = svg.getBoundingClientRect();
      const vb = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number);
      /*
        The area a face draws at: uniform under `meet`, the smaller ratio
        squared. This multiplied the two ratios until 29 Sep, which is right
        only while the box has the viewBox's aspect -- and §33 fits each record
        on ONE axis, so it does not. The dependency is asserted below.
      */
      const box = { width: svgBox.width, height: svgBox.height };
      const viewBox = { width: vb[2], height: vb[3] };
      let faces = 0;
      for (const poly of svg.querySelectorAll('polygon[data-step="base"]')) {
        const pts = (poly.getAttribute('points') ?? '')
          .trim()
          .split(/\s+/)
          .map((p) => p.split(',').map(Number));
        let sum = 0;
        for (let i = 0; i < pts.length; i += 1) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[(i + 1) % pts.length];
          sum += x1 * y2 - x2 * y1;
        }
        faces += rendered(Math.abs(sum) / 2, box, viewBox);
      }
      /*
        **The construction is ONE base mark**, so its disc and its coloured
        faces are one entry — one object seen from three sides, not five marks.
        Measured separately they each fall under the floor while the object they
        belong to clears it, which is the plural slipping back in at the point a
        build counts from.
      */
      const disc = svg.querySelector('circle[data-mark="disc"]');
      let discArea = 0;
      if (disc !== null) {
        const box = disc.getBoundingClientRect();
        discArea = box.width * box.height * (Math.PI / 4);
      }
      areas.push({ name: 'construction', area: faces + discArea });
    }

    return areas;
  }, [RENDERED_AREA] as const);

/**
 * **What the construction's area arithmetic depends on, asserted.** `renderedArea`
 * is the smaller ratio squared, which is how `preserveAspectRatio="… meet"`
 * scales; with `slice` or `none` the same polygons would draw at a different
 * size and the floor and the 40% share would be judged on a number nothing
 * rendered. Read from the element, so a change in `ConstructionStill.tsx` fails
 * here rather than silently re-weighting every figure below.
 */
const constructionScalesUniformly = async (page: Page) => {
  const alignment = await page.evaluate(() => document.querySelector('[data-testid="construction-still"]')?.getAttribute('preserveAspectRatio') ?? null);
  expect(alignment, 'the construction svg is on the page').not.toBeNull();
  expect(alignment, 'the construction scales uniformly (meet), which the area arithmetic assumes').toMatch(/\bmeet$/);
};

const CASES = ['richest', 'modal', 'emptiest'] as const;

test.describe('colour distribution (§5.5)', () => {
  test.use({ viewport: { width: 1440, height: NO_SCROLL_HEIGHT } });

  /** §5.5's floor, for base FIELD marks other than the anchor. */
  const FLOOR_PCT = 0.5;

  for (const which of CASES) {
    test(`gives every base field mark its floor on the ${which} record`, async ({ page }) => {
      await login(page);
      await page.goto(`/wall/probe/page8a?case=${which}`);
      await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

      await constructionScalesUniformly(page);
      const areas = await colouredAreas(page);
      const pageArea = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="record-page-8a"]');
        if (el === null) return 0;
        const box = el.getBoundingClientRect();
        return box.width * box.height;
      });

      expect(pageArea, 'the page has area').toBeGreaterThan(0);

      const shares = areas
        .map((a) => ({
          name: a.name,
          kind: MARK_KIND[a.name] ?? 'unclassified',
          pct: (a.area / pageArea) * 100,
        }))
        .sort((x, y) => x.pct - y.pct);

      /*
        **An unclassified mark fails rather than being skipped.** A new mark with
        no kind would otherwise pass the floor by not being subject to it, which
        is the vacuity shape this project keeps catching.
      */
      expect(
        shares.filter((s) => s.kind === 'unclassified').map((s) => s.name),
        'every mark has a kind',
      ).toEqual([]);

      /*
        The subject, asserted before the rule: the year field is the ANCHOR and
        exempt, so the floor needs at least one other base field mark to govern.
      */
      const governed = shares.filter(
        (s) => s.kind === 'baseField' && s.name !== 'releaseYearField',
      );
      expect(governed.length, `${which}: the floor has a subject`).toBeGreaterThan(0);

      const failing = governed.filter((s) => s.pct < FLOOR_PCT);
      expect(
        failing.map((f) => `${f.name} ${f.pct.toFixed(2)}%`),
        `${which}: base field marks below ${FLOOR_PCT}% — all: ${shares
          .map((s) => `${s.name}(${s.kind}) ${s.pct.toFixed(2)}%`)
          .join(', ')}`,
      ).toEqual([]);
    });
  }

  /**
   * §26: the construction is drawn at its fitted size inside the cell's 24px
   * margin, and every record's drawing lies inside its cell — the shared
   * frame was sized to the worst one, so nothing spills. Measured on all
   * three probe cases: the SVG sits 24 inside the still cell on every side,
   * and every drawn face and the disc sit inside the SVG's box.
   */
  for (const which of CASES) {
    test(`draws the construction inside the cell's 24px margin on the ${which} record`, async ({ page }) => {
      await login(page);
      await page.goto(`/wall/probe/page8a?case=${which}`);
      await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

      const fit = await page.evaluate(() => {
        const cell = document.querySelector('[data-cell="still"]');
        const svg = document.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
        if (cell === null || svg === null) return null;
        const c = cell.getBoundingClientRect();
        const s = svg.getBoundingClientRect();
        /* Each drawn element's box on screen, from its own geometry. */
        const drawn = Array.from(svg.querySelectorAll<SVGGraphicsElement>('polygon[data-face], circle[data-mark="disc"]')).map((el) => {
          const b = el.getBoundingClientRect();
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
        });
        return {
          margins: { left: s.left - c.left, top: s.top - c.top, right: c.right - s.right, bottom: c.bottom - s.bottom },
          svg: { left: s.left, right: s.right, top: s.top, bottom: s.bottom, width: s.width, height: s.height },
          drawn,
        };
      });
      expect(fit, 'the still renders').not.toBeNull();
      if (fit === null) return;

      const inner = 24;
      expect(fit.margins.left, 'left margin').toBeCloseTo(inner, 0);
      expect(fit.margins.top, 'top margin').toBeCloseTo(inner, 0);
      /* The right margin includes the cell's 1px rule. */
      expect(fit.margins.right, 'right margin').toBeGreaterThanOrEqual(inner);
      expect(fit.margins.bottom, 'bottom margin').toBeCloseTo(inner, 0);

      expect(fit.drawn.length, 'faces and a disc were measured').toBeGreaterThan(6);
      for (const box of fit.drawn) {
        expect(box.left, 'inside on the left').toBeGreaterThanOrEqual(fit.svg.left - 0.5);
        expect(box.right, 'inside on the right').toBeLessThanOrEqual(fit.svg.right + 0.5);
        expect(box.top, 'inside at the top').toBeGreaterThanOrEqual(fit.svg.top - 0.5);
        expect(box.bottom, 'inside at the bottom').toBeLessThanOrEqual(fit.svg.bottom + 0.5);
      }
    });
  }

  /**
   * §5.3: the no-cover record's fallback now covers all eight marks including
   * the construction, so the one coverless record has specified behaviour
   * rather than falling outside the rule its own principle demands.
   */
  test('draws every mark on a record with no cover', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/page8a?case=nocover');
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    /* Filled, not outlined, not omitted — omitting them would let a missing
       image change the composition's structure. */
    /* §28 withdraws the identity triangle; the rest of §5.3's fallback stands. */
    for (const mark of ['releaseYearField', 'sleeveBar', 'journalEdge']) {
      await expect(page.locator(`[data-mark="${mark}"]`), mark).toHaveCount(1);
    }

    const construction = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="construction-still"]');
      if (svg === null) return null;
      return {
        faces: svg.querySelectorAll('polygon[data-step="base"]').length,
        disc: svg.querySelectorAll('circle[data-mark="disc"]').length,
      };
    });

    expect(construction, 'the construction draws').not.toBeNull();
    expect(construction?.faces, 'its coloured faces fall back to ink, not away').toBeGreaterThan(0);
    expect(construction?.disc).toBe(1);
  });

  /**
   * §5.5: exactly two base marks per band, not a range. Both enumerations
   * already listed exactly two, so the earlier "at least one, at most two" is
   * gone.
   */
  test('carries exactly two base marks in each band', async ({ page }) => {
    await login(page);
    await page.goto('/wall/probe/page8a?case=richest');
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    const perBand = await page.evaluate(() => {
      const count = (band: string) => {
        const el = document.querySelector(`[data-band="${band}"]`);
        if (el === null) return -1;
        /*
          The construction is ONE base mark however many faces carry colour —
          one object seen from three sides, not five marks.
        */
        const marks = new Set<string>();
        for (const mark of el.querySelectorAll('[data-mark]')) {
          const name = mark.getAttribute('data-mark') ?? '';
          if (name === 'sleeveBlock') continue;
          if (name === 'disc' || name === 'constructionFaces') continue;
          marks.add(name);
        }
        if (el.querySelector('[data-testid="construction-still"]') !== null) {
          marks.add('construction');
        }
        return marks.size;
      };
      return { identity: count('identity'), record: count('record') };
    });

    /* Identity: the sleeve bar and the construction. */
    expect(perBand.identity, 'identity band base marks').toBeGreaterThanOrEqual(2);
    /* Record: the year field and the journal edge. */
    expect(perBand.record, 'record band base marks').toBeGreaterThanOrEqual(2);
  });

  /**
   * **The cost, stated rather than hidden by a passing test.** On the five
   * near-grey records the ladder's base step is a grey, so there is no base
   * mark carrying colour and the distribution rule has nothing to govern. It is
   * EMPTY on those records rather than violated — quiet, not faulty — and that
   * distinction is worth an assertion of its own.
   */
  test('says plainly when a record has no colour to distribute', async ({ page }) => {
    await login(page);
    /* The emptiest case ships #363129 — chroma 0.016, one of the five quiet. */
    await page.goto('/wall/probe/page8a?case=emptiest');
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

    const chroma = await page.evaluate(() => {
      const field = document.querySelector('[data-mark="releaseYearField"]');
      if (field === null) return null;
      const bg = getComputedStyle(field).backgroundColor;
      const [r, g, b] = bg.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
      /* Cheap chroma proxy: how far the channels spread. */
      return Math.max(r, g, b) - Math.min(r, g, b);
    });

    expect(chroma, 'a quiet record still draws its marks').not.toBeNull();
    /*
      The marks are DRAWN on a quiet record — §5.3's rule that omitting them
      would let a missing colour change the composition's structure. What is
      absent is the hue, not the mark.
    */
    await expect(page.locator('[data-mark="releaseYearField"]')).toHaveCount(1);
    await expect(page.locator('[data-mark="sleeveBar"]')).toHaveCount(1);
  });
});
