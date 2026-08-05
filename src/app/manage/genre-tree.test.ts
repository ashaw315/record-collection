import { describe, expect, it } from 'vitest';
import {
  buildTree,
  descendantIds,
  flattenTree,
  nameOf,
  validParents,
  type GenreRow,
} from './genre-tree';

/**
 * The move control offers only valid parents, so these rules are what stop the
 * editor proposing a move the API will reject. The API cycle guard remains the
 * guarantee — this makes the rejection rare, not unnecessary, and the tests
 * below assert both halves.
 */

// Punk > UK82 > Oi, plus a separate Metal > Doom, plus an unattached Jazz.
const ROWS: GenreRow[] = [
  { id: 'punk', name: 'Punk', parentGenreId: null },
  { id: 'uk82', name: 'UK82', parentGenreId: 'punk' },
  { id: 'oi', name: 'Oi', parentGenreId: 'uk82' },
  { id: 'metal', name: 'Metal', parentGenreId: null },
  { id: 'doom', name: 'Doom', parentGenreId: 'metal' },
  { id: 'jazz', name: 'Jazz', parentGenreId: null },
];

describe('buildTree', () => {
  it('nests children under their parent', () => {
    const tree = buildTree(ROWS);
    const punk = tree.find((node) => node.id === 'punk');

    expect(punk?.children.map((c) => c.id)).toEqual(['uk82']);
    expect(punk?.children[0].children.map((c) => c.id)).toEqual(['oi']);
  });

  it('returns every root, sorted by name', () => {
    expect(buildTree(ROWS).map((node) => node.name)).toEqual(['Jazz', 'Metal', 'Punk']);
  });

  it('sorts siblings by name at every level', () => {
    const rows: GenreRow[] = [
      { id: 'p', name: 'Punk', parentGenreId: null },
      { id: 'z', name: 'Zolo', parentGenreId: 'p' },
      { id: 'a', name: 'Anarcho', parentGenreId: 'p' },
    ];

    expect(buildTree(rows)[0].children.map((c) => c.name)).toEqual(['Anarcho', 'Zolo']);
  });

  it('records depth for indentation and aria-level', () => {
    const flat = flattenTree(buildTree(ROWS));
    const byId = Object.fromEntries(flat.map((node) => [node.id, node.depth]));

    expect(byId).toMatchObject({ punk: 0, uk82: 1, oi: 2 });
  });

  it('treats a node with an unknown parent as a root rather than dropping it', () => {
    // Losing a genre from the editor is worse than showing it at the wrong
    // depth — it would be invisible and uneditable.
    const orphan: GenreRow[] = [{ id: 'x', name: 'Orphan', parentGenreId: 'missing' }];

    expect(buildTree(orphan).map((n) => n.id)).toEqual(['x']);
  });

  it('includes every row exactly once when flattened', () => {
    const ids = flattenTree(buildTree(ROWS)).map((node) => node.id);

    expect(ids).toHaveLength(ROWS.length);
    expect(new Set(ids).size).toBe(ROWS.length);
  });

  it('terminates on malformed data containing a cycle', () => {
    // Should be impossible via the API, but the editor must not hang if it
    // ever happens — a hung editor is unrecoverable without a reload.
    const cyclic: GenreRow[] = [
      { id: 'a', name: 'A', parentGenreId: 'b' },
      { id: 'b', name: 'B', parentGenreId: 'a' },
    ];

    expect(() => flattenTree(buildTree(cyclic))).not.toThrow();
  });
});

describe('descendantIds', () => {
  it('includes the node itself', () => {
    expect(descendantIds(ROWS, 'oi')).toEqual(new Set(['oi']));
  });

  it('includes the whole subtree, not only direct children', () => {
    expect(descendantIds(ROWS, 'punk')).toEqual(new Set(['punk', 'uk82', 'oi']));
  });

  it('terminates on a cycle instead of looping forever', () => {
    const cyclic: GenreRow[] = [
      { id: 'a', name: 'A', parentGenreId: 'b' },
      { id: 'b', name: 'B', parentGenreId: 'a' },
    ];

    expect(descendantIds(cyclic, 'a')).toEqual(new Set(['a', 'b']));
  });
});

describe('validParents', () => {
  it('excludes the genre itself', () => {
    expect(validParents(ROWS, 'punk').map((r) => r.id)).not.toContain('punk');
  });

  it('excludes every descendant, not only direct children', () => {
    // Offering Oi as a parent of Punk would propose exactly the move the API
    // rejects — the three-node cycle.
    const ids = validParents(ROWS, 'punk').map((r) => r.id);

    expect(ids).not.toContain('uk82');
    expect(ids).not.toContain('oi');
  });

  it('KEEPS unrelated genres, including the current parent', () => {
    // The maximally paranoid version — excluding anything that might conflict —
    // would leave the select empty and the hierarchy uneditable. Moving back to
    // the current parent is a no-op, not an error, and hiding it would make the
    // control's contents depend on where the row already sits.
    const ids = validParents(ROWS, 'oi').map((r) => r.id);

    expect(ids).toContain('punk');
    expect(ids).toContain('metal');
    expect(ids).toContain('jazz');
    expect(ids).toContain('uk82');
  });

  it('allows a sibling to become a parent', () => {
    expect(validParents(ROWS, 'doom').map((r) => r.id)).toContain('punk');
  });

  it('returns options sorted by name', () => {
    expect(validParents(ROWS, 'jazz').map((r) => r.name)).toEqual([
      'Doom',
      'Metal',
      'Oi',
      'Punk',
      'UK82',
    ]);
  });

  it('leaves a lone genre with no options rather than offering itself', () => {
    const single: GenreRow[] = [{ id: 'a', name: 'A', parentGenreId: null }];

    expect(validParents(single, 'a')).toEqual([]);
  });
});

describe('nameOf', () => {
  it('resolves an id to a name for the cycle message', () => {
    expect(nameOf(ROWS, 'uk82')).toBe('UK82');
  });

  it('returns undefined for null and for an unknown id', () => {
    expect(nameOf(ROWS, null)).toBeUndefined();
    expect(nameOf(ROWS, 'nope')).toBeUndefined();
  });
});
