import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PickControl } from './PickControl';
import { CONTROL_LABEL, LABEL_TYPE } from './records/[id]/grid-type';
import { MOODS } from '@/lib/moods/moods';

/** §P.5's "label colour": the LABEL class's ink, as a class token. */
const LABEL_COLOUR = 'text-[oklch(0.44_0.008_70)]';

/**
 * Target §P.5, Phase 0 (step 156): "The control is the eight moods, then ASK
 * and SURPRISE ME, then the reserved slot." The moods and ASK are not built
 * yet, so the control is SURPRISE ME and the slot. This is the permanent
 * control, not §P.6's nothing-tagged form, so nothing here reads the tags.
 */
/* Step 156 unit 3b gave the control its pool (§P.2); these assertions are of the first render and read none of it. */
const POOL = [{ id: '00000000-0000-4000-8000-000000000001', title: 'Gaucho', artist: 'Steely Dan', cover: null, moods: ['smooth'] }];
const html = renderToStaticMarkup(<PickControl pool={POOL} />);

describe('the pick control (§P.5)', () => {
  it('is SURPRISE ME as a §9.3 label, a button that submits nothing', () => {
    const button = /<button[^>]*>Surprise me<\/button>/.exec(html)?.[0] ?? '';
    expect(button).toContain('type="button"');
    for (const cls of CONTROL_LABEL.split(' ')) expect(button, cls).toContain(cls);
  });

  /* §T.6's reserved slot: there before anything is asked, so an answer's message moves nothing beneath it. */
  it('follows SURPRISE ME with an empty status slot that reserves one line', () => {
    const slot = /<p[^>]*data-pick-slot=""[^>]*><\/p>/.exec(html)?.[0] ?? '';
    expect(slot).toContain('role="status"');
    expect(slot).toContain('min-h-[1lh]');
    expect(html.indexOf('Surprise me')).toBeLessThan(html.indexOf('data-pick-slot'));
  });

  /* §P.6: "The slot's messages are written to fit it", rewritten rather than cut, so nothing clamps them. */
  it('does not clip the slot, since a message that does not fit is rewritten rather than cut', () => {
    const slot = /<p[^>]*data-pick-slot=""[^>]*>/.exec(html)?.[0] ?? '';
    expect(slot).not.toMatch(/line-clamp|truncate|overflow-hidden/);
  });

  /* §P.4: the answer is drawn when the reader asks, never before. Fails against a control that draws its pool's first record on arrival. */
  it('draws no answer before anything is asked, in either host', () => {
    expect(html).not.toContain('data-pick-answer');
    expect(renderToStaticMarkup(<PickControl pool={POOL} answers="wall" />)).not.toContain('data-pick-answer');
  });
});

