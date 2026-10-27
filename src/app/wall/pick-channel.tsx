'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PickAnswer } from './reroll';

/**
 * Target §P.3, step 156 unit 4: the rail's pick control and the wall are
 * siblings in `WallComposition`, and on the near view the answer is the
 * wall's pull. Each side registers its own half while mounted.
 */
/** A record the pick can serve, with what §T.5's cell draws. */
export type PickRecord = { id: string; title: string; artist: string; cover: string | null; moods: readonly string[] };

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
  /** The control asks for the record the pick names; the wall says what it did, and with no wall listening nothing moves. */
  ask: (named: string | null) => WallAnswer;
  /** The wall answers asks while mounted; the returned function stops it. */
  answerAsks: (answer: (named: string | null) => WallAnswer) => () => void;
  /** The control hands the wall the cell to draw in the count column, or none; the wall draws it only on the far view. */
  showCell: (record: PickRecord | null) => void;
  /** The wall hears cells while mounted; the returned function stops it. */
  hearCells: (hear: (record: PickRecord | null) => void) => () => void;
  /** The wall tells of every record that comes out, by an ask, its spine or the arrows, since §P.2 counts each as served. */
  pulled: (id: string) => void;
  /** The control hears what comes out while mounted; the returned function stops it. */
  hearPulls: (hear: (id: string) => void) => () => void;
  /** The wall tells when the reader moves between the near and far views: "an answer already drawn ends with the view it was drawn in" (§P.2, 27 Oct). */
  viewChanged: () => void;
  /** The control hears view changes while mounted; the returned function stops it. */
  hearViews: (hear: () => void) => () => void;
};

const Channel = createContext<PickChannel | null>(null);

export function PickChannelProvider({ children }: { children: ReactNode }) {
  const [channel] = useState<PickChannel>(() => {
    let answer: ((named: string | null) => WallAnswer) | null = null;
    let hear: ((id: string) => void) | null = null;
    let hearView: (() => void) | null = null;
    let hearCell: ((record: PickRecord | null) => void) | null = null;
    return {
      ask: (named) => answer?.(named) ?? { did: 'ignore', host: null },
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
      showCell: (record) => hearCell?.(record),
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
