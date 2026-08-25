# SPEC.md amendment A24 — the shelf is a view, not a section

Follow-up to `7729975`. This is the largest §10b amendment since A19.

**Anchors could not be extracted by execution** — SPEC.md has moved since my last copy. The
quoted text is from A22/A23-era §10b. **If any anchor does not match, stop and quote what is
there**; several of these paragraphs have been rewritten more than once.

---

## Why

Unit 20 made the wall full-bleed and QA showed it is still not a wall. The diagnosis found
three causes, and only one of them is a number:

1. **The geometry test was vacuous.** `[data-testid="shelf"]` is an invisible wrapper — a
   block element fills its parent's width by definition, so the assertion was true before the
   change and true of any block element in that position. The offset half of the test bites;
   the width half never could.
2. **The 40% floor now means something else.** It was calibrated against a 1152px content
   column, where 40% was 461px. On a full-bleed parent it is 40% of the viewport, so at five
   records the wall is 499px of empty timber with 133px of spines at one end. The rule is
   doing exactly what §10b asks and asking the wrong thing.
3. **The wall is the last item on a page of chrome.** Search, sort and four rows of filter
   chips occupy more vertical space than the wall does. No width fix changes that.

The third is the one that decides the others. The reference makes the point plainly: its
closet **owns the window**, with a small floating search pill, a view toggle, and nothing else
competing. Everything else is the world.

---

## A24a — §10b: the shelf view owns the viewport

**ADD as the first bullet of "The shelf", before "Records stand as spines on shelves that
wrap":**

> - **The shelf is a view that owns the screen, not a section of a page.** Below the nav there is the wall and nothing else. Search and the filter chips are reachable from it — as an overlay, opened when wanted — but they do not sit above the wall taking vertical space from it, because a wall that arrives under four rows of controls is a strip rather than a wall.
>
>   This is the one structural thing borrowed wholesale from the reference: its closet is the window, with a compact floating search control and a view toggle over the top of it. `?view=table` and `?view=grid` keep their filters on the page, unchanged — a list genuinely wants its controls visible, and this rule is about the wall.

---

## A24b — §10b: square on, and vertical scroll only

**ADD immediately after A24a's bullet:**

> - **The wall is viewed square on and scrolls vertically.** Every spine is at the same angle and equally legible; there is no camera, no perspective on the wall itself, and no horizontal pan. Rows wrap and the wall grows downward, as a bookcase does.
>
>   **This is where the reference is deliberately not followed.** Criterion's closet is a *room* — a camera in 3D space, shelves receding at an angle, and looking around means moving the camera. It is beautiful and it costs legibility: spines toward the edges are foreshortened and hard to read. This wall exists to be scanned by eye, and §10b requires artist, title and catalogue number on every spine, so a raking angle would defeat the feature that makes the wall useful. A room is something you stand in; a wall is something you read.
>
>   The consequence worth stating, because it governs the pulled record too: the wall stays flat, so the only 3D in this feature is the record you pull out of it.

---

## A24c — §10b: the floor, in its new context

**REPLACE:**

> - **A shelf is no wider than it needs and no shorter than a shelf.** It fits its records, growing as they do and wrapping when they exceed a row — but it has a minimum length, because a shelf is furniture and has a length whether or not it is full. A real shelf with five records on it is still a shelf with space beside them. Both neighbouring rules are wrong on their own: a shelf stretched to the full viewport with five spines at the left reads as *missing data* rather than as a short collection, because the emptiness is the whole viewport and implies a collection that should have filled it; a shelf shrunk to its contents reads as a *thumbnail of a shelf*. The minimum is about 40% of the content column, chosen by rendering the candidates at five records and looking.

**WITH:**

> - **A shelf has a length whether or not it is full.** It is furniture: a real shelf with five records on it is still a shelf with space beside them, and a shelf shrunk to its contents reads as a thumbnail rather than as a shelf.
>
>   **The minimum was 40% of the content column, and that number does not survive the view owning the screen.** It was chosen by rendering candidates at five records in a 1120px column and looking; on a full-bleed parent the same rule yields 499px of empty timber with 133px of spines at one end, which is the *missing data* reading it was written to prevent, arriving through the rule rather than despite it.
>
>   Re-derive it in the new context by the same instrument — render the candidates at a real collection size against a viewport-owning wall, and look. What the rule protects has not changed: a short collection must read as short, not as broken. What "short" looks like against a whole screen is a different measurement, and this section states the rule rather than the number until it has been taken.

---

## A24d — §10b: filtering leaves gaps

**ADD after the "No section headings" paragraph:**

> **A filtered wall keeps its shape and shows gaps.** Filtering does not repack the spines into a tight row: each record stays where it was, and what is left is holes in the wall where the others were. A wall of five spines packed at the left is indistinguishable from a collection of five records; the same five scattered across a wall of empty shelf says plainly that most of the collection is hidden.
>
> This is the absent-versus-unknown distinction (§10a, and the rule this project keeps meeting) applied to a layout: the gaps are the feedback. The filter chips already carry the counts, and `?view=table` shares the same URL state, so the numeric answer is available in both views without the wall having to state it.

---

## A24e — §10b: the CSS shelf, restated

**REPLACE:**

> **Rendered in 2D with CSS perspective, not a 3D engine.** Criterion's wall is `three.js`; this gets most of the feel from transforms and shadows for a fraction of the work and no new dependency. If it turns out to be worth more, that is a later decision made with the flat version in front of us.

**WITH:**

> **The wall is CSS, and that is now a design decision rather than a cost decision.** The original reasoning was that transforms and shadows get most of the feel for a fraction of the work. The better reasoning arrived from A24b: the wall is viewed square on, so there is no perspective to render and nothing for a 3D engine to do. Criterion's wall is `three.js` because it is a room; this is a flat wall, and CSS is what a flat wall is made of.
>
> The pulled record is the exception and is rendered in `three.js` (below).

---

## Verify

```
grep -n "40%\|content column\|viewport" SPEC.md
grep -n "perspective\|camera\|square on" SPEC.md
grep -n "filter\|chips" SPEC.md
```

Report the count and classification for each. Then read §10b end to end and answer: **does it
now describe one view — what owns the screen, how it is viewed, how it scrolls, and what
happens when it is filtered — or are there sentences left over from the shelf being a section
of the collection page?**

Pay particular attention to anything describing the shelf's width in terms of a content
column, and to §10's screens table, which describes `/` as one screen with three views.

## Commit

```
git add SPEC.md
git commit -m "SPEC: A24, the shelf is a view that owns the screen"
```

Then stop. The implementation is a separate unit.
