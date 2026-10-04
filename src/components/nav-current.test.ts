import { describe, expect, it } from 'vitest';
import { currentSection } from './nav-current';

/**
 * §G.4 (step 74): "A screen reached from a section of the nav marks that
 * section current. The record detail, record edit and new record belong to
 * Collection ... Suggestions is reached from the want list, so Want list is
 * current there."
 *
 * Before this, the header marked a link current only when the path started
 * with the link's own path, so no link was current on the three record
 * screens or on Suggestions, and the match had no segment boundary: a
 * future `/stats-archive` would have marked Stats.
 */
const ID = '2be8579e-2ee7-44fa-81e8-9713a6aaa714';

describe('currentSection: which nav link a screen marks current (§G.4)', () => {
  /* Fails against the absent module; then against any rule that reads only a link's own path. */
  it('marks Collection on the collection and on all three record screens', () => {
    expect(currentSection('/')).toBe('/');
    expect(currentSection(`/records/${ID}`)).toBe('/');
    expect(currentSection(`/records/${ID}/edit`)).toBe('/');
    expect(currentSection('/records/new')).toBe('/');
  });

  /* Fails against a prefix rule: /suggestions does not start with /want-list. */
  it('marks Want list on the want list, its item screens and Suggestions', () => {
    expect(currentSection('/want-list')).toBe('/want-list');
    expect(currentSection('/want-list/new')).toBe('/want-list');
    expect(currentSection(`/want-list/${ID}`)).toBe('/want-list');
    expect(currentSection(`/want-list/${ID}/edit`)).toBe('/want-list');
    expect(currentSection('/suggestions')).toBe('/want-list');
  });

  /* Fails against a missing mapping for any of the three single-screen sections. */
  it('marks Look up, Stats and Manage on their own screens', () => {
    expect(currentSection('/lookup')).toBe('/lookup');
    expect(currentSection('/stats')).toBe('/stats');
    expect(currentSection('/manage')).toBe('/manage');
  });

  /* Fails against the old `startsWith(link.href)`, which had no segment boundary. */
  it('needs a segment boundary: a path that merely begins with a section’s name is not in it', () => {
    expect(currentSection('/stats-archive')).toBeNull();
    expect(currentSection('/manager')).toBeNull();
    expect(currentSection('/lookups')).toBeNull();
    expect(currentSection('/recordsx')).toBeNull();
  });

  /* Fails against a rule that defaults to Collection: a screen belonging to no section marks none. */
  it('marks nothing on a screen no section owns', () => {
    expect(currentSection('/login')).toBeNull();
    expect(currentSection('/wall/probe/page8a')).toBeNull();
  });
});