/*
  Step 157 (§P.5): "The control is the eight moods, then ASK and SURPRISE ME,
  then the reserved slot, in that order in every host. The moods are one list
  in code, so the control draws whatever that list holds, in its order." "A
  mood is set in the label type, in the label colour when clear and in ink
  when selected, with no bar, underline or box." "ASK is inert while no mood
  is selected." ASK and SURPRISE ME are §9.3 labels.
*/
describe('the moods and ASK (§P.5, step 157)', () => {
  const moodButtons = [...html.matchAll(/<button[^>]*data-mood="([^"]*)"[^>]*>/g)];

  it('draws the eight moods from code’s list, in its order, each a toggle that is clear on arrival', () => {
    expect(moodButtons.map((m) => m[1])).toEqual([...MOODS]);
    for (const [tag] of moodButtons) {
      expect(tag).toContain('type="button"');
      expect(tag).toContain('aria-pressed="false"');
    }
  });

  it('sets a clear mood in the label type and the label colour, with no bar, underline or box', () => {
    for (const [tag] of moodButtons) {
      for (const cls of LABEL_TYPE.split(' ')) expect(tag, cls).toContain(cls);
      expect(tag).toContain(LABEL_COLOUR);
      expect(tag).not.toMatch(/underline|border|data-set-bar/);
    }
  });

  it('puts the moods first, then ASK, then SURPRISE ME, then the slot', () => {
    const positions = [html.indexOf('data-mood='), html.indexOf('>Ask<'), html.indexOf('>Surprise me<'), html.indexOf('data-pick-slot')];
    expect(positions.every((p) => p >= 0), `all four found: ${positions.join(', ')}`).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  /* The first version asserted `disabled`, a mechanism §P.6's "ASK stays a Tab stop while it is inert" forbids: `disabled` leaves the tab order. Changed with the ruling, not to pass code. */
  it('draws ASK as a §9.3 label, inert while no mood is selected and still a Tab stop: aria-disabled, never disabled', () => {
    const ask = /<button[^>]*>Ask<\/button>/.exec(html)?.[0] ?? '';
    expect(ask).toContain('type="button"');
    expect(ask, 'named unavailable').toContain('aria-disabled="true"');
    expect(ask, 'and in the tab order').not.toMatch(/\sdisabled(=""|\s|>)/);
    for (const cls of CONTROL_LABEL.split(' ')) expect(ask, cls).toContain(cls);
  });
});

/*
  §P.5 (27 Oct): "In the rail the moods take the rail's own label pitch, as §W
  sets it for SHELF, TABLE and GRID, and not §T.6's 44… On the table and the
  grid the control stands with the filters, and there it takes their 44." The
  rail's pitch is a mechanism, not a figure: a column of labels at their
  type's line, 18 apart (WallRail's view list). §P.6: "ASK while inert is
  named as unavailable in the same way, with the reason as its description:
  choose a mood first."
*/
describe('the moods’ pitch by host, and ASK’s reason (§P.5, §P.6)', () => {
  const rail = renderToStaticMarkup(<PickControl pool={POOL} answers="wall" />);
  const moodTags = (h: string) => [...h.matchAll(/<button[^>]*data-mood="[^"]*"[^>]*>/g)].map((m) => m[0]);
  const list = (h: string) => /<ul[^>]*data-moods=""[^>]*>/.exec(h)?.[0] ?? '';

  it('in the rail, a mood stands at its type’s line in a column 18 apart, with no 44', () => {
    expect(list(rail)).toContain('gap-[18px]');
    expect(list(rail)).toContain('flex-col');
    for (const tag of moodTags(rail)) expect(tag).not.toContain('h-[44px]');
  });

  it('on the table and the grid, a mood takes the filters’ 44', () => {
    for (const tag of moodTags(html)) expect(tag).toContain('h-[44px]');
    expect(list(html)).not.toContain('flex-col');
  });

  it('names an inert ASK unavailable with its reason as its description, and an ASK with a mood selected with none', () => {
    const ask = /<button[^>]*>Ask<\/button>/.exec(html)?.[0] ?? '';
    const id = /aria-describedby="([^"]+)"/.exec(ask)?.[1];
    expect(id, 'the inert ASK points at its reason').toBeDefined();
    expect(new RegExp(`<[^>]*id="${id}"[^>]*>Choose a mood first\\.<`).test(html), 'the reason, as text the control carries').toBe(true);
  });
});

/* §P.5 (27 Oct): "In the rail they take §W's one pitch with the moods, so SURPRISE ME on a 44 line is a defect." The 44 is the filters' on the table and the grid, where the control stands with them. */
describe('ASK and SURPRISE ME on the rail’s pitch (§P.5)', () => {
  const rail = renderToStaticMarkup(<PickControl pool={POOL} answers="wall" />);
  it('in the rail, neither ASK nor SURPRISE ME carries a 44 line', () => {
    for (const name of ['Ask', 'Surprise me']) {
      const tag = new RegExp(`<button[^>]*>${name}<\\/button>`).exec(rail)?.[0] ?? '';
      expect(tag, `${name} found`).not.toBe('');
      expect(tag, `${name} in the rail`).not.toContain('h-[44px]');
    }
  });
  it('on the table and the grid, both keep the §9.3 label’s 44', () => {
    for (const name of ['Ask', 'Surprise me']) expect(new RegExp(`<button[^>]*>${name}<\\/button>`).exec(html)?.[0] ?? '', name).toContain('h-[44px]');
  });
});
