import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PickControl } from './PickControl';
import { CONTROL_LABEL, LABEL, LABEL_TYPE } from './records/[id]/grid-type';

/** §P.5's "label colour": the LABEL class's ink, as a class token. */
const LABEL_COLOUR = 'text-[oklch(0.44_0.008_70)]';

/**
 * **Q22's control, step 178 (§P.2, §P.4, §P.5, §P.6; Design's "Ask field", "the rest of the moods" and "Under A- the
 * meantime pair- Phase 0", 10 and 11 Nov).** "The control is the ask field, then ASK and SURPRISE ME, then the slot."
 * The moods retire. "ASK is inert while the field is empty; it stays a Tab stop, named unavailable, and takes ink once
 * the field holds text." The line beneath counts the records with no ABOUT, absent when every record has one. These
 * are the first render's facts, read from the markup; what an ask does is the e2e's. Each case fails against the
 * control before this step: the moods drawn, ASK's reason "Choose a mood first.", the untagged line's words.
 */
const POOL = [{ id: '00000000-0000-4000-8000-000000000001', title: 'Gaucho', artist: 'Steely Dan', cover: null }];
const html = renderToStaticMarkup(<PickControl pool={POOL} />);
const rail = renderToStaticMarkup(<PickControl pool={POOL} answers="wall" />);

const field = (h: string) => /<(?:input|textarea)[^>]*data-ask-field=""[^>]*>/.exec(h)?.[0] ?? '';
const ask = (h: string) => /<button[^>]*>Ask<\/button>/.exec(h)?.[0] ?? '';
/* The ASK button's place, not the field's label, which reads Ask as SEARCH's reads Search. */
const askAt = (h: string) => h.search(/<button[^>]*>Ask<\/button>/);

describe('the control’s parts and order (§P.5)', () => {
  it('is the ask field, then ASK, then SURPRISE ME, then the slot, and no moods', () => {
    const positions = [html.indexOf('data-ask-field'), askAt(html), html.indexOf('>Surprise me<'), html.indexOf('data-pick-slot')];
    expect(positions.every((p) => p >= 0), `all four found: ${positions.join(', ')}`).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).not.toContain('data-mood');
    expect(html).not.toContain('Choose a mood first');
  });

  /* §P.5: "The field isn't the search field": a text field of its own, under a §9.3 label, not a search form. "The ask field’s label says what goes in it, never ASK, which is the button’s name": WHAT TO PLAY, Proposed (Design, 12 Nov; step 182). */
  it('draws the field as §9.3’s field with a label of its own, WHAT TO PLAY, separate from SEARCH', () => {
    const f = field(html);
    expect(f).not.toContain('name="q"');
    const id = /\sid="([^"]+)"/.exec(f)?.[1];
    expect(id, 'the field has an id its label points at').toBeDefined();
    const label = new RegExp(`<label[^>]*for="${id}"[^>]*>([^<]*)<`).exec(html);
    expect(label?.[1], 'the label says what goes in it, never ASK').toBe('What to play');
    for (const cls of LABEL.split(' ')) expect(label?.[0] ?? '', cls).toContain(cls);
    expect(html).not.toMatch(/<form[^>]*role="search"/);
  });

  /*
    §P.5 (Design's "Ask field wraps and count line", 13 Nov): "The ask field takes the host’s width and as many lines as
    the phrase needs", "one line at rest when empty". An <input> holds one line and scrolls (P.5/width-only withdrawn),
    so the field is a textarea at one row. Fails against the input it was.
  */
  it('is a field that can hold lines: a textarea resting at one row, with no cap on its rows', () => {
    const f = field(html);
    expect(f, 'a textarea').toMatch(/^<textarea/);
    expect(f, 'one row at rest').toContain('rows="1"');
    expect(f, 'no cap').not.toMatch(/max-h-|maxlength|line-clamp|overflow-x/);
    expect(field(rail), 'the rail’s too').toMatch(/^<textarea[^>]*rows="1"/);
  });

  /* §T.6's reserved slot: there before anything is asked, so an answer's message moves nothing beneath it. */
  it('follows SURPRISE ME with an empty status slot that reserves one line, and clips nothing', () => {
    const slot = /<p[^>]*data-pick-slot=""[^>]*><\/p>/.exec(html)?.[0] ?? '';
    expect(slot).toContain('role="status"');
    expect(slot).toContain('min-h-[1lh]');
    expect(slot).not.toMatch(/line-clamp|truncate|overflow-hidden/);
  });

  /* §P.4: the covers are drawn when the reader asks, never before. */
  it('draws no answer before anything is asked, in either host', () => {
    expect(html).not.toContain('data-pick-answer');
    expect(rail).not.toContain('data-pick-answer');
  });
});

