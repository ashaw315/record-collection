# SPEC.md amendment A19 — the pulled record moves to three.js, and the copy comes off it

Follow-up to A18 (`e502bda`). **A18 reversed the renderer decision; this reverses it back,
for a different reason.** That is not thrash — the reason has changed, and it is worth being
precise about how, because the record of this decision is now three amendments long.

**Anchor note.** Unlike A15–A18, these anchors could not be extracted by execution — they
are the replacement text A18 introduced, quoted from the amendment that wrote it. They
should match exactly. **If any does not, stop and quote what is there instead**; it means
A18 landed differently from how it was specified.

---

## Why this reverses A18

A18 was decided on the right evidence and answered a narrower question than the one that
mattered.

Units 10–13 established that CSS can do the *motion*: the rise from a measured slot, a
limited pointer-driven tilt with absolute mapping, a true two-sided flip once the record
became a box. None of that is retracted, and the half-turn cost really was retired.

**What QA found is that correct motion is not the same as a convincing object.** On screen
the pulled record read as a skewed panel: the back face carrying metadata in its top third
over a large empty field, the surface flat-lit so that rotation had no detail to act on, and
the controls floating beside it rather than belonging to it. The geometry was right and the
thing was not.

The design that resolves it is not "the same thing, rendered better". It is a different
allocation of what goes where:

> **The object carries only artwork. Every fact lives in a panel beside it.**

That single move does three things at once, which is why it is worth a renderer when
lighting alone was not. It removes the metadata that made the back face read as a form; it
gives the tilt a printed surface to act on, which is what makes a rotation read as an object
rather than a skew; and it makes real lighting worth having, because there is now something
for light to fall across.

**Lighting is the part CSS genuinely cannot do**, and it is not a polish argument. A face
that shades as it turns, an edge that catches, a shadow the record casts back onto the wall
— these respond to angle, and a CSS gradient does not. It is a large part of why the
reference reads as a physical case. That gap was invisible while the faces were empty dark
panels, because there was nothing for light to reveal.

**What A18 got right and stands:** the failures that originally motivated `three.js` were a
discrete face swap fighting an animation, not evidence about the medium. The medium argument
is being made here on different grounds — surface, light and depth — rather than on
coordination.

**The cost, recorded rather than discovered later:** the rise must map a DOM rect into world
coordinates and keep it correct across scroll, resize and re-wrap. A18 named this as the
reason to refuse WebGL. It is now a problem to solve rather than a reason to refuse, and it
is the hardest part of the work.

---

## A19a — §2: three is adopted

**REPLACE:**

> | 3D | None. The pulled record is CSS transforms under `preserve-3d` (§10b). `three` was specified and then not adopted — the reasoning is in §10b and it was settled by building the flat version. |

**WITH:**

> | 3D | `three` — the pulled record only (§10b). The shelf stays CSS. Adopted after the flat version was built and judged: the motion was right and the object was not, and lighting across a printed surface is the part CSS cannot do. |

---

## A19b — §10b's intro

**REPLACE:**

> Inspired by thecriterioncloset.com, and worth being explicit about what is borrowed: a wall of spines in perspective, a crosshair that names what you are aimed at, and a case that comes off the shelf and can be turned. What is **not** borrowed is the 3D engine — not for the wall, and, after measurement, not for the record either.
>
> One thing the reference settles that this spec previously got wrong: **its case does not flip.** It turns perhaps 15–20° off face-on, enough to show the case has thickness, never enough to reveal a back. Its own copy reads *"Move the mouse to turn it · click to put it back."* Turning the record over to read its back is this app's own design, not something taken from the reference, and the two motions are separate here for that reason.

**WITH:**

> Inspired by thecriterioncloset.com, and worth being explicit about what is borrowed: a wall of spines in perspective, a crosshair that names what you are aimed at, a case that comes off the shelf and can be turned, and — the part that took longest to see — **an object that carries nothing but artwork, with every fact in panels beside it.**
>
> The 3D engine is borrowed for the record and deliberately not for the wall. The wall is flat, so CSS is right for it; the record is a printed object you turn under light, and it is not.
>
> One thing the reference settles that this spec previously got wrong: **its case does not flip.** It turns perhaps 15–20° off face-on, enough to show the case has thickness, never enough to reveal a back. Its own copy reads *"Move the mouse to turn it · click to put it back."* Turning the record over to read its back is this app's own design, not something taken from the reference, and the two motions are separate here for that reason.

---

## A19c — §10b: the renderer paragraph

