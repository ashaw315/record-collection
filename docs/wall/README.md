# The wall overview at true size

Captured from `/wall/overview` at 1440px viewport width, 1× device pixels,
2026-09-12 — the first rendering of §10b's wall at the wall's own proportions
rather than at a drawing's convenience scale.

- `overview-17.png` — the collection, 17 records
- `overview-200.png` — 200 records, five shelves of forty

**Why these are committed.** Every previous conclusion about wall density came
from drawings at scales that turned out not to be the wall's: the design file
drew at a 120px spine, adopted it as a constant, reasoned from it, and concluded
the wall carries no labels. These are the first evidence at true size, and the
route that produced them is deleted when the wall lands — so the artefact would
otherwise go with it.

**What they caught.** Three geometry defects invisible to every count-based
test: shelf outlines floating below the spines, sagging in proportion to run
length rather than depth, and drawing behind rather than beneath. Fixed in
`c5ce6ab`. The 200-record frame also confirms the density work's staircase
reading — five distinct bands, roughly two-thirds empty.

The `.dc.html` design artefacts these supersede are deliberately not in the
repo; SPEC.md is self-contained and a link to a file outside it rots while the
document claims it is still good.
