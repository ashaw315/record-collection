import { describe, expect, it } from 'vitest';
import { prefetchCovers } from './prefetch-covers';

/**
 * §W.8: "The wall fetches its covers after it has hydrated, at low priority."
 * The caller decides WHEN (`WallLive`, in the effect that marks the region
 * hydrated); this decides WHAT: one fetch per distinct cover, at low
 * priority, with the priority set before the source so the request is made
 * at that priority rather than re-prioritised after.
 *
 * Fails against `prefetch-covers.ts`: the dedupe, the null skip, the order of
 * the two assignments.
 */
type Fake = { fetchPriority: 'high' | 'low' | 'auto'; src: string; priorityWhenSourced: string | null };

function fake(): Fake {
  const made: Fake = { fetchPriority: 'auto', src: '', priorityWhenSourced: null };
  return {
    get fetchPriority() { return made.fetchPriority; },
    set fetchPriority(value: 'high' | 'low' | 'auto') { made.fetchPriority = value; },
    get src() { return made.src; },
    set src(value: string) { made.priorityWhenSourced = made.fetchPriority; made.src = value; },
    get priorityWhenSourced() { return made.priorityWhenSourced; },
    set priorityWhenSourced(_value: string | null) { /* read-only from outside; the setter keeps the type one object */ },
  };
}

describe('prefetchCovers', () => {
  it('fetches each distinct cover once, in seat order, with low priority set before the source', () => {
    const made: Fake[] = [];
    const seats = [{ coverUrl: '/covers/a.png' }, { coverUrl: null }, { coverUrl: '/covers/b.png' }, { coverUrl: '/covers/a.png' }];
    const kept = prefetchCovers(seats, () => { const f = fake(); made.push(f); return f; });
    expect(made.map((f) => f.src)).toEqual(['/covers/a.png', '/covers/b.png']);
    expect(made.map((f) => f.priorityWhenSourced)).toEqual(['low', 'low']);
    /* The caller keeps them: an image nothing references can be collected before its load completes. */
    expect(kept).toHaveLength(2);
  });

  it('makes nothing on a wall with no covers', () => {
    let calls = 0;
    const kept = prefetchCovers([{ coverUrl: null }, { coverUrl: null }], () => { calls += 1; return fake(); });
    expect(calls).toBe(0);
    expect(kept).toEqual([]);
  });
});
