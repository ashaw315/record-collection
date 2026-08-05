import { describe, expect, it } from 'vitest';
import {
  cycleMessage,
  fallbackMessage,
  inUseMessage,
  parseApiError,
  seededMessage,
} from './messages';

/**
 * These messages are the whole point of the 409 bodies the API returns. If they
 * drift back to codes, the referenceCount work was wasted.
 */

describe('inUseMessage', () => {
  it('names the referrer where the count comes from exactly one', () => {
    expect(inUseMessage('tags', 3)).toBe("Can't delete — 3 records use this.");
  });

  it('uses the singular for one', () => {
    expect(inUseMessage('tags', 1)).toBe("Can't delete — 1 record uses this.");
  });

  /**
   * The honesty constraint. `genres` sums records, want-list entries, artists
   * and child genres into one number, so there is no truthful singular noun for
   * it — "4 records" would be a lie whenever any of the four came from
   * elsewhere. This test exists so a later "improvement" to specificity fails.
   */
  it('does NOT name a referrer for a resource whose count spans several', () => {
    for (const resource of ['genres', 'labels', 'artists', 'pressings']) {
      const message = inUseMessage(resource, 4);

      expect(message, resource).toBe("Can't delete — it's used in 4 places.");
      expect(message, `${resource} must not claim a specific referrer`).not.toMatch(
        /record|artist|want|price|genre/i,
      );
    }
  });

  it('uses the singular place for one', () => {
    expect(inUseMessage('genres', 1)).toBe("Can't delete — it's used in 1 place.");
  });

  it('never returns a bare code', () => {
    for (const resource of ['tags', 'genres', 'pressings']) {
      expect(inUseMessage(resource, 2)).not.toContain('IN_USE');
    }
  });
});

describe('cycleMessage', () => {
  it('names both genres and the direction of the existing relationship', () => {
    // Actionable, not merely correct: the user needs to know WHICH is already
    // inside the other, or they cannot tell what to do next.
    expect(cycleMessage('Punk', 'UK82')).toBe(
      "Punk can't move under UK82 — UK82 is already inside Punk.",
    );
  });

  it('states the direction, not just that a cycle exists', () => {
    const message = cycleMessage('Punk', 'UK82');

    expect(message).toContain('already inside');
    expect(message).not.toMatch(/cycle|ancestor|recursive/i);
  });

  it('keeps the two names distinguishable in both positions', () => {
    const forward = cycleMessage('Punk', 'UK82');
    const backward = cycleMessage('UK82', 'Punk');

    expect(forward).not.toBe(backward);
  });
});

describe('seededMessage', () => {
  it('explains what a seeded format is rather than refusing blankly', () => {
    expect(seededMessage('LP')).toBe("LP is a built-in format and can't be deleted.");
  });
});

describe('parseApiError', () => {
  it('extracts the error object from an API body', () => {
    const parsed = parseApiError({ error: { code: 'IN_USE', referenceCount: 3 } });

    expect(parsed).toEqual({ code: 'IN_USE', referenceCount: 3 });
  });

  it('returns undefined for anything that is not an error body', () => {
    for (const body of [null, undefined, 'text', 42, {}, { data: [] }, { error: 'oops' }]) {
      expect(parseApiError(body), JSON.stringify(body)).toBeUndefined();
    }
  });
});

describe('fallbackMessage', () => {
  it('prefers the API message when there is one', () => {
    expect(fallbackMessage({ message: 'Name is required' })).toBe('Name is required');
  });

  it('gives a usable sentence when there is not', () => {
    for (const error of [undefined, {}, { message: '' }]) {
      expect(fallbackMessage(error)).toBe('Something went wrong. Try again.');
    }
  });
});
