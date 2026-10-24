/**
 * SPEC.md §7.12 (A76): the eight moods, fixed in code as plain text.
 *
 * No table and no ids, because the list is Adam's to change and a change
 * re-runs the tagging script; a stored set naming a renamed mood is redone by
 * hand. Not `server-only`: the mood control will render this list.
 */
export const MOODS = [
  'sleepy',
  'jacked up',
  'dancing',
  'zone out',
  'smooth',
  'loud and dirty',
  'showing off',
  'sunny',
] as const;

export type Mood = (typeof MOODS)[number];

/** §4.5's CHECK holds the same bound; this is where a reply is judged against it. */
export const MAX_MOODS_PER_RECORD = 4;
