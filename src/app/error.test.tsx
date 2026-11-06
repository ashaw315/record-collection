// @vitest-environment jsdom
import { act, Component, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorScreen from './error';

/* The header reads Next's router (usePathname), which no unit render provides; it is not what this file tests. */
vi.mock('@/components/AppHeader', () => ({ AppHeader: () => <header data-app-nav="" /> }));

/**
 * **The probe's two arms, each asserted here because CI reaches only one
 * (the coordinator, 6 Nov).** `error.tsx` rethrows to `global-error.tsx`
 * while the probe's second cookie and the layout's `data-e2e-probes` say so.
 * It throws in the render where the gate already reads true, and from the
 * effect where it did not: both servers answer the probe's failure with a
 * bare `__next_error__` shell, so in the screen's first render the layout's
 * attribute is not on the document yet, and React commits it with the root,
 * before the passive effects run. The gate now runs against a build, which
 * takes the effect arm every time; the render arm is the dev server's and
 * went dark in CI the day the switch landed. A branch whose arms are reachable
 * only under different servers is asserted one arm at a time, by the order
 * React gives them: a server render runs no effect, so it isolates the render
 * arm; a layout effect runs in the commit before a passive effect, so a
 * wrapper that writes the attribute there isolates the effect arm.
 *
 * jsdom for this file alone (the docblock above): every other unit test
 * stays in node, where a DOM it does not need cannot change its behaviour.
 */

const error = Object.assign(new Error('the error probe, throwing as asked'), { digest: 'test' });
const retry = () => undefined;

class Catcher extends Component<{ children: ReactNode; onCatch: (e: unknown) => void }, { caught: boolean }> {
  state = { caught: false };
  static getDerivedStateFromError() { return { caught: true }; }
  componentDidCatch(e: unknown) { this.props.onCatch(e); }
  render() { return this.state.caught ? <p data-caught="" /> : this.props.children; }
}

/* The commit order of the real root: the attribute lands on `<html>` in the commit, before the passive effects run. */
function AttributeLandsInCommit({ children }: { children: ReactNode }) {
  useLayoutEffect(() => { document.documentElement.dataset.e2eProbes = '1'; }, []);
  return <>{children}</>;
}

const cookie = (on: boolean) => { document.cookie = on ? 'error-probe-global=1' : 'error-probe-global=; expires=Thu, 01 Jan 1970 00:00:00 GMT'; };

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  delete document.documentElement.dataset.e2eProbes;
  cookie(false);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  delete document.documentElement.dataset.e2eProbes;
  cookie(false);
});

function mount(ui: ReactNode): { caught: unknown[] } {
  const caught: unknown[] = [];
  const el = container;
  if (el === undefined) throw new Error('no container');
  act(() => {
    root = createRoot(el, { onCaughtError: () => undefined });
    root.render(<Catcher onCatch={(e) => caught.push(e)}>{ui}</Catcher>);
  });
  return { caught };
}

describe('error.tsx rethrows to the bare fallback for the probe, by two arms', () => {
  /* Fails against the render arm removed: a server render runs no effect, so only a throw in render can reach this. */
  it('the render arm: with the attribute and the cookie already on the document, the render itself throws the error', () => {
    document.documentElement.dataset.e2eProbes = '1';
    cookie(true);
    expect(() => renderToString(<ErrorScreen error={error} retry={retry} />)).toThrow(error);
  });

  /* Fails against the effect arm removed: at render the attribute is absent, so the render arm is silent, and the throw can only come from the effect that runs after the commit that wrote the attribute. */
  it('the effect arm: with the attribute arriving in the commit, the screen renders and then throws the error from its effect', () => {
    cookie(true);
    const { caught } = mount(<AttributeLandsInCommit><ErrorScreen error={error} retry={retry} /></AttributeLandsInCommit>);
    expect(caught, 'the boundary above caught the rethrown error').toEqual([error]);
    expect(container?.querySelector('[data-caught]'), 'and drew its fallback in the screen’s place').not.toBeNull();
  });

  /* Fails against a branch that reads the cookie alone (production has no attribute) or the attribute alone (a reader without the probe's cookie). */
  it('neither arm fires without both the attribute and the cookie: the screen stays, with its heading', () => {
    cookie(true);
    const withCookieOnly = mount(<ErrorScreen error={error} retry={retry} />);
    expect(withCookieOnly.caught).toEqual([]);
    expect(container?.querySelector('h1')?.textContent).toBe('Something went wrong.');
    act(() => root?.unmount());
    cookie(false);
    const withAttributeOnly = mount(<AttributeLandsInCommit><ErrorScreen error={error} retry={retry} /></AttributeLandsInCommit>);
    expect(withAttributeOnly.caught).toEqual([]);
    expect(document.documentElement.dataset.e2eProbes, 'the precondition: the attribute did land').toBe('1');
  });
});
