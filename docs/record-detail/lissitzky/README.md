# Two constructions, one frame

Both at 1440×900, no scroll, colour from the record's own cover. Drawn on
Luther Vandross · *Never Too Much* — the richest record in the collection.

- **`a-kunstismen-1440x900.png`** — upright type as structure, the colour as a
  locked block, orthogonal blocks at different scales locked edge to edge.
  Compatible with twelve columns.
- **`b-diagonal-1440x900.png`** — the 30° isometric angle as a cell BOUNDARY
  rather than an overlay: regions clipped to either side, content displaced into
  wedges, the fact column narrowing 560 → 430 → 300 → 160px as the wedge does.

Sources are beside them; re-render with the snippet in
`../fixed-frame/README.md`.

## Which carries more: A

B draws better than expected and does displace rather than overlay — nothing
crosses the boundary. But it costs two things that are not recoverable by
another pass:

1. **The twelve-column grid is gone, not bent.** Every cell is absolutely
   positioned; there are no column edges to hang rules on, so the entire
   6px/1px/absence system is absent. That is what a diagonal boundary costs.
2. **The widest part of the wedge is empty**, because content must clear the
   descending line — ~15% of a fixed frame drawing nothing, on top of the ~18%
   the always-present empty modules already spend.

And the referent is borrowed. The 30° angle is the WALL's identity — there,
spines are drawn at it because that is the projection. This screen has no
isometric content, so the line means "the other screen's angle".

**What makes A unmistakably this app is doing real work: the colour block is
derived from the cover**, so the field is that record's own hue. No other app has
that block, because no other app derives it from the artwork.

## Carry from B into A

B's fact column narrowing as it descends reads better than A's four equal bottom
cells, which are four boxes of identical weight — the tabular feel the design
keeps fighting. Ranking the lower band by width would help.

## Superseded

A first attempt laid a rotated bar over the finished layout. It overlapped
rather than displaced — obscuring labels, clipping the header, and `1981`
rotated read as a sticker where Lissitzky's letterforms are upright. Deleted
rather than kept: it demonstrated a mistake already recorded here.
