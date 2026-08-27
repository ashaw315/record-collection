/**
 * SPEC.md §12c (A44) — shaping a proposed hierarchy into something readable in
 * one pass.
 *
 * **Measured before the layout was settled.** 32 unparented genres produce about
 * 9 parents holding 22 children, 2-3 each — roughly 31 lines, which fits one
 * screen. **So the screen is nine GROUPS, not thirty-two rows**, and that is the
 * whole difference: doing this by hand in `/manage` means choosing from a
 * dropdown 32 times with no view of the shape, which is the friction the feature
 * exists to remove. A proposal the user had to grind through row by row would
 * have reproduced it in a new form.
 */

export type ProposedPairing = {
  genreId: string;
  genre: string;
  parentId: string;
  parent: string;
};

export type Evidence = { recordCount: number; examples: string[] };

export type ProposedGroup = {
  parent: string;
  parentId: string | null;
  children: Array<ProposedPairing & { evidence: Evidence }>;
  /**
   * True when this parent was named as having nothing to put under it.
   *
   * **A blank heading is worse than no heading** (Adam): `Punk` sitting empty is
   * the whole reason this feature exists, and after the tree lands it should
   * either have children or be a genre he decides to delete — **not a heading
   * whose meaning he has to reconstruct.** So the emptiness is labelled rather
   * than left for the reader to interpret, which is absent-versus-unknown one
   * level up from the data.
   */
  noChildrenProposed: boolean;
};

/**
 * Groups the flat pairing list by proposed parent, largest group first.
 *
 * **Largest first because the biggest judgement leads**: `Rock` holding seven
 * children is one question — "is Rock the right bucket for these?" — and it is
 * the question worth asking before the ones holding a single child.
 */
export function groupProposal(
  pairings: ProposedPairing[],
  childlessParents: string[],
  evidence: Record<string, Evidence>,
): ProposedGroup[] {
  const byParent = new Map<string, ProposedGroup>();

  for (const pairing of pairings) {
    const group = byParent.get(pairing.parent) ?? {
      parent: pairing.parent,
      parentId: pairing.parentId,
      children: [],
      noChildrenProposed: false,
    };

    group.children.push({
      ...pairing,
      // Absent evidence is zero rather than undefined: a genre carrying nothing
      // is a fact, and the line says so.
      evidence: evidence[pairing.genre] ?? { recordCount: 0, examples: [] },
    });
    byParent.set(pairing.parent, group);
  }

  const grouped = [...byParent.values()].sort((a, b) => b.children.length - a.children.length);

  /*
   * Named-but-childless parents appended AFTER the groups holding children:
   * they carry no decision, so they are context rather than work, and putting
   * them first would open the screen with rows nothing can be done to.
   */
  const named = childlessParents
    .filter((parent) => !byParent.has(parent))
    .map((parent) => ({
      parent,
      parentId: null,
      children: [],
      noChildrenProposed: true,
    }));

  return [...grouped, ...named];
}

/**
 * What a pairing rests on — **STATED, never RATED.**
 *
 * A count is a fact the user weighs; a grade is the app judging its own output.
 * **`Rock` at ten records is the standing proof that count and quality are
 * different axes**: ten records across ten unrelated artists means "this term is
 * an import artefact", not "this suggestion is well supported". Only the user
 * can tell those apart, so the app supplies the fact and no adjective.
 *
 * **The examples are load-bearing rather than decoration.** The count says how
 * much evidence there is; the example titles say whether it means anything —
 * and it is the artist names that reveal a catch-all.
 */
export function evidenceLine(evidence: Evidence): string {
  if (evidence.recordCount === 0) return 'no records';

  const noun = evidence.recordCount === 1 ? 'record' : 'records';
  const [example] = evidence.examples;

  return example === undefined
    ? `${evidence.recordCount} ${noun}`
    : `${evidence.recordCount} ${noun}: ${example}`;
}
