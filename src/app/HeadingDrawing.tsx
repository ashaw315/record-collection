import { recordLadder } from '@/lib/colour/record-ladder';
import { figureWithSolids } from './figure-solids';
import { ConstructionStill } from './records/[id]/ConstructionStill';
import { construction } from './records/[id]/construction';
import { slackAlignment } from './records/[id]/own-fit';

const points = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/**
 * Step 110, §T.6: the heading's figure, the source record's construction
 * in ink with "up to three of §26's isometric boxes, each faced in its
 * record's tint, top, base and shade, from the first three records the
 * screen shows", in one row to its right on its ground line.
 *
 * One drawing in one box, so it "scales as one set of proportions". "A
 * record without colour gives no solid": the solids that are drawn close
 * up from the left in the page's order, and the box keeps its three places
 * whatever is drawn, so the figure does not change size with the page. The
 * faces are §26's as `OrnamentMarks` draws them: base on the left, shade on
 * the right, top last.
 */
export function HeadingDrawing({ recordId, shown }: { recordId: string; shown: ReadonlyArray<{ id: string; spineColour: string | null }> }) {
  const figure = figureWithSolids(construction(recordId));
  const coloured = shown.flatMap((record) => {
    const ladder = recordLadder(record.spineColour);
    return ladder === null ? [] : [{ id: record.id, ladder }];
  });
  return (
    <svg data-heading-drawing="" viewBox={figure.viewBox.join(' ')} preserveAspectRatio={slackAlignment(recordId)} className="block h-full w-full" aria-hidden="true">
      <ConstructionStill recordId={recordId} spineColour={null} placed={figure.construction} />
      {coloured.slice(0, figure.slots.length).map(({ id, ladder }, i) => (
        <g key={id} data-solid={id}>
          <polygon data-face="base" points={points(figure.slots[i].base)} fill={ladder.base} />
          <polygon data-face="shade" points={points(figure.slots[i].shade)} fill={ladder.shade} />
          <polygon data-face="top" points={points(figure.slots[i].top)} fill={ladder.top} />
        </g>
      ))}
    </svg>
  );
}
