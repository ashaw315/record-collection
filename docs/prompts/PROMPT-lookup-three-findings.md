# Three findings in the Discogs lookup — diagnose before fixing

Found by using the app on production, searching for a Doors pressing. Screenshot attached.
**Diagnose all three before fixing any of them** — the first two may share a cause.

---

## 1. The format line is truncated, and it drops the most discriminating field

The card renders `Vinyl · LP · Album · Reissue · Stereo`. The real value on release
`r2100475` is `Vinyl, LP, Album, Reissue, Stereo, Specialty Records Corporation Pressing`.

Discogs' `formats` array carries `descriptions` (the list) and a separate `text` field holding
a free-text qualifier. The plant descriptor lives in `text`, and it is being dropped.

**That qualifier is the single most discriminating thing Discogs gives at list level** — it is
why two cards on my screen look identical when they are not.

Check whether this is the same field NOTES already records costing a round: `format.text` has
bitten this project before. If it is the same one, say so — a defect returning is different
from a new one.

---

## 2. "Compare pressings" shows a set that excludes every candidate on the page

The expanded panel lists 25 versions, all dated 1967, spanning NZ, UK, Canada and South Korea.
My record is not among them, and neither are the other two candidates the search returned.

It appears to be pulling the master's version list unfiltered rather than the releases relevant
to the candidate. **So at the exact moment the tool exists to discriminate, it shows a list
that contains none of the options.**

This is a defect, not tuning. It may share a cause with (1) — both are about what the versions
payload contains versus what is read from it — so diagnose them together before concluding
they are separate.

---

## 3. The header copy asserts something false

> "Catalog number or barcode pins down the exact pressing"

This record disproves it: 24 US results on one catalogue number. **Catalogue number narrows;
the matrix pins.** The app is being confidently wrong about the thing CLAUDE.md §8 names as
mattering most — a pressing is not an album, and telling the user a cat number identifies a
pressing is the invented-certainty failure in copy rather than in data.

Smallest fix of the three, and the one where being wrong is worst.

---

## How to diagnose

**Measure against the real payload, not against a fixture.** Fetch the actual Discogs response
for the Doors search and for `r2100475`, and compare what the API returns against what the card
renders, field by field. The suite blocks live calls by design, so this is a deliberate
out-of-band measurement — say clearly which of your evidence came from live data and which from
fixtures.

**Then say whether (1) and (2) share a cause.** They may both be a parser reading one field and
ignoring another. If they are independent, say why.

---

## Report before fixing

1. **What the API actually returns** for the format field and the versions list, against what
   is rendered.
2. **Whether (1) and (2) share a cause.**
3. **Whether (1) is the same `format.text` defect NOTES already records**, or a different one.
4. **What the header copy should say instead** — it needs to be true about how catalogue
   numbers behave, without becoming a paragraph.
5. Anything the live payload shows that contradicts what the code assumes.

Then stop. I want the diagnosis before any of it is fixed, and the fixes may want to be
separate commits.

---

## Context worth knowing

These three are unit-sized defects in something that exists. There is a larger redesign under
discussion — two-phase resolution using matrix strings, an `unresolved` confidence state,
storing identification evidence — but **that is a step, not this unit**. Do not start it. If
anything you find here bears on it, record the finding rather than acting on it.
