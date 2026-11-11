/**
 * **§T.6, the row's entry reopens it (Design, 11 Nov; step 177).** "The row’s entry names the row it opened, and landing
 * on it opens that row with its saved values: by Forward after a close, and after a reload with the row open." Step 174
 * pushed one entry per open row and popped it on close; this names what the entry carries and what a list does when the
 * browser lands on one. Unsaved edits are never restored: the entry holds the row's id, never a draft.
 */
export type RowEntry = { manageRow: string; manageSection: string };

/** The entry a row's opening pushes: the row and the section it is in, so a landing from another section can find it. */
export function rowEntry(id: string, section: string): RowEntry {
  return { manageRow: id, manageSection: section };
}

export type Landing =
  /* Not a row's entry: the base, the header menu's, anything else. */
  | { kind: 'none' }
  /* This section's row, in the list: open it with its saved values. */
  | { kind: 'open'; id: string }
  /* This section's row, gone: "replace the entry and stay closed." */
  | { kind: 'replace' }
  /* Another section's row: the screen changes section, and that section's list lands on the entry. */
  | { kind: 'elsewhere'; section: string };

/** What an entry asks of the list that lands on it. An entry from before the section was stored is read as this section's. */
export function landing(state: unknown, section: string, rows: readonly { id: string }[]): Landing {
  if (typeof state !== 'object' || state === null) return { kind: 'none' };
  const { manageRow, manageSection } = state as { manageRow?: unknown; manageSection?: unknown };
  if (typeof manageRow !== 'string') return { kind: 'none' };
  if (typeof manageSection === 'string' && manageSection !== section) return { kind: 'elsewhere', section: manageSection };
  return rows.some((row) => row.id === manageRow) ? { kind: 'open', id: manageRow } : { kind: 'replace' };
}
