'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PickAnswer } from './reroll';

/**
 * Target §P.3, step 156 unit 4: the rail's pick control and the wall are
 * siblings in `WallComposition`, and on the near view the answer is the
 * wall's pull. Each side registers its own half while mounted.
 */
/** A record the pick can serve, with what §T.5's cell draws. */
/* No moods since 14 Nov: the moods are retired (§P.2; Adam, 14 Nov) and nothing read the set the page loaded for each record. */
/** A pool's record; as an answer it carries the pick's reason (§P.2, unit 3a), which a pool row and a SURPRISE ME draw do not. */
export type PickRecord = { id: string; title: string; artist: string; cover: string | null; reason?: string | null; consolation?: boolean };

/** What an ask carries with the record it names (§P.2): the pick's reason, and whether the record is a consolation beside a nothing-fits message. */
export type AskCarry = { reason: string | null; consolation: boolean };

/**
 * Where the far view's cell stands (§P.4): `here`, beneath the control, in
 * the band host; `count-column`, beneath the count, where the rail draws as
 * a column (`P.4/column-cell-drawing-pays`). The wall knows which, so the
 * answer carries it.
 */
export type CellHost = 'here' | 'count-column';

/**
 * What the wall did with an ask: §P.3's answers where the view can pull, or
 * `cannot-pull` where the reader is on the far view, whose answer is §P.4's
 * cell (§P.1), drawn at `host`.
 */
export type WallAnswer = { did: PickAnswer['kind'] | 'cannot-pull'; host: CellHost | null };

export type PickChannel = {
  /** The control asks for the record the pick names, with the pick's reason where it has one (§P.2, unit 3a); the wall says what it did, and with no wall listening nothing moves. */
  ask: (named: string | null, carry?: AskCarry) => WallAnswer;
  /** The wall answers asks while mounted; the returned function stops it. */
  answerAsks: (answer: (named: string | null, carry: AskCarry) => WallAnswer) => () => void;
  /** The control hands the wall the cells to draw in the count column, the nearest first, up to five (§P.4, 3b), or none; the wall draws them only on the far view. */
  showCells: (records: readonly PickRecord[]) => void;
  /** The wall hears cells while mounted; the returned function stops it. */
  hearCells: (hear: (records: readonly PickRecord[]) => void) => () => void;
  /** The wall tells of every record that comes out, by an ask, its spine or the arrows, since §P.2 counts each as served. */
  pulled: (id: string) => void;
  /** The control hears what comes out while mounted; the returned function stops it. */
  hearPulls: (hear: (id: string) => void) => () => void;
  /** The wall tells when the reader moves between the near and far views: "an answer already drawn ends with the view it was drawn in" (§P.2, 27 Oct). */
  viewChanged: () => void;
  /** The control hears view changes while mounted; the returned function stops it. */
  hearViews: (hear: () => void) => () => void;
  /**
   * Whether an answer here would be a pull (§P.2, 12 Nov: the count is keyed to the answer's form, one as a pull and
   * five as cells, never to the view's name). The wall says: true on the near view, false on the far view, null while
   * no view is settled or no wall listens, which the control reads as cells.
   */
  pulls: () => boolean | null;
  /** The wall answers the question while mounted; the returned function stops it. */
  answerPulls: (answer: () => boolean | null) => () => void;
};

const Channel = createContext<PickChannel | null>(null);

export function PickChannelProvider({ children }: { children: ReactNode }) {
  const [channel] = useState<PickChannel>(() => {
    let answer: ((named: string | null, carry: AskCarry) => WallAnswer) | null = null;
    let hear: ((id: string) => void) | null = null;
    let hearView: (() => void) | null = null;
    let hearCell: ((records: readonly PickRecord[]) => void) | null = null;
    let pulls: (() => boolean | null) | null = null;
    return {
      ask: (named, carry = { reason: null, consolation: false }) => answer?.(named, carry) ?? { did: 'ignore', host: null },
      pulls: () => pulls?.() ?? null,
      answerPulls: (next) => {
        pulls = next;
        return () => {
          if (pulls === next) pulls = null;
        };
      },
      answerAsks: (next) => {
        answer = next;
        return () => {
          if (answer === next) answer = null;
        };
      },
      pulled: (id) => hear?.(id),
      hearPulls: (next) => {
        hear = next;
        return () => {
          if (hear === next) hear = null;
        };
      },
      showCells: (records) => hearCell?.(records),
      hearCells: (next) => {
        hearCell = next;
        return () => {
          if (hearCell === next) hearCell = null;
        };
      },
      viewChanged: () => hearView?.(),
      hearViews: (next) => {
        hearView = next;
        return () => {
          if (hearView === next) hearView = null;
        };
      },
    };
  });
  return <Channel.Provider value={channel}>{children}</Channel.Provider>;
}

export function usePickChannel(): PickChannel | null {
  return useContext(Channel);
}
