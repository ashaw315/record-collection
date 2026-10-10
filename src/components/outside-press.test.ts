import { describe, expect, it } from 'vitest';
import { closeOnOutsidePress, type PressEvent } from './outside-press';

/** A document stub that keeps its listeners, so a test can send it events. */
function stubDocument() {
  const listeners = new Map<string, (event: PressEvent) => void>();
  const options = new Map<string, unknown>();
  return {
    doc: {
      addEventListener: (type: 'touchstart' | 'click', listener: (event: PressEvent) => void, opts?: unknown) => { listeners.set(type, listener); options.set(type, opts); },
      removeEventListener: (type: 'touchstart' | 'click') => { listeners.delete(type); },
    },
    send: (type: 'touchstart' | 'click', target: string, timeStamp: number) => {
      const event = { target, timeStamp, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
      listeners.get(type)?.(event);
      return event;
    },
    listeners,
    options,
  };
}

const inside = (node: unknown) => node === 'row';

describe('§T.3: a press outside the rows closes and does nothing else', () => {
  it('a click on a row is let through and closes nothing', () => {
    const { doc, send } = stubDocument();
    let closed = 0;
    closeOnOutsidePress(doc, inside, () => { closed += 1; });
    const click = send('click', 'row', 10);
    expect({ closed, stopped: click.stopped, prevented: click.prevented }).toEqual({ closed: 0, stopped: false, prevented: false });
  });

  it('a click anywhere else closes, and is stopped and cancelled so nothing else answers it', () => {
    const { doc, send } = stubDocument();
    let closed = 0;
    closeOnOutsidePress(doc, inside, () => { closed += 1; });
    const click = send('click', 'page', 10);
    expect({ closed, stopped: click.stopped, prevented: click.prevented }).toEqual({ closed: 1, stopped: true, prevented: true });
  });

  /* WebKit gives a finger's tap on the sheet's inset to the row beside it: the touch began on the paper, the click arrives on the row. */
  it('a finger that came down outside, whose click an engine handed to a row, still closes and chooses nothing', () => {
    const { doc, send } = stubDocument();
    let closed = 0;
    closeOnOutsidePress(doc, inside, () => { closed += 1; });
    send('touchstart', 'paper', 100);
    const click = send('click', 'row', 180);
    expect({ closed, stopped: click.stopped, prevented: click.prevented }).toEqual({ closed: 1, stopped: true, prevented: true });
  });

  it('a finger that came down on a row chooses it', () => {
    const { doc, send } = stubDocument();
    let closed = 0;
    closeOnOutsidePress(doc, inside, () => { closed += 1; });
    send('touchstart', 'row', 100);
    expect(send('click', 'row', 180).stopped).toBe(false);
    expect(closed).toBe(0);
  });

  it('a touch is spent by its click, and a stale one is not believed: a later mouse click on a row is the row’s', () => {
    const { doc, send } = stubDocument();
    let closed = 0;
    closeOnOutsidePress(doc, inside, () => { closed += 1; });
    send('touchstart', 'paper', 100);
    send('click', 'row', 180);
    expect(send('click', 'row', 400).stopped, 'spent').toBe(false);
    send('touchstart', 'paper', 1_000);
    expect(send('click', 'row', 5_000).stopped, 'stale: a drag that never clicked, then a mouse').toBe(false);
    expect(closed).toBe(1);
  });

  it('listens in the capture phase, before anything on the page, and lets go of both listeners', () => {
    const { doc, listeners, options } = stubDocument();
    const release = closeOnOutsidePress(doc, inside, () => undefined);
    expect(options.get('click')).toMatchObject({ capture: true });
    expect([...listeners.keys()].sort()).toEqual(['click', 'touchstart']);
    release();
    expect(listeners.size).toBe(0);
  });
});
