/**
 * §W.8 (Design, 28 Oct): "A press on a spine before the wall has hydrated is
 * held, and applied as a pull when it hydrates."
 *
 * The window is after React's root listener attaches and before the wall's
 * subtree hydrates, where React drops a discrete event and the build dropped
 * the press (the wall-route Escape flake, read from its trace). The press
 * has to be caught AHEAD of React, so this is an inline script in the wall's
 * server markup, run as soon as it is parsed: a capture listener on the
 * document holds the last press on a seat's anchor (a click, or Enter on the
 * focused seat) or on the far view's run, prevents the anchor's navigation,
 * and marks the region `data-held`. `WallLive` applies the hold when its
 * hydration effect runs. A press on a second spine replaces the first; any
 * other input cancels: a scroll, a press off the spines, a key that moves
 * focus, or leaving the page.
 *
 * **The bound lives here and not in React (the coordinator, 28 Oct).** The
 * bound exists for a script that fails; if the bundle never runs, React can
 * fire no timer, and a press held with its navigation already prevented
 * would be held for ever. So the timer and the fallback are in this script:
 * past `HOLD_BOUND_MS` a held seat press navigates as the anchor would, and
 * a held run press loads the near view's address for that run (§W.8, 28
 * Oct: a page load, which §P.2's rule on zooms does not reach).
 *
 * Before any script runs, a seat's anchor navigates to the record's page,
 * as §W.8 says; that stays, since this script is the first to run.
 */

/**
 * The bound, one place (28 Oct). The widest window measured is 1244ms (cpu
 * ×8, NOTES 20:15); 2000 sits 756ms, 61%, above it, so ordinary slow
 * hydration never reaches it and only a script that fails does, which is
 * what the target asks of the basis. The coordinator's recommendation to
 * Adam; Adam judges it (the Provisionals line).
 */
export const HOLD_BOUND_MS = 2000;

export const HOLD_SCRIPT = `(function () {
  var w = window;
  if (w.__wallHoldInstalled) return;
  w.__wallHoldInstalled = true;
  var BOUND = ${HOLD_BOUND_MS};
  var hold = null;
  var timer = null;
  function region() { return document.querySelector('[data-region="wall"]'); }
  function hydrated() { var r = region(); return r !== null && r.getAttribute('data-hydrated') === 'true'; }
  function clear() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    hold = null;
    w.__wallHold = null;
    var r = region();
    if (r !== null) r.removeAttribute('data-held');
  }
  function take(kind, id, href) {
    if (timer !== null) clearTimeout(timer);
    hold = { kind: kind, id: id, href: href, at: Date.now() };
    w.__wallHold = hold;
    var r = region();
    if (r !== null) r.setAttribute('data-held', id);
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
    var run = target.closest('[data-run]');
    if (run !== null) {
      /* §W.8: a run's fallback is the near view's address for that run, the page the zoom would have reached (a page load, not a zoom the script performs, so §P.2 does not reach it). */
      var q = new URLSearchParams(w.location.search);
      q.set('wall', 'near');
      q.set('shelf', run.getAttribute('data-run') || '0');
      return { kind: 'run', id: run.getAttribute('data-run-first') || '', href: '/?' + q.toString() };
    }
    return null;
  }
  document.addEventListener('click', function (event) {
    if (hydrated()) return;
    var p = pressTarget(event.target);
    if (p === null) { if (hold !== null) clear(); return; }
    event.preventDefault();
    take(p.kind, p.id, p.href);
  }, true);
  document.addEventListener('keydown', function (event) {
    if (hydrated()) return;
    if (event.key === 'Enter' || event.key === ' ') {
      var p = pressTarget(event.target);
      if (p !== null) { event.preventDefault(); take(p.kind, p.id, p.href); return; }
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