**REPLACE the whole of A18's replacement**, from `**Rendered in CSS, like the shelf —
decided by building it.**` through the paragraph ending `...the same way it was closed with
this.`

**WITH:**

> **Rendered in 3D (`three.js`), unlike the shelf — decided by building the flat version and looking at it.** This decision has been made three times and the record of it is worth keeping, because each turn rested on different evidence.
>
> It was first specified as `three.js` on the strength of two failed CSS flip attempts. That inference was wrong: those failures were a *discrete face swap* fighting an animation — a flag saying which face was showing, and a midpoint React and the compositor disagreed about — and they said nothing about the medium. Splitting the motion into a pointer-driven tilt and a deliberate click removed the state that failed, and the CSS version that followed wanted no flag, no coordinator, and no shared duration. On that evidence the decision was reversed to CSS.
>
> **Then it was looked at, and the motion turned out not to be the problem.** The record read as a skewed panel: metadata crammed into the top third of an otherwise empty back face, a flat-lit surface with no detail for the rotation to act on, and controls floating beside the object rather than belonging to it. Every motion was correct and the object was not convincing.
>
> What resolves it is the allocation, not the renderer alone: **the object carries only artwork, and every fact moves to a panel beside it.** That removes what made the back read as a form, gives the tilt a printed surface to act on, and makes real lighting worth having — a face that shades as it turns, an edge that catches, a shadow cast back onto the wall. Those respond to angle, and CSS cannot do them at any level of care.
>
> **The known cost.** The record rises out of a spine that is a flex child in a wrapping CSS row, so the renderer must map a DOM rect into world coordinates and keep that mapping correct across scroll, resize and re-wrap. That is a number two systems share, and it is the hardest part of this work rather than an incidental detail.

---

## A19d — §10b: the back face

**REPLACE:**

> **The back face is never empty.** Most records will have a front cover from Discogs and nothing else for a long time. Rather than a blank or a placeholder image, the back renders what is known: label and catalogue number set as an imprint, pressing details as body text, purchase information last and quieter. That is close to what a real back sleeve carries, and it means every record is a two-sided object from the day it is entered.
>
> Where a photographed back exists, it is used instead, with the same details beside it.

**WITH:**

> **The faces carry artwork and nothing else.** Where a photographed back exists it is used. Where one does not — which is most records, since Discogs supplies a front cover and nothing more — the back is **a plain sleeve in the record's stored spine colour**, carrying label and catalogue number as a small imprint and nothing further.
>
> That is honest in the way the plain spine is honest: it does not invent a back that was never photographed, it reuses a colour already computed from the record's own cover, and a plain back is a real thing rather than a placeholder. Repeating the front would assert something false, and a stock sleeve texture would be a photograph of someone else's record.
>
> An earlier version of this section had the back rendering pressing details, condition and purchase information as body text. Built and looked at, that read as a form rather than a sleeve — metadata in the top third of a large empty field. Those facts have not been dropped; they have moved to the panel below, which is where the reference puts them and where they can actually be read.

---

## A19e — §10b: the panels

**ADD immediately after A19d's replacement:**

> **The facts live in fixed panels beside the record.** Artist, title, year, label, catalogue number, pressing details, condition, and purchase information — laid out beside the object, static while it turns, as the reference does. They do not track the record's geometry and never need to agree with it about anything.
>
> This is what makes the object worth rendering: with the copy off it, the faces are printed artwork and the rotation has something to be a rotation *of*.
>
> **The panels are DOM, not canvas.** A canvas has no text, so the panel is the only channel a screen reader or a test can read — and this is the same distinction the spine already draws, where the visible glyphs are clipped to fit and the accessible name carries the whole title. Facts that matter belong where they can be read by something other than an eye.
>
> The controls belong with the record rather than floating beside it. A control row that does not participate in the object's arrival undercuts the continuity the rise exists to establish.

---

## A19f — §10b: the snippet moves too

**REPLACE:**

> **A short generated note about the album, stored on the record.** Two or three sentences — what it is, when it landed, why it matters. It sits on the back face, where liner notes would be.

**WITH:**

> **A short generated note about the album, stored on the record.** Two or three sentences — what it is, when it landed, why it matters. It sits in the panel beside the record, with the other facts, for the same reason they do: the faces carry artwork only.

---

## Verify

```
grep -n "three\|Rendered in" SPEC.md
grep -n "back face\|back sleeve\|panel" SPEC.md
```

Report the count and the classification. Then read §10b's "Pulling a record" section end to
end and answer: **does it describe one coherent object, or are there sentences left over
from the version where the back face carried text?**

## Commit

```
git add SPEC.md
git commit -m "SPEC: A19, the record moves to three.js and the copy comes off it"
```

Then stop. The first three.js unit is separate.
