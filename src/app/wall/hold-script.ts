/**
 * §W.8 (Design, 29 Oct, "Hold observed"): "A press on a spine while the page
 * is still loading is held, and applied as a pull when the wall hydrates."
 * Once the page has loaded the press pulls and is not held.
 *
 * "Still loading" is `document.readyState === 'loading'`: the parser has not
 * yet read the document's end, where the page's payload arrives inline, so
 * React may be attached and unable to hydrate the wall on a press. It is not
 * `complete` or the load event, which wait for every cover. When the parser
 * has read the last chunk the wall can hydrate without Next closing its
 * stream (measured 29 Oct: 116ms with the close held), so a press after that
 * hydrates the wall through React and pulls, measured before.
 *
 * The press has to be caught AHEAD of React, so this is an inline script in
 * the wall's server markup, run as soon as it is parsed: a capture listener
 * on the document holds the last press on a seat's anchor (a click, or Enter
 * on the focused seat), prevents the anchor's navigation, and marks the
 * wall's container `data-held`. `WallLive` applies the hold when its
 * hydration effect runs. A press on a second spine replaces the first; any
 * other input cancels: a scroll, a press off the spines, a key that moves
 * focus, or leaving the page. The far view's run is not held: it is drawn
 * only on the measured, hydrated wall (W.8/run-held-before-hydration).
 *
 * **The bound lives here and not in React (the coordinator, 28 Oct).** If
 * the bundle never runs, React can fire no timer, and a press held with its
 * navigation already prevented would be held for ever. So the timer and the
 * fallback are in this script: past `HOLD_BOUND_MS` a held press navigates as
 * the anchor would.
 *
 * Before any script runs, a seat's anchor navigates to the record's page,
 * as §W.8 says; that stays, since this script is the first to run.
 */

/**
 * The bound, one place. Provisional (§W.8, 29 Oct): it stays if the window
 * occurs on production and its figure comes from that window's widest run;
 * if it does not, the bound and its navigation come out. The 2000 was set
 * against the broader window of 28 Oct and is unbased (the Provisionals line).
 */
export const HOLD_BOUND_MS = 2000;

export const HOLD_SCRIPT = `(function () {
  var w = window;
  if (w.__wallHoldInstalled) return;
  w.__wallHoldInstalled = true;
  var BOUND = ${HOLD_BOUND_MS};
  var hold = null;
  var timer = null;
  /*
    The wall containing the press: its container carries the hydrated mark
    for both views (WallLive), where a region's own mark was on whichever
    node the ref held at mount and the far view's region never had it (a
    zoom landed twice, the gate on 41cceaf). Nothing else on the page is
    asked, so a press on a wall that is not hydrated is held whatever
    another wall's state is.
  */
  function wallOf(target) { return target instanceof Element ? target.closest('[data-wall-container]') : null; }
  function hydratedWall(target) { var c = wallOf(target); return c !== null && c.getAttribute('data-hydrated') === 'true'; }
  function hydrated() { return hold !== null && hold.wall !== null && hold.wall.getAttribute('data-hydrated') === 'true'; }
  function clear() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (hold !== null && hold.wall !== null) hold.wall.removeAttribute('data-held');
    hold = null;
    w.__wallHold = null;
  }
  function take(kind, id, href, wall) {
    if (timer !== null) clearTimeout(timer);
    if (hold !== null && hold.wall !== null) hold.wall.removeAttribute('data-held');
    hold = { kind: kind, id: id, href: href, at: Date.now(), wall: wall };
    w.__wallHold = hold;
    if (wall !== null) wall.setAttribute('data-held', id);
    /* Past the bound, unhydrated: the seat's anchor navigates as it would have; the run loads the near view's address for it. */
    timer = setTimeout(function () {
      timer = null;
      if (hold === null || hydrated()) return;
      var h = hold;
      clear();
      if (h.href) w.location.assign(h.href);
    }, BOUND);
  }
  w.__wallHoldClear = clear;
  function pressTarget(target) {
    if (!(target instanceof Element)) return null;
    var seat = target.closest('a[data-seat]');
    if (seat !== null) return { kind: 'seat', id: seat.getAttribute('data-seat'), href: seat.getAttribute('href') };
    return null;
  }
  /* §W.8: held only while the page is still loading; once it has loaded, React answers the press. */
  function loading() { return document.readyState === 'loading'; }
  document.addEventListener('click', function (event) {
    var p = pressTarget(event.target);
    if (p === null) { if (hold !== null) clear(); return; }
    if (hydratedWall(event.target) || !loading()) return;
    event.preventDefault();
    take(p.kind, p.id, p.href, wallOf(event.target));
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      var p = pressTarget(event.target);
      if (p !== null && !hydratedWall(event.target) && loading()) { event.preventDefault(); take(p.kind, p.id, p.href, wallOf(event.target)); return; }
    }
    /* A key that moves focus: Tab and the arrows walk the seats; the reader has moved on. */
    if (hold !== null && (event.key === 'Tab' || event.key.indexOf('Arrow') === 0 || event.key === 'Escape')) clear();
  }, true);
  /*
    A scroll cancels the hold, as the reader moving on. A scroll event in the
    first moments after the press is the press's own: a browser scrolls the
    seat into view for the click, and the event arrives a frame later. The
    reader's scroll in the window is a gesture made after the press, so the
    grace is short.
  */
  var SCROLL_GRACE_MS = 150;
  function onScroll() { if (hold !== null && Date.now() - hold.at > SCROLL_GRACE_MS) clear(); }
  document.addEventListener('scroll', onScroll, true);
  w.addEventListener('scroll', onScroll);
  w.addEventListener('pagehide', function () { if (hold !== null) clear(); });
})();`;