describe('ASK inert on an empty field (§P.6)', () => {
  it('is a §9.3 label, aria-disabled and never disabled, in the label colour, with "write what you want first" as its description', () => {
    const a = ask(html);
    expect(a).toContain('type="button"');
    expect(a, 'named unavailable').toContain('aria-disabled="true"');
    expect(a, 'and in the tab order').not.toMatch(/\sdisabled(=""|\s|>)/);
    expect(a, 'in the label colour while inert').toContain(LABEL_COLOUR);
    for (const cls of CONTROL_LABEL.split(' ')) expect(a, cls).toContain(cls);
    const id = /aria-describedby="([^"]+)"/.exec(a)?.[1];
    expect(id, 'the inert ASK points at its reason').toBeDefined();
    expect(new RegExp(`<[^>]*id="${id}"[^>]*>write what you want first<`).test(html), 'the reason, as text the control carries').toBe(true);
  });

  it('keeps SURPRISE ME in ink, since it can always act', () => {
    const surprise = /<button[^>]*>Surprise me<\/button>/.exec(html)?.[0] ?? '';
    expect(surprise).not.toContain(LABEL_COLOUR);
    expect(surprise).not.toContain('aria-disabled');
  });
});

/*
  §P.5 (27 Oct, reworded 11 Nov): in the rail the control's lines take the rail's one pitch, not §T.6's 44; on the
  table and the grid the control stands with the filters and takes their 44.
*/
describe('the pitch by host (§P.5)', () => {
  it('in the rail, ASK and SURPRISE ME carry no 44 line; on the table and the grid they keep the label’s 44', () => {
    for (const name of ['Ask', 'Surprise me']) {
      const inRail = new RegExp(`<button[^>]*>${name}<\\/button>`).exec(rail)?.[0] ?? '';
      expect(inRail, `${name} in the rail`).not.toContain('h-[44px]');
      for (const cls of LABEL_TYPE.split(' ')) expect(inRail, cls).toContain(cls);
      expect(new RegExp(`<button[^>]*>${name}<\\/button>`).exec(html)?.[0] ?? '', `${name} on the table`).toContain('h-[44px]');
    }
  });
});

/*
  §P.6 (11 Nov): "the line counting records with no ABOUT, absent when every record has one", a fact about the whole
  collection handed to the control by the page, and drawn on load so it moves nothing; its wording "4 without an About
  yet." is Proposed (the Provisionals line).
*/
describe('the count line (§P.6)', () => {
  /* Reworded by Design ("Ask field captures read", 12 Nov; step 182): "N have no About.", since the first wording took two lines at the rail's width. */
  /* "The count line stands beneath the slot" (13 Nov; `P.6/slots-count-line`): it was drawn between the field and ASK, the defect the ask-overflow specimen showed in the rail and the sidebar. Fails against that order. */
  it('draws "N have no About." beneath the slot, in either host, while any record has none, and not otherwise', () => {
    const withLine = renderToStaticMarkup(<PickControl pool={POOL} withoutAbout={4} />);
    const line = /<p[^>]*data-without-about=""[^>]*>(?:<span[^>]*>)?([^<]*)/.exec(withLine);
    expect(line?.[1]).toBe('4 have no About.');
    expect(withLine.indexOf('data-without-about'), 'beneath the slot').toBeGreaterThan(withLine.indexOf('data-pick-slot'));
    const railLine = renderToStaticMarkup(<PickControl pool={POOL} answers="wall" withoutAbout={4} />);
    expect(railLine.indexOf('data-without-about'), 'beneath the slot in the rail').toBeGreaterThan(railLine.indexOf('data-pick-slot'));
    expect(renderToStaticMarkup(<PickControl pool={POOL} withoutAbout={0} />)).not.toContain('data-without-about');
    expect(html, 'absent by default').not.toContain('data-without-about');
  });
});
