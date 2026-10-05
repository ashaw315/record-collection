/**
 * **Specs that screenshot into `docs/captures/` write only when asked.**
 *
 * `no-cover-54` and `images-row-56` wrote into fixed, committed paths on
 * every run, so every gate rewrote eighteen of the captures the record
 * detail closed on with pictures of a later build. A capture is evidence for
 * a decision; a test run is not a decision to replace it. Set
 * `WRITE_CAPTURES=1` to write them on purpose, and send new evidence to new
 * paths beside the old. `test/repo/captures-unchanged.test.ts` fails if any
 * committed capture differs from HEAD, which catches a writer that does not
 * use this switch.
 */
export const WRITE_CAPTURES = process.env.WRITE_CAPTURES === '1';
