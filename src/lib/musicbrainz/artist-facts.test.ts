import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artistFactsFromPayload } from './artist-facts';

/**
 * **Q37's second half (Adam's ruling of 11 Nov; the coordinator's go, 20 Nov): the facts the lineup walk downloaded
 * and discarded, read from the MusicBrainz artist payload.** `life-span.begin` is a group's formation and a person's
 * birth, so the formed year is read for anything but a Person; the origin is the begin-area with its area, or the area
 * alone. Fails against a reader that takes a birth year as a formation, one that reads a year outside §4.1's bound, one
 * that doubles an area that is its own begin-area, and one that answers a non-payload with a shape.
 */
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(process.cwd(), 'test', 'fixtures', 'musicbrainz', name), 'utf8'));
const clock = () => new Date('2026-11-20T00:00:00Z');

describe('artistFactsFromPayload', () => {
  it('reads a group’s formation year and its begin-area with its area', () => {
    expect(artistFactsFromPayload(fixture('artist-discharge.json'), clock)).toEqual({ formedYear: 1977, origin: 'Stoke-on-Trent, United Kingdom' });
  });

  it('reads no formed year for a person, whose life-span begins at birth, and their area as origin', () => {
    const person = fixture('artist-person-tony-atkinson.json') as Record<string, unknown>;
    expect(artistFactsFromPayload({ ...person, 'life-span': { begin: '1958-03-02', end: null, ended: false } }, clock)).toEqual({ formedYear: null, origin: 'United Kingdom' });
  });

  it('reads a group with no begin as no formed year, and its begin-area with its area', () => {
    expect(artistFactsFromPayload(fixture('artist-group-member-of-group.json'), clock)).toEqual({ formedYear: null, origin: 'Staten Island, United States' });
  });

  it('refuses a year outside §4.1’s bound, and a begin that is not a year, as no formed year', () => {
    const group = (begin: string) => ({ type: 'Group', 'life-span': { begin }, area: { name: 'Nowhere' } });
    expect(artistFactsFromPayload(group('1850'), clock).formedYear).toBeNull();
    expect(artistFactsFromPayload(group('2028'), clock).formedYear).toBeNull();
    expect(artistFactsFromPayload(group('2027'), clock).formedYear).toBe(2027);
    expect(artistFactsFromPayload(group('19xx'), clock).formedYear).toBeNull();
    expect(artistFactsFromPayload(group('1977-06'), clock).formedYear).toBe(1977);
  });

  it('does not double an area that is its own begin-area, and reads a missing area as no origin', () => {
    expect(artistFactsFromPayload({ type: 'Group', area: { name: 'Iceland' }, 'begin-area': { name: 'Iceland' } }, clock).origin).toBe('Iceland');
    expect(artistFactsFromPayload({ type: 'Group', 'begin-area': { name: 'Reykjavík' } }, clock).origin).toBe('Reykjavík');
    expect(artistFactsFromPayload({ type: 'Group' }, clock).origin).toBeNull();
  });

  it('answers nulls for anything that is not an artist payload', () => {
    expect(artistFactsFromPayload(null, clock)).toEqual({ formedYear: null, origin: null });
    expect(artistFactsFromPayload('Discharge', clock)).toEqual({ formedYear: null, origin: null });
  });
});
