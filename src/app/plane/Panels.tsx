import type { FactPanel } from './panel';

/**
 * The panels that flank §10b's record (A19e).
 *
 * **DOM, not canvas, and that is a requirement rather than a preference.** A
 * canvas has no text, so these panels are the only channel a screen reader or a
 * test can read — the same distinction the spine already draws, where the
 * visible glyphs are clipped to fit and the accessible name carries the whole
 * title.
 *
 * **Static.** They do not track the record's geometry, do not move when it
 * moves, and never need to agree with the camera about anything. That property
 * is what makes them cheap, and it is why the reference does it this way.
 */

/**
 * The facts: artist, title, year, then whatever the record actually has.
 *
 * **Absence is ordinary and is omitted, not labelled.** Most records have no
 * purchase price, no store, no condition and no pressing — a panel of
 * mostly-empty labelled rows is the "form" failure that made the old back face
 * read badly, and `backFaceGroups` already drops a group whose fields are all
 * missing rather than printing a heading with nothing under it.
 */
export function FactsPanel({ panel }: { panel: FactPanel }) {
  return (
    <div data-testid="facts-panel" className="w-[280px] shrink-0 pt-2">
      <h3 className="font-heading text-lg leading-tight font-semibold text-foreground">
        {panel.title}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {/* The year joins the artist only when there is one — a heading ending
            in a dangling separator is the empty-label failure in miniature. */}
        {[panel.artist, panel.year].filter((part) => part !== null).join(' · ')}
      </p>

      {panel.groups.length === 0 ? (
        /*
          The honest empty state, and it is the FIRST state of most records:
          §10's quick in-store entry records a title and an artist and nothing
          else. Saying so beats inventing rows, and beats a blank column that
          reads as a rendering failure.
        */
        <p data-testid="facts-empty" className="mt-6 text-xs text-muted-foreground">
          Nothing else recorded about this pressing yet.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {panel.groups.map((group) => (
            <dl
              key={group.kind}
              data-testid={`facts-group-${group.kind}`}
              className={`grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1 ${
                /* Provenance is the owner's information, which a real sleeve
                   does not carry at all — so it is quieter and last. */
                group.kind === 'provenance' ? 'text-[11px]' : 'text-xs'
              }`}
            >
              {group.rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="tracking-wide text-muted-foreground uppercase">{row.label}</dt>
                  <dd className="font-mono text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The actions, given somewhere to belong.
 *
 * In the CSS version these floated at the bottom-left of the overlay, detached
 * from the object — one of the specific complaints when it was looked at. A
 * panel is where they belong: beside the record, static, not competing with it.
 *
 * **They do nothing in this unit.** Motion is the next unit and these are its
 * controls; wiring them now would smuggle behaviour into a unit whose whole
 * discipline is that nothing moves. They are here so the COMPOSITION can be
 * judged with them in place, which is the point of this gate.
 */
export function ActionsPanel() {
  return (
    <div data-testid="actions-panel" className="flex w-[180px] shrink-0 flex-col gap-2 pt-2">
      {['Turn over', 'Full details', 'Put back'].map((action) => (
        <button
          key={action}
          type="button"
          disabled
          data-testid={`action-${action.split(' ')[0].toLowerCase()}`}
          className="rounded-xs border border-border px-3 py-1.5 text-left text-sm text-muted-foreground"
        >
          {action}
        </button>
      ))}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Inert in this unit — motion is next.
      </p>
    </div>
  );
}
