import { describe, expect, it } from 'vitest';
import { availableFaces, nextFace, type Face } from './faces';

/**
 * §10b's three states, as a state machine.
 *
 * "Front → turn → back is rotation; front → open → inner spread is a hinge."
 * Two different gestures, because they are two different physical acts — and
 * the hinge exists only where an inner image has been photographed.
 *
 * Pure because the transitions are the decision. A component test would drive
 * clicks and confirm whatever the component did, without stating what should
 * happen.
 */

const twoSided = { backUrl: null, gatefoldUrl: null };
const withGatefold = { backUrl: null, gatefoldUrl: 'https://blob.example/inner.jpg' };

describe('availableFaces', () => {
  it('gives every record a front and a back', () => {
    /**
     * §10b: "the back face is never empty … every record is a two-sided object
     * from the day it is entered." A record with no photographs at all still
     * turns over — the back composes from stored fields.
     */
    expect(availableFaces(twoSided)).toEqual(['front', 'back']);
  });

  it('adds the gatefold ONLY when an inner image exists', () => {
    /**
     * The affordance IS the image. §10b: "there is no generated stand-in: the
     * point of a gatefold is the artwork inside it, and a panel of pressing
     * details folded open where a photograph should be would be inventing the
     * thing the user came to see."
     */
    expect(availableFaces(withGatefold)).toEqual(['front', 'back', 'gatefold']);
  });

  it('does not add a gatefold for a record that merely has a back photograph', () => {
    // A photographed back is not an inner spread. The two are different images
    // of different surfaces, and only one of them folds.
    expect(availableFaces({ backUrl: 'https://blob.example/back.jpg', gatefoldUrl: null })).toEqual([
      'front',
      'back',
    ]);
  });
});

describe('nextFace — turning is a rotation', () => {
  it('turns front to back', () => {
    expect(nextFace('front', 'turn', twoSided)).toBe('back');
  });

  it('turns back to front, so a second click puts it away', () => {
    // §10b: "click again puts it back." Turning is symmetric, as it is with the
    // physical object.
    expect(nextFace('back', 'turn', twoSided)).toBe('front');
  });

  it('turns an OPEN gatefold back to the front, not to the back', () => {
    /**
     * The discriminating case. A gatefold is open in the reader's hands; the
     * natural closing motion returns it to the front, not to a face they never
     * turned it to. Cycling front → back → gatefold → front would make one
     * gesture do two jobs.
     */
    expect(nextFace('gatefold', 'turn', withGatefold)).toBe('front');
  });
});

describe('nextFace — opening is a hinge', () => {
  it('opens the front into the inner spread', () => {
    expect(nextFace('front', 'open', withGatefold)).toBe('gatefold');
  });

  it('closes an open gatefold back to the front', () => {
    // The same hinge, reversed. Opening and closing are one gesture.
    expect(nextFace('gatefold', 'open', withGatefold)).toBe('front');
  });

  it('refuses to open a record with no inner image', () => {
    /**
     * Belt and braces: the affordance is not rendered without a gatefold image,
     * so this should be unreachable from the UI — but a state machine that
     * would enter a face with nothing to show is one refactor away from
     * rendering a blank panel where §10b promises artwork.
     */
    expect(nextFace('front', 'open', twoSided)).toBe('front');
  });

  it('opens from the BACK as well, since the sleeve is still a gatefold', () => {
    // A record turned over is still a fold-out. Requiring the reader to turn it
    // front-side up before opening would be a rule about the software, not
    // about the object.
    expect(nextFace('back', 'open', withGatefold)).toBe('gatefold');
  });
});

describe('nextFace — closing', () => {
  it('returns any face to the front', () => {
    // Escape, or the close control: one way out from anywhere.
    for (const face of ['front', 'back', 'gatefold'] as Face[]) {
      expect(nextFace(face, 'close', withGatefold)).toBe('front');
    }
  });
});
