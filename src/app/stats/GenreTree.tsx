import Link from 'next/link';
import { flattenPairs, type GenrePairNode } from './genre-pairs';
import { HIT_ROW, ROW_CUTS } from '@/app/hit-area';

/**
 * §10/A66: `/stats`' genre series is a TREE OF PAIRS, not a chart.
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
      className={`flex items-center py-1 text-detail pointer-coarse:min-h-[44px] pointer-coarse:py-0 ${ROW_CUTS}${empty ? ' text-muted-foreground' : ''}`}
      style={{ paddingLeft: `${node.depth * 0.875}rem` }}
      data-testid={`genre-row-${node.id}`}
    >
     <div className="flex w-full items-baseline justify-between gap-3">
      {/* Cut sideways only: `truncate` hides both ways and would cut the link's hit area to the line. */}
      <span className="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap">
        {/* Linked where the collection can be filtered by it: an account is
            only useful if you can open what it counts. */}
        <Link href={href(node.id)} className={`${HIT_ROW} underline-offset-2 hover:underline`}>
          {node.name}
        </Link>
      </span>

      {/*
        **The pair, where a branch exists to walk.** `Rock 10 · 10`'s second
        number is a receipt — the branch was walked and added nothing — while
        `Dub 1` has no branch, so a second number would describe a set that does
        not exist. **The absence of the second figure IS the distinction**, so a
        childless row carries no other mark.
      */}
      <span
        data-testid={`genre-pair-${node.id}`}
        className="shrink-0 font-mono tabular-nums"
      >
        {node.hasBranch ? `${node.direct} · ${node.subtree}` : node.direct}
      </span>
     </div>
    </div>
  );
}

function Branch({ node, href }: { node: GenrePairNode; href: (id: string) => string }) {
  if (!node.hasBranch) return <Row node={node} href={href} />;

  return (
    <details data-testid={`genre-branch-${node.id}`}>
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
        **The collapse is a default VIEW STATE, not a different format.** The
        pair is the format at every depth; collapsing to top level is what pays
        the row cost, and a collapsed parent's subtree count states what is
        underneath without expanding it.

        Eleven of seventeen rendering as single numbers is the design working
        rather than diluting: a flat breakdown is the pair collapsed, same row
        grammar. A device appearing on all seventeen rows would be wallpaper —
        a mark whose value never varies — and here the value IS the information.
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
