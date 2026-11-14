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
 * fourth view. ONE row: the moods, ASK and SURPRISE ME laid out as a wrapped
 * row with the untagged line and the slot beneath, since the control's
 * markup is the column host's and at 1273 it drew three rows in the band
 * (Adam, 27 Oct), two rows of the far view's drawing lost. The untagged line
 * stands between the moods and ASK in the markup (§P.6, "beneath the
 * moods"), and as a full-width item it broke the row in two wherever a
 * record was untagged; in the band it follows the row, and the slot follows
 * it (Code's reading: §P.6 places the line beneath the moods, not inside a
 * band's row).
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
  /* Step 168, §T.6 (4 Nov): the view names are §W's furniture on a 24 line, and meet the 44 floor by overlay only where the pointer is coarse; a mouse reaches the drawn line and no further. The 9 each side makes adjacent targets abut exactly at the 18 gap. */
  @media (pointer: coarse) { ${link}::before { content: ''; position: absolute; left: -9px; right: -9px; top: 50%; height: 44px; transform: translateY(-50%); } }
  ${rail} li > span { pointer-events: none; }
  ${scope}[data-rail-filter] { display: none; }
  ${scope}[data-rail-rule] { display: none; }
  ${rail} > [data-pick-host] { order: 1; flex: 1 1 100%; margin-top: 0; }
  ${rail} [data-pick-band-rule] { display: block; margin-bottom: 18px; }
  ${rail} [data-pick-control] { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 18px; }
  ${rail} [data-pick-control] > div { margin-top: 0; }
  ${rail} [data-pick-control] > p { flex: 1 1 100%; margin-top: 0; }
  /*
    Step 178: the field's host takes the row's whole width, the slot comes after ASK and SURPRISE ME, and the covers
    form a wrapped row 24 below the slot. "Ask field wraps and count line" (13 Nov): the count line stands beneath the
    slot. Step 178's order 1 put it above the slot, which read right only while the slot was empty. It now follows the
    covers, as in the sidebar, while Design rules which of the two stands next to the slot.
  */
  ${rail} [data-pick-control] > [data-ask-host] { flex: 1 1 100%; margin-top: 0; }
  ${rail} [data-pick-control] > [data-pick-slot] { order: 1; }
  ${rail} [data-pick-control] > [data-pick-answers] { order: 2; flex: 1 1 100%; flex-direction: row; flex-wrap: wrap; margin-top: 24px; }
  ${rail} [data-pick-control] > [data-without-about] { order: 3; }`;
}
