import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
/*
 * `SnippetPanel` calls `useRouter()`, which throws outside a Next request
 * context. The stub is legitimate here for one reason, stated at its definition:
 * `router.refresh()` is only ever called from `send()`, a handler this layer
 * cannot reach. It supplies a framework context, never a value under test.
 */
import '../../../../test/component/next-navigation';
import { AboutBudget, SnippetPanel } from './SnippetPanel';

/**
 * SPEC.md §11 (component layer, A46) — §10b's snippet panel, CONFIGURED.
 *
 * **What was uncovered, and why it was uncovered.** `snippet.spec.ts` says so in
 * its own words: the regenerate control needs `ANTHROPIC_API_KEY`, `.env.test`
 * deliberately has none, "so the button that raises A31a's dialog does not
 * render here, and a spec clicking it waits 30s for a locator that will never
 * appear". That spec covers the UNCONFIGURED state, which the environment
 * genuinely has.
 *
 * **So the configured branch of this component had no test at any layer.** The
 * decisions behind it do — `snippet-view.test.ts` pins WHEN the confirmation
 * fires and WHAT it says, `record-snippet-post.test.ts` pins the server's
 * refusal. What nothing checked is that the COMPONENT renders those decisions:
 * that the control appears when configured, and that the attribution label
 * follows `labelAsGenerated` rather than being hard-coded.
 *
 * **This does not re-test the view model.** It asserts the wiring between a
 * decision already tested and the markup that carries it — the seam neither
 * layer could see.
 */

const BASE = {
  recordId: '11111111-1111-4111-8111-111111111111',
    base: null,
    ladder: null,
  snippetEditedAt: null,
};

const render = (props: Parameters<typeof SnippetPanel>[0]) =>
  renderToStaticMarkup(<SnippetPanel {...props} />);

describe('the snippet control, on a deployment that HAS the credential', () => {
  /**
   * The branch no browser test can reach. Fails against a component that
   * renders the unconfigured message regardless, or drops the control.
   */
  it('offers the generate control rather than the unconfigured message', () => {
    const html = render({ ...BASE, snippet: null, configured: true });

    expect(html).toContain('snippet-generate');
    expect(html, 'the deployment is configured').not.toContain('snippet-unconfigured');
  });

  /**
   * §10b: "Absence is fine. A record with no snippet shows none, and no
   * placeholder invites one." Fails against a placeholder that nags.
   */
  it('states the absence of a note without inviting one', () => {
    const html = render({ ...BASE, snippet: null, configured: true });

    expect(html).toContain('snippet-absent');
    expect(html).not.toContain('snippet-text');
  });
});

/**
 * **§10b's labelling rule, asserted where it is RENDERED.**
 *
 * Once the user has edited the text it is THEIRS, and calling it generated would
 * misattribute their writing to the model — the same error as presenting the
 * model's writing as fact, in the other direction.
 *
 * `snippet-view.test.ts` decides `labelAsGenerated`; these two assert the
 * component honours it in both directions. A single-direction test would pass
 * against a hard-coded label.
 */
describe('attribution follows the view model in BOTH directions', () => {
  it('labels an unedited snippet as generated', () => {
    const html = render({
      ...BASE,
      snippet: 'A dubby, cavernous record.',
      snippetEditedAt: null,
      configured: true,
    });

    expect(html).toContain('snippet-generated-label');
    expect(html).toContain('Written by Claude');
    expect(html, 'not the user’s own').not.toContain('snippet-yours');
  });

  it('labels an edited snippet as the user’s own', () => {
    const html = render({
      ...BASE,
      snippet: 'A dubby, cavernous record.',
      snippetEditedAt: new Date(),
      configured: true,
    });

    expect(html).toContain('snippet-yours');
    expect(html).toContain('Your own note.');
    expect(html, 'the user’s writing is not attributed to Claude').not.toContain(
      'snippet-generated-label',
    );
  });
});

/**
 * The unconfigured state, which `snippet.spec.ts` also covers in a browser.
 *
 * **Kept deliberately, and it does not replace that spec.** The two states are
 * one decision — "named when unconfigured, never silently absent" — and a layer
 * that could see only the configured half would report half a decision.
 */
describe('the unconfigured deployment', () => {
  it('names the missing capability rather than hiding the control', () => {
    const html = render({ ...BASE, snippet: null, configured: false });

    expect(html).toContain('snippet-unconfigured');
    expect(html).toContain('not configured');
    expect(html, 'and offers nothing that would do nothing').not.toContain('snippet-generate');
  });
});

