/**
 * The app's identity, sent on every Discogs request.
 *
 * §6 requires a descriptive User-Agent — "Discogs rejects requests without one"
 * — and the point of the contact half is to give Discogs somewhere to look when
 * they want to reach whoever is making the requests. Discogs also throttles
 * unidentified traffic harder, so a header that names nobody costs more than
 * politeness.
 *
 * **The composition mirrors MusicBrainz's**, deliberately: name and version are
 * literals because they describe this codebase and change with it, while the
 * CONTACT comes from the environment because it is the part that can change
 * without the code changing. A header whose purpose is to identify you to the
 * party who may ask you to change it is the wrong thing to be able to change
 * only by deploying.
 *
 * **Optional rather than required**, which is where it differs from
 * MUSICBRAINZ_CONTACT_EMAIL. That one has no correct default — MusicBrainz wants
 * a way to reach a person — so it fails at point of use. This one does: the
 * public repository is a real contact for this app, so an unset variable gets a URL
 * that resolves rather than blocking a deploy over a value most deployments will
 * never override.
 */
const APP_NAME = 'RecordCollection';
const APP_VERSION = '0.1';

/**
 * The repository, and it must RESOLVE.
 *
 * R6 measured the previous value: `adamshaw/record-collection` returns 404 and
 * `ashaw315/record-collection` returns 200. A 404 here is not a cosmetic defect
 * — it is the header claiming to offer a contact and offering nothing, which is
 * worse than a bare name because it looks answered.
 */
const DEFAULT_CONTACT = 'https://github.com/ashaw315/record-collection';

/**
 * `Name/version +contact`, the form Discogs' own examples use.
 *
 * A whitespace-only override is treated as absent rather than emitted, so a
 * `DISCOGS_CONTACT=` line in a deploy config cannot produce a header ending in
 * a dangling `+` — the same "empty means unset" rule the env schema applies.
 */
export function buildUserAgent(contact?: string): string {
  const trimmed = (contact ?? '').trim();
  const resolved = trimmed === '' ? DEFAULT_CONTACT : trimmed;

  return `${APP_NAME}/${APP_VERSION} +${resolved}`;
}
