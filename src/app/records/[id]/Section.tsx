import { LABEL } from './grid-type';
import {
  CONTENT_X,
  GRID_TEMPLATE,
  MARK_HEIGHT,
  MARK_WIDTH,
  RAIL_X,
  SECTION_RULE,
  carriesMark,
  type SectionName,
} from './extended-grid';

/**
 * §9.1's section — the one structure every part of the extended grid uses.
 *
 * **The rail is the mechanism.** Above the fold twelve columns hold because
 * every cell has a fixed height; here nothing does, so what holds is a vertical
 * line: every label starts at the same x on every section, and a reader
 * scrolling past eight sections of wildly different heights sees one edge that
 * never moves. That is why a section can be 60px or 600px without the region
 * coming apart.
 *
 * **Height is content-derived at every level** — rail as tall as its label,
 * content as tall as its content, section as tall as the taller. A form that
 * grows pushes everything below it down. Nothing here is a band.
 */
export function Section({
  name,
  title,
  base,
  children,
}: {
  name: SectionName;
  title: string;
  /**
   * §5.5's base step for this record, or null when the record has no cover to
   * derive from. Null draws no bar — the ladder has no invented hue (§5.3).
   */
  base: string | null;
  children: React.ReactNode;
}) {
  return (
    <section
      data-section={name}
      /*
        **The boundary bleeds; the tracks indent.** §3 makes the distinction
        load-bearing — a full-bleed rule separates modules, an inset one
        separates things inside one module — and each section is a module. The
        rule is therefore on the section element itself, which spans the
        composition, rather than on the grid inside it.

        It is also the ONLY rule in the region: no cell verticals, because there
        are no cells, and no rule under the rail, which would make the rail a
        column and re-import the grid this region is not using.
      */
      style={{ borderTop: `1px solid ${SECTION_RULE}` }}
    >
      <div
        /*
          Five tracks, three of them spacers — not padding and not column-gap.
          Padding is excluded because the rule above must bleed past it; a gap
          is excluded because a spacer track and a gap both applying was a live
          defect, and the two compose silently at the wrong x.
        */
        className="grid"
        style={{ gridTemplateColumns: GRID_TEMPLATE, gap: 0 }}
      >
        {/* Track 1: spacer. The rail starts at 34. */}
        <div aria-hidden="true" />

        <div data-rail="" className="py-[18px]">
          <div className={LABEL}>{title}</div>

          {/*
            §9.3's bar: one base-step mark in the rail, under the label.

            **It sits in the rail because the rail is the constant** — the same
            colour arriving at the same x is what §5.5's distribution rule asks
            for, and what no single large mark can do.

            **Marked on the schema, not on the record.** A bar that appeared
            when a record had images and vanished when it did not would make the
            mark encode that fact, and nothing on this page encodes anything. So
            a control-only section keeps its bar: that section is still where
            this record's images go.
          */}
          {carriesMark(name) && base !== null && (
            <div
              data-mark="section-bar"
              className="mt-[10px]"
              style={{ width: MARK_WIDTH, height: MARK_HEIGHT, background: base }}
            />
          )}
        </div>

        {/* Track 3: spacer. Content starts at 284, the frame's text edge. */}
        <div aria-hidden="true" />

        <div data-content="" className="min-w-0 py-[18px]">
          {children}
        </div>

        {/* Track 5: spacer, so content does not run to the composition edge. */}
        <div aria-hidden="true" />
      </div>
    </section>
  );
}

/**
 * The region the sections stack in.
 *
 * **No max-width and no centring of its own.** The sections' rules bleed to the
 * composition's edge — the viewport up to the 1728 cap, the capped container
 * beyond it — and the frame above already establishes that measure. A wrapper
 * with its own width here would inset the rules and make the region's only
 * structural element the wrong kind of edge by §3's vocabulary.
 */
export function ExtendedGrid({ children }: { children: React.ReactNode }) {
  return <div data-region="extended-grid">{children}</div>;
}

/** Where the rail and content land, for tests that measure rather than read. */
export const SECTION_X = { rail: RAIL_X, content: CONTENT_X } as const;
