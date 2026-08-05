/**
 * Tree shaping for the genre hierarchy editor.
 *
 * The move control is a `<select>` of valid parents, not drag-and-drop. That is
 * a deliberate choice rather than a simplification: a drag tree needs a
 * non-drag path for touch and keyboard anyway, and the secondary path is the
 * one nobody exercises. One control that works everywhere is better tested by
 * construction.
 *
 * These functions are pure so the rules that keep the select honest — no self,
 * no descendants, no current parent — are testable without a browser.
 */

export type GenreRow = {
  id: string;
  name: string;
  parentGenreId: string | null;
  description?: string | null;
};

export type GenreTreeNode = GenreRow & { children: GenreTreeNode[]; depth: number };

/** Nests a flat list, ordered by name at every level. */
export function buildTree(rows: GenreRow[]): GenreTreeNode[] {
  const byId = new Map<string, GenreTreeNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [], depth: 0 });

  const roots: GenreTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentGenreId === null ? undefined : byId.get(node.parentGenreId);
    // An unknown parent makes the node a root rather than dropping it: showing
    // a genre at the wrong depth is recoverable, losing it from the editor is
    // not.
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }

  const sortByName = (nodes: GenreTreeNode[], depth: number): GenreTreeNode[] =>
    nodes
      .map((node) => ({ ...node, depth, children: sortByName(node.children, depth + 1) }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return sortByName(roots, 0);
}

/** Depth-first flattening, for rendering the tree as a single list of rows. */
export function flattenTree(nodes: GenreTreeNode[]): GenreTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/** Every id inside `id`'s subtree, including `id` itself. */
export function descendantIds(rows: GenreRow[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentGenreId === null) continue;
    const siblings = childrenOf.get(row.parentGenreId) ?? [];
    siblings.push(row.id);
    childrenOf.set(row.parentGenreId, siblings);
  }

  const found = new Set<string>([id]);
  const queue = [id];

  // Breadth-first with a seen-set, so malformed data containing a cycle
  // terminates instead of hanging the editor.
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of childrenOf.get(current) ?? []) {
      if (found.has(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }

  return found;
}

/**
 * The genres a row may be moved under.
 *
 * Excludes the row itself and everything beneath it — those are the moves the
 * API's cycle guard would reject, and offering them only to fail is a worse
 * experience than not offering them. The API check remains the guarantee; this
 * makes the rejection rare rather than unnecessary.
 */
export function validParents(rows: GenreRow[], id: string): GenreRow[] {
  const excluded = descendantIds(rows, id);

  return rows
    .filter((row) => !excluded.has(row.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Name lookup for building the cycle message without a second fetch. */
export function nameOf(rows: GenreRow[], id: string | null): string | undefined {
  if (id === null) return undefined;
  return rows.find((row) => row.id === id)?.name;
}
