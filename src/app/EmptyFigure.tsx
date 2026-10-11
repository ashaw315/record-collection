import { ConstructionStill } from './records/[id]/ConstructionStill';
import type { FigureSource } from './figure-source';

/**
 * §T.6: "The empty state's figure is this construction in tint at the
 * clearing height", drawn "at the clearing height and no larger" from the
 * one source record. One component for every screen with an empty state,
 * so none can draw it in ink by passing no colour, as look up and the want
 * list did until step 122 (`T.6/ink-construction` had withdrawn the
 * figures in ink alone). A source with no cover has no colour and is ink
 * (§5.3); a collection with no records has no source and no figure.
 */
export function EmptyFigure({ source, tint }: { source: FigureSource | null; /** The source record's own colour; `null` where it has no cover. */ tint: string | null }) {
  if (source === null) return null;
  return (
    <div data-tint={tint ?? ''} style={{ height: source.clearing, width: source.clearing * source.aspect }}>
      <ConstructionStill recordId={source.id} spineColour={tint} />
    </div>
  );
}
