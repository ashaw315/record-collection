# The record detail under the fixed-frame constraint

**`frame-1440x900.png`** — the composition at 1440×900, the frame that has to
hold. Drawn on Luther Vandross · *Never Too Much*, the richest record in the
collection (every module populated), because a fixed frame is decided by its
fullest case.

**`frame-1440x900.html`** is the drawing's source. Open it directly in a browser
at 1440×900, or re-render it:

    node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});await p.goto('file://'+process.cwd()+'/docs/record-detail/fixed-frame/frame-1440x900.html');await p.waitForTimeout(2500);await p.screenshot({path:'docs/record-detail/fixed-frame/frame-1440x900.png'});await b.close();})()"

It is a DRAWING, not the build: hand-written HTML with the real cover and real
field values, so the composition can be judged before anything is implemented.

## The frame

53px AppHeader + **847px** of grid. Measured, not assumed.

## The three interactive sections, and the answer each gets

| section | answer | why |
|---|---|---|
| image uploader | **cell + interaction elsewhere** — `IMAGES / 1 / MANAGE` | `images_max` is **1**: no record has more than one image. The gallery was built for a case that has never occurred. |
| note editor | **disclosure over the grid** | Only **2 of 17** records have a snippet, and the longest is **745 characters** — a third of the frame for a state 15 of 17 lack. |
| journal form | **cell shows the entry, form is a disclosure** | `journal_max` is **1** and the longest entry is **46 characters**, so one entry fits inline. |

## What is lost, chosen rather than discovered

- **The sparkline.** Price history becomes one figure plus `6 OBSERVATIONS`. Six
  points was a thin sparkline, but the trend is no longer visible at a glance.
- **Writing is one click away rather than present.** Both forms were on-screen.
  An invitation that needs a click gets taken less often.
- **The full matrix/runout is truncated** — and this is the sharpest loss. The
  longest is **454 characters, eight variants**, and SPEC §4 calls it
  user-authoritative: the field that identifies a pressing when catalogue
  numbers agree. A collector comparing a record in hand now needs a click at
  the moment they care most. **This is the one cut that may cost more than it
  buys.**

## The two interactions the constraint forces

**The cover wants MORE, not less.** Sized at 23.4% for a scrolling page; here it
takes five columns across two rows, ~28% of the grid. It is the entry point and
the only thing that identifies the record at a glance — shrinking it to fit more
cells turns the page into a table.

**Always-present modules are the real expense.** In a scrolling page an empty
cell costs nothing. Here Donovan's two diagonals occupy **two of eleven content
cells (~18% of the frame) drawing nothing**; the emptiest record spends ~27%.
§1.4's cell-level rule traded five small marks for two large ones — right in a
scrolling page, expensive in a fixed one.

## Not settled by this drawing

The composition departs from 7a §2's spans (2/8/2 header, then 6/6). Fitting
eleven cells needed **4/3/5, then 4/3, then 4/4/4**. Design should rule on that
rather than the build inheriting it.
