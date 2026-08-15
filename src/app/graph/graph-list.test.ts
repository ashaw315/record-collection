import { describe, expect, it } from 'vitest';
import { groupArtistsByGenre } from './graph-list';
import type { Graph } from '@/lib/db/queries/graph';

/**
 * SPEC.md §8.1: "Must be usable on mobile: pinch-zoom and pan, and a fallback
 * list view for very small screens."
 *
 * The list groups by TOP-LEVEL genre using the same walk the colours use, so
 * the two agree by construction rather than by coincidence — a list that
 * grouped differently from the graph it replaces would describe a different
 * collection at a different screen width.
 *
 * A list that could not group would be an alphabetical index, which the graph
 * already beats; the grouping is the point.
 */

function graph(partial: Partial<Graph>): Graph {
  return { nodes: [], links: [], ...partial };
}

function artist(id: string, label: string, ownedCount = 1) {
  return {
    id: `artist:${id}`,
    type: 'artist' as const,
    label,
    ownedCount,
    priorityTier: null,
    parentGenreId: null,
  };
}

function genre(id: string, label: string, parentGenreId: string | null = null) {
  return {
    id: `genre:${id}`,
    type: 'genre' as const,
    label,
    ownedCount: 0,
    priorityTier: null,
    parentGenreId,
  };
}

function hasGenre(artistId: string, genreId: string, weight = 1) {
  return {
    source: `artist:${artistId}`,
    target: `genre:${genreId}`,
    type: 'has_genre' as const,
    weight,
  };
}

describe('groupArtistsByGenre', () => {
  it('groups two artists under their shared top-level ancestor', () => {
    /**
     * The §8 rule in list form: UK82 and US Hardcore are different scenes and
     * stay different rows in the data, but both hang under Punk — so the list
     * shows one Punk group rather than two, exactly as the graph shows one
     * colour family.
     */
    const result = groupArtistsByGenre(
      graph({
        nodes: [
          genre('punk', 'Punk'),
          genre('uk82', 'UK82', 'punk'),
          genre('hc', 'US Hardcore', 'punk'),
          artist('a', 'Discharge'),
          artist('b', 'Black Flag'),
        ],
        links: [hasGenre('a', 'uk82'), hasGenre('b', 'hc')],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Punk');
    expect(result[0].artists.map((entry) => entry.label)).toEqual(['Black Flag', 'Discharge']);
  });

  it('sorts groups by name and artists within a group by name', () => {
    // Deterministic ordering, for the reason §8.2 gives for shelf order: a list
    // that reshuffles between loads is useless to read against a shelf.
    const result = groupArtistsByGenre(
      graph({
        nodes: [
          genre('rock', 'Rock'),
          genre('punk', 'Punk'),
          artist('a', 'Zounds'),
          artist('b', 'Adverts'),
          artist('c', 'Dire Straits'),
        ],
        links: [hasGenre('a', 'punk'), hasGenre('b', 'punk'), hasGenre('c', 'rock')],
      }),
    );

    expect(result.map((group) => group.label)).toEqual(['Punk', 'Rock']);
    expect(result[0].artists.map((entry) => entry.label)).toEqual(['Adverts', 'Zounds']);
  });

  it('puts artists with no genre in a final group, never hidden', () => {
    /**
     * §8.1: an artist whose records carry no genre is an honest absence. On the
     * graph they are a grey dot; in the list they must still be READABLE, or
     * the fallback would show fewer artists than the view it replaces.
     */
    const result = groupArtistsByGenre(
      graph({
        nodes: [genre('punk', 'Punk'), artist('a', 'Discharge'), artist('b', 'Ungenred')],
        links: [hasGenre('a', 'punk')],
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[1].artists.map((entry) => entry.label)).toEqual(['Ungenred']);
    expect(result[1].genreId, 'the ungrouped bucket is not a genre').toBeNull();
  });

  it('puts the ungrouped bucket LAST even when its label would sort first', () => {
    // Otherwise the bucket's label decides its position and the "everything
    // else" group lands in the middle of the genres.
    const result = groupArtistsByGenre(
      graph({
        nodes: [genre('zz', 'Zydeco'), artist('a', 'Beausoleil'), artist('b', 'Ungenred')],
        links: [hasGenre('a', 'zz')],
      }),
    );

    expect(result.map((group) => group.genreId)).toEqual(['genre:zz', null]);
  });

  it('omits the ungrouped bucket entirely when every artist has a genre', () => {
    // An empty "No genre" heading is a claim that something is missing.
    const result = groupArtistsByGenre(
      graph({
        nodes: [genre('punk', 'Punk'), artist('a', 'Discharge')],
        links: [hasGenre('a', 'punk')],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].genreId).toBe('genre:punk');
  });

  it('lists an artist once even with several genres', () => {
    /**
     * An artist tagged both UK82 and Rock has two `has_genre` edges. Listing
     * them under both would inflate the list and make the counts disagree with
     * the graph — the same duplication hazard as the /manage EXISTS filter.
     */
    const result = groupArtistsByGenre(
      graph({
        nodes: [
          genre('punk', 'Punk'),
          genre('uk82', 'UK82', 'punk'),
          genre('rock', 'Rock'),
          artist('a', 'Discharge'),
        ],
        links: [hasGenre('a', 'uk82', 4), hasGenre('a', 'rock', 1)],
      }),
    );

    const appearances = result.flatMap((group) =>
      group.artists.filter((entry) => entry.label === 'Discharge'),
    );

    expect(appearances).toHaveLength(1);
    // The genre carrying most of their records wins, per §8.1's tie-break.
    expect(result[0].label).toBe('Punk');
  });

  it('carries each artist\'s owned count for the row', () => {
    const result = groupArtistsByGenre(
      graph({
        nodes: [genre('punk', 'Punk'), artist('a', 'Discharge', 4)],
        links: [hasGenre('a', 'punk')],
      }),
    );

    expect(result[0].artists[0].ownedCount).toBe(4);
  });

  it('returns nothing for an empty graph', () => {
    expect(groupArtistsByGenre(graph({}))).toEqual([]);
  });

  it('ignores genre nodes as list entries', () => {
    // Genres are HEADINGS. A "Punk — 0 records" row beside the artists would be
    // noise on the screen with the least room to spare.
    const result = groupArtistsByGenre(
      graph({
        nodes: [genre('punk', 'Punk'), artist('a', 'Discharge')],
        links: [hasGenre('a', 'punk')],
      }),
    );

    expect(result.flatMap((group) => group.artists).map((entry) => entry.label)).toEqual([
      'Discharge',
    ]);
  });
});
