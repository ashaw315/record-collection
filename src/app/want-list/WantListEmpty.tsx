import type { ReactNode } from 'react';

/**
 * The want list's empty state (§T.6, step 112's last).
 *
 * "The want list carries LOOK UP A RECORD... in its heading's row, in both
 * states, and its empty state adds none." So this is the figure and one
 * sentence: the source record's construction in ink at its clearing height
 * and no larger, as look up's is, and "Nothing on the want list yet. Look
 * up a record to add one." The Acquired view keeps its own sentence, which
 * is not ruled; its whole list is empty too, so it has the figure.
 *
 * A component of its own because the browser tests cannot stage an empty
 * want list on a database the other worker fills.
 */
export function WantListEmpty({ acquired, figure }: { acquired: boolean; /** None where the collection is empty: there is no source record. */ figure: ReactNode }) {
  return (
    <div data-want-list-empty="" className="flex flex-col items-center gap-[18px] py-12 text-center">
      {figure}
      <p className="text-detail" style={{ color: 'oklch(0.44 0.008 70)' }}>
        {acquired ? 'Nothing acquired yet.' : 'Nothing on the want list yet. Look up a record to add one.'}
      </p>
    </div>
  );
}
