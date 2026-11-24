import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PickWorking } from './PickWorking';

/**
 * **§P.3's indicator ("Indicator any length", 23 Nov):** "a motion that reads as work however long it runs. Nothing in it
 * ends, slows or repeats on a cycle a reader could count, and it carries no estimate of the time left. Past the first few
 * seconds, words join the motion in the slot." The motion is still under reduced motion, and the words are drawn from
 * the press there. Fails against a motion with a count or an end (a finite iteration, a percentage), words drawn before
 * the threshold, and words missing under reduced motion.
 */
describe('PickWorking', () => {
  it('draws the motion, running without end, and no words before the threshold', () => {
    const html = renderToStaticMarkup(<PickWorking words={false} />);
    expect(html).toMatch(/data-pick-working=""/);
    expect(html).toMatch(/<span[^>]*data-pick-working-motion=""[^>]*class="[^"]*animate-\[pick-work_[^"]*infinite/);
    expect(html, 'reduced motion stills it').toMatch(/data-pick-working-motion=""[^>]*class="[^"]*motion-reduce:animate-none/);
    expect(html).not.toContain('data-pick-working-words');
    expect(html).not.toMatch(/\d+%|remaining|left/);
  });

  it('draws the words beside the motion past the threshold, the motion carrying on', () => {
    const html = renderToStaticMarkup(<PickWorking words />);
    expect(html).toMatch(/data-pick-working-motion=""/);
    expect(html).toMatch(/<span[^>]*data-pick-working-words=""[^>]*>Reading your records…<\/span>/);
  });
});
