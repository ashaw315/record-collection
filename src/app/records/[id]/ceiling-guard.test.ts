import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CEILING_ENVELOPE, aspectOfScene } from './ceiling';
import { EXHAUSTED_ID, HASH_ADVANCE_CAP, arrangementAt, construction, constructionWithin } from './construction';

/**
 * **§46's guard (step 54): an arrangement whose aspect would leave more than
 * one upper cell of empty width at any width is illegal, and the hash
 * advances to the next, as §22 advances when no form carries the colour.**
 *
 * One loop over one hash, each arrangement tested against both guards, one
 * cap counting every advance. The fixtures are ids the seeded sweep rejected
 * (29 Sep): their first arrangement is below the envelope and their first
 * salted re-hash is inside it. Each test names the branch it fails against.
 */
const rows = JSON.parse(readFileSync('docs/captures/real-records.json', 'utf8')) as Array<{ id: string; title: string }>;
const REJECTED = ['03e53036-b4df-4bf4-9aed-2e57a9b6a5f6', '9742c43b-8bca-4241-9cbe-8af59189680b', '2eea64c0-cdbc-440f-bd53-df145b38cc58'];

describe('§46: the ceiling guard in the hash loop', () => {
  it('states the envelope as a constant of the page: 0.7851 against the identity at 520 (§48, step 56)', () => {
    /* 0.7329 with the strip counted (step 54); 0.7851 with the strip out and the construction cell 919 at 1439. */
    expect(CEILING_ENVELOPE).toBeCloseTo(0.7851, 3);
  });

  it('advances past a first arrangement below the envelope and draws the next (the ceiling guard)', () => {
    /* Against 520 the second fixture's first two re-hashes (0.7581, 0.7810) are still under 0.7851, so it advances four times; the others once. */
    const EXPECTED_ADVANCES: Record<string, number> = { '03e53036-b4df-4bf4-9aed-2e57a9b6a5f6': 1, '9742c43b-8bca-4241-9cbe-8af59189680b': 4, '2eea64c0-cdbc-440f-bd53-df145b38cc58': 1 };
    for (const id of REJECTED) {
      expect(aspectOfScene(arrangementAt(id, 0)), `${id.slice(0, 8)}: the fixture is rejected at 0`).toBeLessThan(CEILING_ENVELOPE);
      const scene = construction(id);
      expect(scene.advances, `${id.slice(0, 8)}: advanced past every arrangement below the envelope`).toBe(EXPECTED_ADVANCES[id]);
      for (let n = 0; n < scene.advances; n += 1) expect(aspectOfScene(arrangementAt(id, n)), `${id.slice(0, 8)}: arrangement ${n} was rightly refused`).toBeLessThan(CEILING_ENVELOPE);
      expect(aspectOfScene(scene), `${id.slice(0, 8)}: draws inside the envelope`).toBeGreaterThanOrEqual(CEILING_ENVELOPE);
      expect(JSON.stringify(scene.forms), `${id.slice(0, 8)}: draws the advanced arrangement`).toBe(JSON.stringify(arrangementAt(id, scene.advances).forms));
    }
  });

  it('never advances on the collection: all seventeen are inside the envelope at 0', () => {
    for (const r of rows) expect(construction(r.id).advances, r.title).toBe(0);
  });

  it('depends only on the id: the same id advances the same way every time (§5.1)', () => {
    for (const id of REJECTED) expect(JSON.stringify(construction(id))).toBe(JSON.stringify(construction(id)));
  });

  it('at the cap draws the tried arrangement with the least empty width, and reports the cap reached', () => {
    const scene = constructionWithin(EXHAUSTED_ID, { forceExhausted: true });
    expect(scene.advances, 'every advance counted').toBe(HASH_ADVANCE_CAP);
    const tried = Array.from({ length: HASH_ADVANCE_CAP + 1 }, (_, n) => arrangementAt(EXHAUSTED_ID, n));
    const best = tried.reduce((a, b) => (aspectOfScene(b) > aspectOfScene(a) ? b : a));
    expect(JSON.stringify(scene.forms), 'the widest aspect among those tried, which is the least empty width').toBe(JSON.stringify(best.forms));
  });

  it('sets the cap at 24: four times the measured deepest advance of 6 against 520 (§49), as 8 was four times 2', () => {
    /* At 11.64% per attempt the chance of reaching 24 is 0.1164^24 ≈ 3e-23 per id. */
    expect(HASH_ADVANCE_CAP).toBe(24);
  });
});
