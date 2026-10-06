import { LABEL } from '../records/[id]/grid-type';
import { WALL_PAPER_HEX } from './pull-colour';

/**
 * The plain back's imprint: label and catalogue number at the foot, and
 * nothing further (SPEC.md §10b, A19; §11 flow 7).
 *
 * One component because one sleeve has one back: §M.3 rules that the
 * record modal's plain back is "the same face from the same component" as
 * the wall's, so the two cannot drift. It draws the imprint and not the
 * ground: on the wall the ground is the pulled record's field beneath it.
 * It fills the box it is given.
 */
export function PlainBackImprint({ labelName, catalogNumber }: { labelName: string | null; catalogNumber: string | null }) {
  return (
    <div className={`flex h-full flex-col justify-end p-[16px] ${LABEL}`} style={{ color: WALL_PAPER_HEX }}>
      <div>{labelName ?? ''}</div>
      <div>{catalogNumber ?? ''}</div>
    </div>
  );
}
