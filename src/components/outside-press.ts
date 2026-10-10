/** The parts of an event and of the document the rule reads, so it can be tested on stubs. */
export type PressEvent = { target: unknown; timeStamp: number; stopPropagation: () => void; preventDefault: () => void };
type PressDocument = {
  addEventListener: (type: 'touchstart' | 'click', listener: (event: PressEvent) => void, options?: { capture?: boolean; passive?: boolean }) => void;
  removeEventListener: (type: 'touchstart' | 'click', listener: (event: PressEvent) => void, options?: { capture?: boolean }) => void;
};

/** How long after a finger comes down its click is still taken to be that finger's. */
const TAP_MS = 1_000;

/**
 * §T.3's close set (step 106): "a tap anywhere outside the list's rows"
 * closes, "an option row's hit area ends at the row's drawn edge", and "a
 * press that closes the panel does nothing else".
 *
 * A click is judged by where the press LANDED, which for a finger is where
 * the touch began and not where the click arrived: WebKit hands a tap on
 * the sheet's inset to the option row beside it, so the click's own target
 * says the row was pressed when the finger was 12 off it. A press outside
 * closes, and is stopped in the capture phase and cancelled, so no link,
 * control or handler beneath answers it. A drag ends in no click, so "a tap
 * closes and a drag scrolls" is the platform's own tap slop.
 */
export function closeOnOutsidePress(doc: PressDocument, inside: (node: unknown) => boolean, close: () => void): () => void {
  let finger: { at: number; inside: boolean } | null = null;
  const onTouch = (event: PressEvent) => {
    finger = { at: event.timeStamp, inside: inside(event.target) };
  };
  const onClick = (event: PressEvent) => {
    const landed = finger !== null && event.timeStamp - finger.at < TAP_MS ? finger.inside : inside(event.target);
    finger = null;
    if (landed) return;
    event.stopPropagation();
    event.preventDefault();
    close();
  };
  doc.addEventListener('touchstart', onTouch, { capture: true, passive: true });
  doc.addEventListener('click', onClick, { capture: true });
  return () => {
    doc.removeEventListener('touchstart', onTouch, { capture: true });
    doc.removeEventListener('click', onClick, { capture: true });
  };
}
