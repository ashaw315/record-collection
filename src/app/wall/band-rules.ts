import { SCREEN } from '../screen-frame';

/**
 * **The band's two rows, as rules under a scope (§W.24, steps 95 and 96).**
 *
 * The shelf's controls are a rail when the window is wide and a band of two
 * rows when it is not; the table and grid have no rail (§T.1) and take the
 * band at every width. One set of rules, so the two cannot drift: the shelf
 * puts them inside its fork's media query, and the Collection's other views
 * put them under their own scope with no query.
 *
 * The pick control, where the rail carries one, takes a third row of its own
 * after a hairline (target §P.5): on the row of view names it read as a
 * fourth view.
 *
 * `scope` is a selector prefix ending in a space, or empty.
 */
export function bandRules(scope: string): string {
  const rail = `${scope}[data-testid="wall-rail"]`;
  /*
    The rail's own links. The pick's answer is §T.5's cell (§P.4: "the same
    cell") and keeps its own type: reached by these, its title could not wrap,
    lost its 8 above the cover, and held its covering ::after to itself.
  */
  const link = `${rail} a:not([data-pick-answer] a)`;
  return `  ${rail} { flex-direction: row; align-items: flex-end; flex-wrap: wrap; gap: 18px; width: auto !important; padding: 12px ${SCREEN.inset}px 16px !important; }
  ${rail} form { margin-bottom: 0; flex: 1 1 100%; min-width: 0; }
  ${rail} ul { flex-direction: row; flex: none; }
  ${link} { margin-top: 0; white-space: nowrap; }
  ${rail} > a { margin-left: auto; }
  ${rail} > hr { display: none; }
  ${rail} { align-items: baseline; }
  ${link} { position: relative; }
  ${link}::before { content: ''; position: absolute; left: -9px; right: -9px; top: 50%; height: 44px; transform: translateY(-50%); }
  ${rail} li > span { pointer-events: none; }
  ${scope}[data-rail-filter] { display: none; }
  ${scope}[data-rail-rule] { display: none; }
  ${rail} > [data-pick-host] { order: 1; flex: 1 1 100%; margin-top: 0; }
  ${rail} [data-pick-band-rule] { display: block; margin-bottom: 18px; }`;
}
