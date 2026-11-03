/**
 * §4.2: release_year is the album's original year, not this pressing's. Every writer of it wrote
 * the pressing's until 2 Nov, so a reissue's record reads as new as its pressing, and the record
 * page says "Released · same year" of it, which is false.
 *
 * Pure: what to do with one record given its master's year. The write rule holds the line at what
 * the writers set wrongly. A reissue whose year is empty or equals the pressing's is theirs and is
 * written. A reissue whose year differs from the pressing's was set by a person and stands. A
 * non-reissue's year is right if its flag is, so a master that disagrees is a finding about the
 * flag, reported and not written. No answer from the master changes nothing.
 */
export type Row = {
  id: string;
  title: string;
  isReissue: boolean;
  releaseYear: number | null;
  yearPressed: number | null;
  masterId: number | null;
};

export type Verdict =
  | { kind: 'write'; year: number }
  | { kind: 'right' }
  | { kind: 'hand-set-differs'; master: number }
  | { kind: 'flag-suspect'; master: number }
  | { kind: 'no-answer' }
  | { kind: 'no-master' };

export function classify(row: Row, masterYear: number | null): Verdict {
  if (row.masterId === null) return { kind: 'no-master' };
  if (masterYear === null) return { kind: 'no-answer' };
  if (masterYear === row.releaseYear) return { kind: 'right' };
  if (!row.isReissue) return { kind: 'flag-suspect', master: masterYear };
  if (row.releaseYear !== null && row.releaseYear !== row.yearPressed) return { kind: 'hand-set-differs', master: masterYear };
  return { kind: 'write', year: masterYear };
}

export type Summary = {
  /** Records whose page claims "Released · same year" and whose master says otherwise: the false statement the backfill removes. */
  falseSameYear: Row[];
  write: Array<Row & { year: number }>;
  /** Wrong, by the master, and out of scope: a flag's claim or a person's value. A separate decision. */
  outOfScope: Array<Row & { verdict: Verdict }>;
  right: Row[];
  noAnswer: Row[];
  noMaster: Row[];
};

export function summarise(rows: readonly Row[], masterYears: ReadonlyMap<string, number | null>): Summary {
  const s: Summary = { falseSameYear: [], write: [], outOfScope: [], right: [], noAnswer: [], noMaster: [] };
  for (const row of rows) {
    const v = classify(row, masterYears.get(row.id) ?? null);
    const sameYearClaim = row.releaseYear !== null && row.releaseYear === row.yearPressed;
    if (v.kind === 'write') {
      s.write.push({ ...row, year: v.year });
      if (sameYearClaim) s.falseSameYear.push(row);
    } else if (v.kind === 'hand-set-differs' || v.kind === 'flag-suspect') s.outOfScope.push({ ...row, verdict: v });
    else if (v.kind === 'right') s.right.push(row);
    else if (v.kind === 'no-answer') s.noAnswer.push(row);
    else s.noMaster.push(row);
  }
  return s;
}
