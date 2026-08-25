# SPEC.md amendment A22 — covers are not square, and the spec assumes they are

Follow-up to unit 15 (`/plane`). Anchor is A21b's text.

## Why

§10b says the four texture slots "are expected to be square". That reads as a specification
and is actually an assumption about data the app does not control. Unit 15 measured it:
Grave New World's cover is **591×599**, and Discogs supplies whatever a contributor uploaded.
Most imported covers will be near-square and some will not be square at all.

The assumption is currently invisible: `object-cover` crops on the wall, and the texture map
stretches across the plane, so the same file gets two different treatments and nothing says
so.

## A22 — REPLACE

> Square because a 12″ sleeve is square, and because it keeps every image the app stores to one shape — the spine colour already averages a square cover, and a texture of a different aspect either stretches or letterboxes, both of which are the app asserting something about a sleeve that is not true of it.

## WITH

> Square because a 12″ sleeve is square. **The stored images frequently are not**, and that is measured rather than assumed: Discogs serves whatever a contributor uploaded, and the first cover checked was 591×599.
>
> **A non-square image is cropped to square from its centre when it is mapped onto the object**, matching what the wall already does with `object-cover`. The alternative — fitting the whole image and letterboxing the remainder — puts a border on a record that has none, which is the app asserting something false about a physical object; and filling that border with the spine colour, considered and rejected, invents a sleeve edge that was never photographed.
>
> Cropping loses artwork at the edges. That is a real cost and it is the right one: a sleeve photographed slightly off-square loses a few pixels of its own border, where a letterboxed one gains a band that belongs to no record.
>
> **The crop happens at mapping time, not on the stored file.** The image in the gallery is the whole photograph, unmodified — it is the user's data (§7.8) and the object's needs are not a reason to alter it. In practice that means adjusting the texture's UV mapping rather than re-processing bytes.

## Verify

```
grep -n "square" SPEC.md
```

Classify every hit. Then answer: **is it now clear what happens to an image that is not
square, and where that transformation takes place?**

## Commit

```
git add SPEC.md
git commit -m "SPEC: A22, non-square covers are cropped at mapping time"
```
