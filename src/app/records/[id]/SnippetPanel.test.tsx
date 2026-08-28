import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
/*
 * `SnippetPanel` calls `useRouter()`, which throws outside a Next request
 * context. The stub is legitimate here for one reason, stated at its definition:
 * `router.refresh()` is only ever called from `send()`, a handler this layer
 * cannot reach. It supplies a framework context, never a value under test.
 */
import '../../../../test/component/next-navigation';
import { SnippetPanel } from './SnippetPanel';

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