/**
 * **The seam: this panel's heading joined the grid's vocabulary.**
 *
 * It was `font-heading text-title uppercase` — sans, 15px — while the grid
 * above sets every label in mono at 11px. Two typographic systems on one screen
 * is most of why the page read as incoherent, and §4 forbids 15px outright:
 * "Nothing at 15 anywhere on the screen."
 *
 * Checked rather than assumed, because this is the one converted heading inside
 * a CLIENT component with interactive state — the other four are server
 * components where a className swap cannot do anything else.
 *
 * **The heading now comes from §9.1's `Section`**, which renders the label in
 * the rail. The assertions below still hold and still matter: they check the
 * treatment reaching the rendered markup, and the section title surviving the
 * move into the primitive. What they no longer pin is a className in THIS
 * file — which is the point of a shared definition.
 */
describe('the heading uses the shared label treatment', () => {
  const render = () =>
    renderToStaticMarkup(
      <SnippetPanel
        recordId="r1"
        snippet="A note."
        snippetEditedAt={null}
        configured
        base={null}
        ladder={null}
      />,
    );

  it('is mono, uppercase and 11px rather than 15px sans', () => {
    const html = render();

    expect(html).toMatch(/text-label/);
    expect(html).toMatch(/font-mono/);
    expect(html, '§4: nothing at 15px on this screen').not.toMatch(/text-title/);
    expect(html, 'the sans heading face is gone').not.toMatch(/font-heading/);
  });

  /*
    **§33 dropped the text from this row, and this test followed.** It
    asserted the About's text rendered here beside the controls; §33: "The
    lower About row keeps its controls and drops its text: it is the About's
    editor... an editor does not need to repeat what the frame shows." The
    label and the controls are what survive.
  */
  it('keeps its label and controls, and repeats an About the frame holds whole nowhere (§33, §36)', () => {
    const html = render();

    expect(html).toContain('About this record');
    /* §36: the row carries the full text only when the frame clamps it; 'A note.' fits, so it is read in the frame and not here. */
    expect(html, 'the About is read in the frame, not here').not.toContain('A note.');
    expect(html, 'the text testid is gone with the text').not.toContain('snippet-text');
    expect(html).toMatch(/<button/);
    expect(html, 'the editor control stays').toContain('snippet-edit');
  });
});

/**
 * §34: "535 is a writing guide, not a limit: a text over it can still fit,
 * and Gaucho's 555 does. So the editor reports whether the text clamps in
 * the rendered cell, not whether it exceeds 535; it never says 'over' on a
 * text that fits."
 */
describe('the editor’s budget line (§34)', () => {
  it('states the guide and never says “over”', () => {
    const html = renderToStaticMarkup(<AboutBudget text={'a'.repeat(555)} />);
    expect(html).toContain('555 of about 535 characters');
    expect(html, 'no “over” -- the guide is not a limit').not.toMatch(/\bover\b/);
  });
});

/**
 * §36: "when the frame clamps the About, the row carries the full text above
 * the by-line, Edit and Delete; when the About fits, the row carries only
 * those. The full text appears twice only on a record whose frame cuts it."
 * On the server the frame's clamp is the budget guess, as AboutCell's is;
 * the client measures.
 */
describe('§36: the row carries the full text only when the frame clamps it', () => {
  const props = { recordId: 'r1', snippetEditedAt: null, configured: true, base: null, ladder: null };
  it('shows the full text above the by-line for an About past the budget', () => {
    const text = 'A sentence about the record that goes on. '.repeat(20).trim();
    const html = renderToStaticMarkup(<SnippetPanel {...props} snippet={text} />);
    const full = html.indexOf('data-testid="snippet-full"');
    expect(full, 'the full reading').toBeGreaterThan(-1);
    expect(html.slice(full)).toContain('A sentence about the record that goes on.');
    expect(full, 'above the by-line').toBeLessThan(html.indexOf('data-testid="snippet-generated-label"'));
  });
  it('shows only the by-line and controls for an About that fits', () => {
    const html = renderToStaticMarkup(<SnippetPanel {...props} snippet="Short and it fits." />);
    expect(html).not.toContain('snippet-full');
    expect(html).toContain('snippet-edit');
  });
});
