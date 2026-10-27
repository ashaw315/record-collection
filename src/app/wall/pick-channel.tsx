'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PickAnswer } from './reroll';

/**
 * Target §P.3, step 156 unit 4: the rail's pick control and the wall are
 * siblings in `WallComposition`, and on the near view the answer is the
 * wall's pull. Each side registers its own half while mounted.
 */
export type PickChannel = {
  /** The control asks for the record the pick names; the wall says what it did, and with no wall listening nothing moves. */
  ask: (named: string | null) => PickAnswer['kind'];
  /** The wall answers asks while mounted; the returned function stops it. */
  answerAsks: (answer: (named: string | null) => PickAnswer['kind']) => () => void;
  /** The wall tells of every record that comes out, by an ask, its spine or the arrows, since §P.2 counts each as served. */
  pulled: (id: string) => void;
  /** The control hears what comes out while mounted; the returned function stops it. */
  hearPulls: (hear: (id: string) => void) => () => void;
};

const Channel = createContext<PickChannel | null>(null);

export function PickChannelProvider({ children }: { children: ReactNode }) {
  const [channel] = useState<PickChannel>(() => {
    let answer: ((named: string | null) => PickAnswer['kind']) | null = null;
    let hear: ((id: string) => void) | null = null;
    return {
      ask: (named) => answer?.(named) ?? 'ignore',
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
    };
  });
  return <Channel.Provider value={channel}>{children}</Channel.Provider>;
}

export function usePickChannel(): PickChannel | null {
  return useContext(Channel);
}
