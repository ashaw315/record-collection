# Step 15 unit 4 (continued) — the card becomes a summary, and the record gets the room

Baseline: unit 4's uncommitted work. At `/plane` until the rule is settled, then `/`.

---

## The decision, and why it resolves the sizing question

The three candidates all reserve a fraction of the frame for the facts card. On the phone that
reservation is a guess about content: the seeded record's card is three lines and leaves a
large void, while a fully-documented record — label, catalogue number, pressing year and
plant, condition, purchase price and store — would overflow the same space.

**So the card becomes a summary: artist, title, year, and a tap for the rest.** Its height is
then a constant rather than a function of how much is recorded, the reservation stops being a
guess, and the record takes everything else.

**The tap goes to `/records/[id]`**, not a modal. That page already carries the full facts, the
journal, prices, images and the snippet, and a modal would be a second surface showing the
same data and drifting from it — the two-producers shape this project has recorded three
times.

**Same on desktop.** Two information densities for one object is a fork that has to be
maintained, and the desktop panel becomes the same summary. This is a change to §10b, which
currently specifies the flanking panel as the readable channel for every fact — that
amendment gets written once the shape is judged, not before.

---

## What this unit answers

**1. Where the record stops reading as an object.** A is 90% of frame width and Adam's read is
"at least A, possibly bigger". Render 95% and 100% alongside it. At some point a record in a
space becomes a full-bleed image, and that boundary is a looking question.

**2. Whether the summary card changes the answer.** With a constant card height, the
candidates are no longer competing on how much room to reserve — they are competing on how big
the record should be given a known, small reservation. Re-derive rather than re-tuning: the
old candidates were answers to a question that no longer exists.

**3. What the summary contains.** Artist, title, year is the proposal. Worth checking against
what a spine already carries — artist, title and catalogue number are on the spine itself, so a
summary repeating them exactly adds nothing. Say what you chose and why.

---

## What must not be lost

- **`/records/[id]` must be reachable by tap**, and the affordance must read as one. A card
  that navigates without looking tappable is worse than a visible link.
- **The keyboard path is unchanged** — the accessible list already links every record to its
  detail page, and this is now the same destination by a different route. That is a consistency
  worth noting rather than a coincidence.
- **Nothing about the wall itself changes.** Colour, legibility, ordering, the emptied slot.
- **`viewportAspect` stays out of the live scene** until the aspect decision lands.

---

## The aspect decision, still open and now blocking less

The wall needs the canvas ratio; the pulled record needs the viewport ratio; one camera serves
both. **Adam's steer: solve the record's destination against the viewport, leave the camera on
the canvas ratio.** Two cameras is two systems agreeing about one scene, which has failed here
every time; clamping the canvas rewrites the part that works and the render proved a viewport
aspect insets the wall, breaking A24a.

Build that after the size rule is chosen, since the destination arithmetic is what changes.

---

## Tests

The summary card's height being constant is the load-bearing claim, so **assert it against
both extremes**: a record with nothing recorded beyond artist/title/year, and one with every
optional field populated. If those two produce different card heights, the reservation is still
a guess and the size rule is still wrong. That is the discriminating fixture and neither
existing candidate has one.

The size rule itself is arithmetic — frame in, record dimensions out — and belongs in a pure
function tested directly.

**Do not assert on the caption.** This unit has already been caught by a page that told the
truth in text and a lie in pixels; the assertion measures what is rendered.

---

## Screenshots

1. A, 95% and 100% at 390px, each with the summary card.
2. The chosen size with a sparse record and with a fully-populated one, side by side.
3. Desktop at 1280 with the summary card, to see whether it reads as impoverished there.

---

## Report

1. **Where does the record stop reading as an object?** Frames, and your own read alongside.
2. **What does the summary contain, and why not the spine's three fields verbatim?**
3. **Does the card height hold constant across both extremes?** Numbers.
4. **Does the desktop panel as a summary read as a loss?** This is the half most likely to be
   worse, and saying so is more useful than defending it.

Then stop. Adam judges on the phone before anything is committed or §10b is amended.
