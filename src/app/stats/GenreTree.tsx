import Link from 'next/link';
import { flattenPairs, genreFigure, type GenrePairNode } from './genre-pairs';
import { HIT_ROW_LESS_44, ROW_CUTS, ROW_TARGET } from '@/app/hit-area';
import { DisclosureMark } from '@/app/disclosure-mark';

/**
 * §10/A66: `/stats`' genre series is a tree, not a chart. A66 drew a pair
 * of numbers on each row with a branch; Design's ruling of 12 Oct makes it
 * one number (`genreFigure`), and what follows about two numbers is the
 * reasoning for a component of its own, which still holds for a tree.
 *
 * **A distinct component rather than a `Breakdown` variant**, and the cost
 * decided it rather than the amendment agreeing. `Breakdown` is called four
 * times and only genre is non-additive: a variant would mean a new optional
 * prop, a branch in the row renderer, `Bar` suppressed for one caller, and the
 * `rows` type widened to carry two counts — so three of four callers pay for a
 * shape they never use, and the type says every breakdown might be a tree.
 *
 * **No bar.** A bar is one length and this is two numbers, so no chart style
 * could be honest about it.
 */

/**
 * **`<details>` rather than client state**, matching `RecordForm`'s disclosure.
 * `/stats` is a server component: an expandable tree built on `useState` would
 * make the whole screen a client boundary to reveal rows the server already
 * rendered. `<details>` is keyboard-reachable, announced as a disclosure, and
 * needs no JavaScript — so the rows inside are in the DOM and reachable even if
 * hydration never happens.
 */
function Row({ node, href }: { node: GenrePairNode; href: (id: string) => string }) {
  /**
   * **A zero keeps display and takes muted** (§7a). Eight of seventeen collapsed
   * rows hold nothing anywhere, and the device that makes that payable came from
   * another screen: the empty rows RECEDE without being hidden, which is the
   * whole difference between receding and being withheld.
   *
   * `/stats` is an account of the collection and its failure mode is hiding its
   * own gaps — a genre created and never filled is exactly such a gap.
   */
  const empty = node.subtree === 0;

  return (
    /*
      §9.3, step 126: the rows are links in a column with nothing between
      them, so it is the row that is 44 (the handoff's "row height where
      controls stack with no gap"), and the name's hit area is the row's
      height over the name's width. The name and its figures keep one
      baseline inside it. Where the pointer is coarse (step 127): with a
      mouse the row is the 27.5 it was.
    */
    <div
      className={`flex items-center py-1 text-detail pointer-coarse:min-h-[44px] pointer-coarse:py-0 ${ROW_CUTS} ${ROW_TARGET}${empty ? ' text-muted-foreground' : ''}`}
      style={{ paddingLeft: `${node.depth * 0.875}rem` }}
      data-testid={`genre-row-${node.id}`}
    >
     <div className="flex w-full items-baseline gap-3">
      {/* Cut sideways only: `truncate` hides both ways and would cut the link's hit area to the line. */}
      <span className="min-w-0 flex-1 overflow-x-clip text-ellipsis whitespace-nowrap">
        {/* Linked where the collection can be filtered by it: an account is
            only useful if you can open what it counts. */}
        {/* Step 143 (Design, 13 Oct): "The name's target is the row less the disclosure column, with the count inside it, because the count is not a control and pressing it means the name", on every row. Step 141 had that for a row with a branch and step 138 the whole row for one without; now the right 44 is the column's on both, the branch's control or empty. Under a coarse pointer; with a mouse the name is its own width. */}
        <Link href={href(node.id)} className={`${HIT_ROW_LESS_44} underline-offset-2 hover:underline`}>
          {node.name}
        </Link>
      </span>

      {/*
        One number (Design, 12 Oct), where A66 drew a pair on a row with a
        branch: "Two unlabelled numbers read as one number repeated." The
        test id keeps its name; four specs find the figure by it.
      */}
      {/* Step 143 (Design, 13 Oct): "the count is a column of its own, right-aligned", beside the disclosure column. */}
      <span
        data-testid={`genre-pair-${node.id}`}
        className="shrink-0 text-right font-mono tabular-nums"
      >
        {genreFigure(node)}
      </span>
      {/*
        Step 143 (Design, 13 Oct): "every row keeps a 44 disclosure column at
        its right; a row with a branch draws §T.1's + there, and a row without
        one leaves it empty. The disclosure column keeps every row's count in
        one line whether or not it branches." The − while open is the mark's
        own, from the `details` the row stands in (`group`). Drawn at every
        pointer: it is a column, not a hit area; what is a hit area is the
        `summary` under it on a branch's row, and nothing on a row without one.
      */}
      <span data-disclosure="" className="flex w-[44px] shrink-0 items-center justify-center self-center">
        {node.hasBranch && <DisclosureMark open="details" />}
      </span>
     </div>
    </div>
  );
}

function Branch({ node, href }: { node: GenrePairNode; href: (id: string) => string }) {
  if (!node.hasBranch) return <Row node={node} href={href} />;

  return (
    <details data-testid={`genre-branch-${node.id}`} className="group">
      <summary className="cursor-pointer list-none marker:content-['']">
        <Row node={node} href={href} />
      </summary>
      {node.children.map((child) => (
        <Branch key={child.id} node={child} href={href} />
      ))}
    </details>
  );
}

export function GenreTree({
  nodes,
  href,
}: {
  nodes: GenrePairNode[];
  href: (id: string) => string;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-prose text-muted-foreground">No genres are defined yet.</p>
    );
  }

  return (
    <section className="mt-6" data-testid="by-genre">
      <h2 className="mb-2 font-heading text-title font-semibold tracking-tight">By genre</h2>

      {/*
        Collapsed to the top level by default. A collapsed parent's number
        already counts what is beneath it, so nothing is hidden by the
        collapse but the rows themselves.
      */}
      {nodes.map((node) => (
        <Branch key={node.id} node={node} href={href} />
      ))}

      <p className="mt-2 text-meta text-muted-foreground">
        {flattenPairs(nodes).length} genres · {nodes.length} at the top level. Open a row to
        see what is beneath it.
      </p>
    </section>
  );
}
