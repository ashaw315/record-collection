# SPEC.md amendment A21 — four texture slots, and the gatefold split

Follow-up to `4b1d21e`.

**This amendment specifies a destructive schema change.** CLAUDE.md §7 requires that to be
flagged and confirmed before it runs. The migration is not part of this amendment — A21
changes the spec only, and the migration belongs to the unit that builds it, after the row
count in §"Before the migration" below has been taken.

---

## Why

The record is a textured object now, and §10b does not say what textures it takes.

It also specifies the gatefold's inner as **one continuous spread** — *"inner artwork mapped
across both"* panels — which is what a real gatefold physically is. In practice that means
photographing an open sleeve as a single wide shot, and it makes the inner the only
non-square image in the collection.

Four square slots is simpler in every direction that matters: two straight-on photographs
rather than one wide one, four textures of identical shape, and every image in the app stays
square.

**The known cost, stated rather than discovered:** a seam down the middle of the open
gatefold, visible wherever the two photographs differ in lighting, white balance or crop. A
single spread would not have one. That is accepted deliberately — a visible seam is honest
about being two photographs, and the alternative asks the user for a shot most phones take
badly.

---

## A21a — §4.2: the `image_type` enum

**REPLACE:**

> | image_type | image_type enum | `'cover' \| 'back' \| 'gatefold' \| 'label' \| 'matrix' \| 'other'` |

**WITH:**

> | image_type | image_type enum | `'cover' \| 'back' \| 'gatefold_left' \| 'gatefold_right' \| 'label' \| 'matrix' \| 'other'` |

**And add beneath the table:**

> **Four of these are textures on the pulled record; the rest are gallery images.** `cover`, `back`, `gatefold_left` and `gatefold_right` are the object's skins (§10b) and are expected to be square. `label`, `matrix` and `other` are photographs of the record that appear in the gallery and are never mapped onto the object — a close-up of the dead wax is evidence about a pressing, not a surface of the sleeve.
>
> `gatefold` was a single value, added before the affordance was built. It became two when the inner was specified as two square photographs rather than one wide spread. Removing an enum value is not possible in place: Postgres requires the type to be replaced, which is a destructive migration and needs confirmation before it runs (CLAUDE.md §7).

---

## A21b — §10b: the four slots

**ADD to the "Pulling a record" subsection, immediately before the gatefold paragraph:**

> **The object takes four textures, all square.** `cover` on the front, `back` on the back, and `gatefold_left` and `gatefold_right` across the two leaves of the open sleeve. Nothing else is mapped onto it.
>
> Square because a 12″ sleeve is square, and because it keeps every image the app stores to one shape — the spine colour already averages a square cover, and a texture of a different aspect either stretches or letterboxes, both of which are the app asserting something about a sleeve that is not true of it.
>
> The inner is **two photographs, not one spread.** A real gatefold inner is continuous, and mapping one wide image across both leaves would be more faithful — but it asks for a photograph most phones take badly, and it makes the inner the only non-square image in the collection. Two straight-on shots are what someone can actually take. The cost is a seam down the middle wherever the two differ in lighting or crop, and that is accepted: a visible seam is honest about being two photographs.

---

## A21c — §10b: the gatefold affordance requires both leaves

**REPLACE:**

> The state exists only where an inner image has been photographed. There is no generated stand-in: the point of a gatefold is the artwork inside it, and opening a sleeve onto a blank or invented inner spread would be inventing the thing the user came to see. A record with no inner image simply has two faces, and nothing suggests otherwise.

**WITH:**

> **The state exists only where both leaves have been photographed.** One is not enough: a hinge that opens onto artwork on one side and a blank on the other invents exactly the thing the user came to see, and it does it in the most conspicuous place possible. §10b's strictest rule is that no affordance appears without a photograph behind it, and a half-filled gatefold is that rule failing through a partial state rather than an empty one.
>
> So the affordance is present when `gatefold_left` and `gatefold_right` both exist, and absent otherwise. A single inner photograph is still stored and still appears in the gallery — it is a real photograph of a real record — it simply does not open the sleeve. A record with no inner images has two faces, and nothing suggests otherwise.
>
> There is no generated stand-in of any kind. The point of a gatefold is the artwork inside it.

---

## A21d — §10b: the back face, now that slots are named

**REPLACE (from A19d):**

> **The faces carry artwork and nothing else.** Where a photographed back exists it is used. Where one does not — which is most records, since Discogs supplies a front cover and nothing more — the back is **a plain sleeve in the record's stored spine colour**, carrying label and catalogue number as a small imprint and nothing further.

**WITH:**

> **The faces carry artwork and nothing else.** Where a `back` photograph exists it is used. Where one does not — which is most records, since Discogs supplies a front cover and nothing more — the back is **a plain sleeve in the record's stored spine colour**, carrying label and catalogue number as a small imprint and nothing further.
>
> The front is the `cover` image. A record with no cover gets a plain sleeve there too, in the same colour, by the same reasoning that gives it a plain spine on the wall: an honest absence rather than a placeholder. Both cases are ordinary and neither is an error state.

---

## Before the migration — measure first

The unit that implements this **takes this count before writing any migration** and reports
it:

```sql
SELECT image_type, count(*) FROM images GROUP BY image_type ORDER BY 1;
```

The `gatefold` value was added by migration 0011 and the affordance was never built, so it
most likely holds zero rows — in which case the type swap carries no data and the decision is
easy. If it holds rows, stop and report the count rather than choosing a mapping: a row
typed `gatefold` could be either leaf and nothing in the data says which.

Do not reason about what the count probably is. NOTES records four separate occasions where
a confident claim about the database was wrong in the direction that flattered the plan.

## Verify

```
grep -n "gatefold" SPEC.md
```

Every hit must be consistent with two leaves and with both being required for the affordance.
Report the count and classification.

Then read §10b's "Pulling a record" end to end and answer: **is it now unambiguous what
image goes where, and what happens when each one is missing?**

## Commit

```
git add SPEC.md
git commit -m "SPEC: A21, four square texture slots and the gatefold split"
```

Then stop. The migration and the first three.js unit are separate.
